// Portfolio Watch — Profile Feed v2 (rigorous adaptive baselines)
// Per holding: EWMA(0.94) vol, robust 1.4826*MAD floor, OLS beta vs SPY,
// residual/idiosyncratic vol sigma_eps (correct denominator for z_idio),
// avg volume, 52w range. Cold-start (bars<20): sector-benchmark prior +
// shrinkage weight. Change HOLDINGS and re-run to re-fit any portfolio.

const { Feed, feedPath, makeDoc, str, num, bool } = require("@alva/feed");
const http = require("net/http");
const secret = require("secret-manager");
const alfs = require("alfs");
const env = require("env");

// Watched holdings are a USER-OWNED config, not hardcoded — the Agent edits it on
// request ("also watch COIN" / "stop watching TSLA") and the feed reads it each run.
const DEFAULT_HOLDINGS = [
  { symbol: "NVDA", weight: 0.25, name: "NVIDIA", sector: "Semiconductors" },
  { symbol: "TSLA", weight: 0.25, name: "Tesla", sector: "Autos/EV" },
  { symbol: "AAPL", weight: 0.25, name: "Apple", sector: "Hardware" },
];
async function loadHoldings() {
  try {
    const raw = await alfs.readFile("/alva/home/" + env.username + "/feeds/pw-config/v1/holdings.json");
    const cfg = JSON.parse(String(raw));
    if (cfg && Array.isArray(cfg.holdings) && cfg.holdings.length) return cfg.holdings;
  } catch (e) { /* no config yet → default */ }
  return DEFAULT_HOLDINGS;
}
const BENCH = "SPY"; // market benchmark
const N_MIN = 20; // cold-start threshold (trading days)
const LAMBDA = 0.94; // RiskMetrics EWMA decay
const M_PRIOR = 2.0; // single-name dispersion multiplier vs benchmark vol

const BASE = "https://data-tools.prd.space.id";
const JWT = secret.loadPlaintext("ARRAYS_JWT");
const H = { headers: { Authorization: "Bearer " + JWT } };

async function getJson(url) {
  const r = await http.fetch(url, H);
  if (r.status !== 200) throw new Error("HTTP " + r.status + " " + url);
  const j = JSON.parse(await r.text());
  if (!j || j.success !== true || !Array.isArray(j.data))
    throw new Error("bad shape " + url);
  return j.data;
}
async function dailyBars(symbol, days) {
  const now = Math.floor(Date.now() / 1000);
  const url =
    BASE +
    "/api/v1/stocks/kline?symbol=" +
    symbol +
    "&interval=1d&session=RTH&limit=" +
    days +
    "&start_time=" +
    (now - Math.ceil(days * 1.7) * 86400) +
    "&end_time=" +
    now;
  return (await getJson(url)).slice().reverse(); // oldest-first
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
function stdev(a) {
  if (a.length < 2) return null;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
}
function median(a) {
  const b = a.slice().sort((x, y) => x - y);
  const n = b.length;
  return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2;
}
function mad(a) {
  const med = median(a);
  return median(a.map((x) => Math.abs(x - med)));
}
// EWMA volatility: sigma^2_t = λ sigma^2_{t-1} + (1-λ) r^2_{t-1}
function ewmaVol(rets) {
  if (rets.length < 5) return null;
  let v = stdev(rets.slice(0, Math.min(20, rets.length))) ** 2; // seed
  for (let i = 0; i < rets.length; i++) v = LAMBDA * v + (1 - LAMBDA) * rets[i] * rets[i];
  return Math.sqrt(v);
}
// OLS beta + residual (idiosyncratic) vol from aligned returns
function betaResid(ri, rm) {
  const n = Math.min(ri.length, rm.length);
  const a = ri.slice(ri.length - n),
    b = rm.slice(rm.length - n);
  const ma = mean(a),
    mb = mean(b);
  let cov = 0,
    varm = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i] - ma) * (b[i] - mb);
    varm += (b[i] - mb) * (b[i] - mb);
  }
  const beta = varm > 0 ? cov / varm : 1;
  const alpha = ma - beta * mb;
  const resid = a.map((x, i) => x - alpha - beta * b[i]);
  return { beta, sigma_eps: stdev(resid) };
}
function retsOf(bars) {
  const r = [];
  for (let i = 1; i < bars.length; i++)
    r.push((bars[i].price_close - bars[i - 1].price_close) / bars[i - 1].price_close);
  return r;
}

