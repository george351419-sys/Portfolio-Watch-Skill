// Portfolio Watch — Signal ABLATION study
// Question Codex raised: "the backtest proves residual-σ price routing has signal,
// but how much does each *layer* add?" This isolates the marginal effect of each
// gate on ALERT VOLUME and quality — which is the product's actual claim
// (signal-to-noise / attention routing), not price prediction.
//
// Layers (cumulative), evaluated on pooled stock-days (MAG7 + 20 untuned names,
// one random 400-day window per symbol, point-in-time baselines):
//   L0  total-σ ≥ T                       naive "any big move"
//   L1  residual-σ ≥ T                    idiosyncratic gate (strip market β)
//   L2  residual-σ ≥ T  AND  rvol ≥ 1.5   volume confirmation
//   L3  L2 + fusion                       collapse consecutive same-symbol flags → 1
// Metrics @ T=2.5: alerts per 1000 days, precision & lift on forward continuation,
// and duplicate rate (the noise fusion removes). Plus a targeted THESIS eval:
// MSTR-vs-BTC divergence catches breaks the market-β model misses.
//
// HONEST framing: forward-continuation precision rewards momentum the product
// deliberately suppresses, so L1 need not beat L0 on precision — the win shows up
// as alert-volume and duplicate reduction. A full news/earnings-aligned event
// study is specced (historical earnings dates are not reliably available via the
// current endpoints); see Backtest-Report.md.

const http = require("net/http");
const secret = require("secret-manager");
const JWT = secret.loadPlaintext("ARRAYS_JWT");
const H = { headers: { Authorization: "Bearer " + JWT } };
const BASE = "https://data-tools.prd.space.id";

const LOOKBACK = 60, VOLWIN = 20, FWD = 3, WIN = 400, K_CONT = 1.0;
const T = 2.5, RVOL_MIN = 1.5;
const THRS = []; for (let t = 1.5; t <= 3.51; t += 0.5) THRS.push(Math.round(t * 100) / 100);