(async () => {
  const HOLDINGS = await loadHoldings();
  const totalW = HOLDINGS.reduce((a, h) => a + (h.weight || 0), 0) || 1;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const recDate = startOfDay.getTime();

  // benchmark returns, keyed by bar close date for alignment
  const spy = await dailyBars(BENCH, 200);
  const spyByDate = {};
  for (let i = 1; i < spy.length; i++)
    spyByDate[spy[i].time_close] =
      (spy[i].price_close - spy[i - 1].price_close) / spy[i - 1].price_close;
  const spyRets = retsOf(spy);
  const sigmaBench = ewmaVol(spyRets) || stdev(spyRets);

  const records = [];
  for (const h of HOLDINGS) {
    const bars = await dailyBars(h.symbol, 260);
    const nbars = bars.length;
    const closes = bars.map((b) => b.price_close);
    const vols = bars.map((b) => b.volume_traded);
    const rets = retsOf(bars);
    const last = (arr, n) => arr.slice(Math.max(0, arr.length - n));

    // align holding returns with benchmark by date
    const ri = [],
      rm = [];
    for (let i = 1; i < bars.length; i++) {
      const m = spyByDate[bars[i].time_close];
      if (m != null) {
        ri.push((closes[i] - closes[i - 1]) / closes[i - 1]);
        rm.push(m);
      }
    }

    const coldStart = nbars < N_MIN;
    let sigma_ewma, sigma_mad, beta, sigma_eps, w_shrink;
    if (!coldStart) {
      sigma_ewma = ewmaVol(rets);
      sigma_mad = 1.4826 * mad(last(rets, 60));
      const br = betaResid(last(ri, 120), last(rm, 120));
      beta = br.beta;
      sigma_eps = br.sigma_eps;
      w_shrink = 1;
    } else {
      // Cold start: sector-benchmark prior + shrinkage toward sample as n grows
      w_shrink = Math.max(0, Math.min(1, nbars / N_MIN));
      const sPrior = M_PRIOR * sigmaBench; // σ̂⁽⁰⁾ = m · σ_bench
      const sSample = rets.length >= 3 ? stdev(rets) : sPrior;
      sigma_ewma = w_shrink * sSample + (1 - w_shrink) * sPrior;
      sigma_mad = sigma_ewma;
      beta = 1.0; // sector-median seed
      sigma_eps = Math.sqrt(Math.max(sigma_ewma ** 2 - beta * beta * sigmaBench ** 2, (0.5 * sigma_ewma) ** 2));
    }

    records.push({
      date: recDate,
      symbol: h.symbol,
      name: h.name || h.symbol,
      sector: h.sector || "",
      asset_type: "equity",
      weight: (h.weight || 1 / HOLDINGS.length) / totalW,
      sigma_ewma,
      sigma_mad,
      sigma_base: Math.max(sigma_ewma, sigma_mad), // z_tot denominator
      sigma_eps, // z_idio denominator
      beta,
      avg_vol_20d: mean(last(vols, 20)),
      week52_high: Math.max(...bars.map((b) => b.price_high)),
      week52_low: Math.min(...bars.map((b) => b.price_low)),
      last_close: closes[closes.length - 1],
      bars_used: nbars,
      cold_start: coldStart,
      shrink_w: w_shrink,
      sigma_bench: sigmaBench,
    });
  }

  const feed = new Feed({
    path: feedPath("pw-profile"),
    name: "Portfolio Watch — Profile",
    description:
      "Adaptive per-holding baseline: EWMA + MAD vol, OLS beta, residual (idiosyncratic) vol, cold-start prior.",
  });
  feed.def("profile", {
    holdings: makeDoc("Holdings Baseline", "Relative-threshold baseline", [
      str("symbol"),
      str("name"),
      str("sector"),
      str("asset_type"),
      num("weight"),
      num("sigma_ewma"),
      num("sigma_mad"),
      num("sigma_base"),
      num("sigma_eps"),
      num("beta"),
      num("avg_vol_20d"),
      num("week52_high"),
      num("week52_low"),
      num("last_close"),
      num("bars_used"),
      bool("cold_start"),
      num("shrink_w"),
      num("sigma_bench"),
    ]),
  });
  await feed.run(async (ctx) => {
    await ctx.self.ts("profile", "holdings").append(records);
  });

  return { built: records.length, sample: records[0] };
})();