const MAG7 = ["NVDA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "TSLA"];
const NEW20 = ["JPM", "GS", "XOM", "CVX", "JNJ", "PFE", "UNH", "WMT", "HD", "KO",
  "PG", "DIS", "NFLX", "BA", "CAT", "NKE", "V", "CRM", "INTC", "AMD"];
const STOCKS = MAG7.concat(NEW20);

async function getJson(url) {
  const r = await http.fetch(url, H);
  if (r.status !== 200) throw new Error("HTTP " + r.status + " " + url);
  const j = JSON.parse(await r.text());
  if (!j || j.success !== true || !Array.isArray(j.data)) throw new Error("bad shape " + url);
  return j.data;
}
async function bars(sym, type, years) {
  const now = Math.floor(Date.now() / 1000);
  const start = now - Math.ceil(years * 372) * 86400;
  const url = type === "crypto"
    ? BASE + "/api/v1/crypto/binance/spot/usdt/kline?symbol=" + sym + "&interval=1d&start_time=" + start + "&end_time=" + now + "&limit=10000"
    : BASE + "/api/v1/stocks/kline?symbol=" + sym + "&interval=1d&session=RTH&start_time=" + start + "&end_time=" + now + "&limit=10000";
  const d = (await getJson(url)).slice().reverse();
  return d.map((b) => ({ date: (b.time_period_start || "").slice(0, 10), close: b.price_close, vol: b.volume_traded || b.volume || null }))
    .filter((b) => b.close != null);
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
function stdev(a) { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); }

async function series(sym, type, benchMap) {
  const b = await bars(sym, type, 5.2);
  const rows = [];
  for (let i = 1; i < b.length; i++) {
    const ret = (b[i].close - b[i - 1].close) / b[i - 1].close;
    rows.push({ date: b[i].date, ret, vol: b[i].vol, bench: benchMap ? (benchMap[b[i].date] ?? null) : null });
  }
  return rows;
}
function retMap(rows) { const m = {}; rows.forEach((r) => (m[r.date] = r.ret)); return m; }

// per-day records: zt, zi, rvol, cont  (point-in-time; baseline strictly before t)
function evalDays(sym, rows, idxs) {
  const recs = [];
  for (const i of idxs) {
    if (i - LOOKBACK < 0 || i + FWD >= rows.length) continue;
    const win = rows.slice(i - LOOKBACK, i);
    const sigma = stdev(win.map((r) => r.ret));
    if (!sigma) continue;
    const ret_t = rows[i].ret, zt = ret_t / sigma;
    let zi = zt;
    const pairs = win.filter((r) => r.bench != null);
    if (pairs.length >= 30 && rows[i].bench != null) {
      const a = pairs.map((r) => r.ret), m = pairs.map((r) => r.bench);
      const ma = mean(a), mm = mean(m);
      let cov = 0, vm = 0;
      for (let k = 0; k < a.length; k++) { cov += (a[k] - ma) * (m[k] - mm); vm += (m[k] - mm) ** 2; }
      const beta = vm > 0 ? cov / vm : 1;
      const seps = stdev(a.map((x, k) => x - beta * m[k])) || sigma;
      zi = (ret_t - beta * rows[i].bench) / seps;
    }
    const vwin = rows.slice(i - VOLWIN, i).map((r) => r.vol).filter((v) => v != null);
    const rvol = vwin.length && rows[i].vol != null ? rows[i].vol / mean(vwin) : null;
    let fwd = 1; for (let k = 1; k <= FWD; k++) fwd *= 1 + rows[i + k].ret; fwd -= 1;
    const cont = Math.sign(fwd) === Math.sign(ret_t) && Math.abs(fwd) >= K_CONT * sigma;
    recs.push({ sym, idx: i, zt: Math.abs(zt), zi: Math.abs(zi), rvol, cont });
  }
  return recs;
}

// a flag is a DUPLICATE if the same symbol was flagged on the immediately prior
// evaluated day; fusion collapses each consecutive run to one alert.
function fuse(recs, pass) {
  const bySym = {};
  recs.forEach((r) => { (bySym[r.sym] = bySym[r.sym] || []).push(r); });
  let flags = 0, alerts = 0, tpAlerts = 0;
  for (const s in bySym) {
    const arr = bySym[s].sort((a, b) => a.idx - b.idx);
    let prevFlag = false, prevIdx = -99;
    for (const r of arr) {
      const f = pass(r);
      if (f) {
        flags++;
        const consecutive = prevFlag && r.idx - prevIdx === 1;
        if (!consecutive) { alerts++; if (r.cont) tpAlerts++; }
        prevFlag = true; prevIdx = r.idx;
      } else { prevFlag = false; }
    }
  }
  return { flags, alerts, tpAlerts, dup_rate: flags ? +(1 - alerts / flags).toFixed(3) : 0 };
}

function layer(recs, pass, name) {
  const flagged = recs.filter(pass);
  const tp = flagged.filter((r) => r.cont).length;
  const base = recs.filter((r) => r.cont).length / recs.length;
  const precision = flagged.length ? tp / flagged.length : null;
  const f = fuse(recs, pass);
  return {
    layer: name,
    alerts_raw: flagged.length,
    alerts_per_1000d: +(flagged.length / recs.length * 1000).toFixed(1),
    precision: precision == null ? null : +precision.toFixed(3),
    lift: precision ? +(precision / base).toFixed(2) : null,
    dup_rate: f.dup_rate,
    alerts_after_fusion: f.alerts,
    fusion_reduction_pct: f.flags ? +((1 - f.alerts / f.flags) * 100).toFixed(0) : 0,
  };
}

let seed = 20260706;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

(async () => {
  const spy = retMap(await series("SPY", "stock", null));

  // ---- price/volume/fusion ablation on the stock cohort ----
  let pooled = [];
  const perWin = [];
  for (const sym of STOCKS) {
    let rows;
    try { rows = await series(sym, "stock", spy); } catch (e) { continue; }
    const N = rows.length, lo = LOOKBACK + 1, hi = N - WIN - FWD - 1;
    if (hi <= lo) continue;
    const start = lo + Math.floor(rnd() * Math.max(1, hi - lo));
    const idx = []; for (let i = start; i < start + WIN; i++) idx.push(i);
    const recs = evalDays(sym, rows, idx);
    pooled = pooled.concat(recs);
    perWin.push({ symbol: sym, window: rows[start].date + " → " + rows[start + WIN - 1].date, n_days: recs.length });
  }
  const base = pooled.filter((r) => r.cont).length / pooled.length;
  const rv = (r) => r.rvol == null || r.rvol >= RVOL_MIN;
  const ablation = [
    layer(pooled, (r) => r.zt >= T, "L0 total-σ ≥ 2.5 (naive)"),
    layer(pooled, (r) => r.zi >= T, "L1 residual-σ ≥ 2.5 (idiosyncratic gate)"),
    layer(pooled, (r) => r.zi >= T && rv(r), "L2 + volume confirm (rvol ≥ 1.5)"),
    layer(pooled, (r) => r.zi >= T && rv(r), "L3 + fusion (see alerts_after_fusion)"),
  ];
  // threshold sweep for L1 vs L2 (shows the volume gate's precision/volume tradeoff)
  const sweep = THRS.map((t) => ({
    thr: t,
    L1_residual: layer(pooled, (r) => r.zi >= t, "L1"),
    L2_resid_vol: layer(pooled, (r) => r.zi >= t && rv(r), "L2"),
  }));

  // ---- targeted THESIS eval: MSTR-vs-BTC divergence vs MSTR-vs-SPY residual ----
  const btc = retMap(await series("BTC", "crypto", null));
  const mstrRows = await series("MSTR", "stock", spy);   // for zi vs SPY
  const mstrRowsB = await series("MSTR", "stock", btc);   // for thesis vs BTC
  const recSPY = evalDays("MSTR", mstrRows, mstrRows.map((_, i) => i));
  const recBTC = evalDays("MSTR", mstrRowsB, mstrRowsB.map((_, i) => i));
  const ziSPY = {}; recSPY.forEach((r) => (ziSPY[r.idx] = r.zi));
  let thesisOnly = 0, both = 0, marketOnly = 0, thesisFlags = 0;
  recBTC.forEach((r) => {
    const thesis = r.zi >= T;            // large residual vs the BTC thesis benchmark
    const market = (ziSPY[r.idx] || 0) >= T; // would the market-β model have flagged it?
    if (thesis) thesisFlags++;
    if (thesis && !market) thesisOnly++;
    else if (thesis && market) both++;
    else if (!thesis && market) marketOnly++;
  });

  return {
    config: { cohort: STOCKS, n_symbols: STOCKS.length, window_days: WIN, lookback: LOOKBACK,
      vol_window: VOLWIN, forward: FWD, k_cont: K_CONT, threshold: T, rvol_min: RVOL_MIN,
      ground_truth: "forward T+1..T+3 same-direction cumulative move >= 1.0*trailing_sigma", seed: 20260706 },
    pooled_n_days: pooled.length, base_rate: +base.toFixed(3),
    ablation,
    note: "L3 = L2 with consecutive same-symbol flags fused; read alerts_after_fusion & fusion_reduction_pct.",
    threshold_sweep: sweep,
    thesis_eval: {
      symbol: "MSTR", benchmark_thesis: "BTC", benchmark_market: "SPY", n_days: recBTC.length,
      thesis_flags: thesisFlags, thesis_only_not_market: thesisOnly, both, market_only: marketOnly,
      reading: "thesis_only = days a leverage-thesis break is large vs BTC but the market-β model would NOT have flagged it → unique P0 coverage the price-only pipeline misses.",
    },
    per_symbol_windows: perWin,
  };
})();
