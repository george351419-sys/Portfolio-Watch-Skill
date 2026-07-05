// Portfolio Watch — Historical backtest / precision-recall calibration
// Universe: Mag7 + BTC/LTC, 5y daily. Per-symbol RANDOM 30-day test window.
// Point-in-time: baseline uses days strictly BEFORE t; ground truth uses T+1..T+3.
// Signal = |z_idio| >= thr (residual vol). Ground truth = forward continuation.
// Also evaluates full 5y history (robustness) and total-sigma z (rigor comparison).

const http = require("net/http");
const secret = require("secret-manager");
const JWT = secret.loadPlaintext("ARRAYS_JWT");
const H = { headers: { Authorization: "Bearer " + JWT } };
const BASE = "https://data-tools.prd.space.id";

const LOOKBACK = 60, FWD = 3, WIN = 400;
const K_CONT = 1.0; // forward continuation must be >= 1.0 * trailing sigma
const THRS = [];
for (let t = 0.5; t <= 4.01; t += 0.25) THRS.push(Math.round(t * 100) / 100);

const MAG7 = ["NVDA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "TSLA"];
// 20 cross-sector stocks the strategy was NOT tuned on (reusability test)
const NEW20 = ["JPM", "GS", "XOM", "CVX", "JNJ", "PFE", "UNH", "WMT", "HD", "KO",
  "PG", "DIS", "NFLX", "BA", "CAT", "NKE", "V", "CRM", "INTC", "AMD"];
const UNIVERSE = MAG7.map((s) => ({ sym: s, type: "stock", bench: "SPY", cohort: "mag7" }))
  .concat(NEW20.map((s) => ({ sym: s, type: "stock", bench: "SPY", cohort: "new20" })))
  .concat([{ sym: "BTC", type: "crypto", bench: null, cohort: "crypto" },
           { sym: "LTC", type: "crypto", bench: "BTC", cohort: "crypto" }]);

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
  const d = (await getJson(url)).slice().reverse(); // oldest-first
  // normalize fields (stocks: time_close/price_close ; crypto: time_open? uses time_open/price_close?)
  return d.map((b) => ({
    t: b.time_close || b.time_open,
    date: (b.time_period_start || "").slice(0, 10),
    close: b.price_close,
  })).filter((b) => b.close != null);
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
function stdev(a) { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); }

// build per-symbol series with returns + aligned benchmark returns
async function series(u, benchMap) {
  const b = await bars(u.sym, u.type, 5.2);
  const rows = [];
  for (let i = 1; i < b.length; i++) {
    const ret = (b[i].close - b[i - 1].close) / b[i - 1].close;
    const br = benchMap ? benchMap[b[i].date] : null;
    rows.push({ date: b[i].date, ret, bench: br == null ? null : br });
  }
  return rows;
}
function retMap(rows) { const m = {}; rows.forEach((r) => (m[r.date] = r.ret)); return m; }

// evaluate a set of day-indices; returns records {zi, zt, cont}
function evalDays(rows, idxs) {
  const recs = [];
  for (const i of idxs) {
    if (i - LOOKBACK < 0 || i + FWD >= rows.length) continue;
    const win = rows.slice(i - LOOKBACK, i);
    const rets = win.map((r) => r.ret);
    const sigma = stdev(rets);
    if (!sigma) continue;
    const ret_t = rows[i].ret;
    const zt = ret_t / sigma;
    // idiosyncratic (if benchmark present on enough trailing days)
    let zi = zt;
    const pairs = win.filter((r) => r.bench != null);
    if (pairs.length >= 30 && rows[i].bench != null) {
      const a = pairs.map((r) => r.ret), m = pairs.map((r) => r.bench);
      const ma = mean(a), mm = mean(m);
      let cov = 0, vm = 0;
      for (let k = 0; k < a.length; k++) { cov += (a[k] - ma) * (m[k] - mm); vm += (m[k] - mm) ** 2; }
      const beta = vm > 0 ? cov / vm : 1;
      const resid = a.map((x, k) => x - beta * m[k]);
      const seps = stdev(resid) || sigma;
      zi = (ret_t - beta * rows[i].bench) / seps;
    }
    // forward continuation ground truth
    let fwd = 1;
    for (let k = 1; k <= FWD; k++) fwd *= 1 + rows[i + k].ret;
    fwd -= 1;
    const cont = Math.sign(fwd) === Math.sign(ret_t) && Math.abs(fwd) >= K_CONT * sigma;
    recs.push({ zi: Math.abs(zi), zt: Math.abs(zt), cont });
  }
  return recs;
}

function prCurve(recs, key) {
  const base = recs.filter((r) => r.cont).length / recs.length;
  const curve = THRS.map((thr) => {
    const flagged = recs.filter((r) => r[key] >= thr);
    const tp = flagged.filter((r) => r.cont).length;
    const totalPos = recs.filter((r) => r.cont).length;
    const precision = flagged.length ? tp / flagged.length : null;
    const recall = totalPos ? tp / totalPos : null;
    const f1 = precision && recall ? (2 * precision * recall) / (precision + recall) : null;
    return { thr, n_flagged: flagged.length, precision, recall, f1, lift: precision ? precision / base : null };
  });
  return { base_rate: base, curve };
}

// simple seeded PRNG for reproducible windows
let seed = 20260705;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

(async () => {
  const spy = retMap(await series({ sym: "SPY", type: "stock" }, null));
  const btc = retMap(await series({ sym: "BTC", type: "crypto" }, null));

  const perSymbol = [];
  const byCohort = { mag7: [], new20: [], crypto: [] };
  let pooledAll = [], pooledFull = [];
  for (const u of UNIVERSE) {
    const bmap = u.bench === "SPY" ? spy : u.bench === "BTC" ? btc : null;
    const rows = await series(u, bmap);
    const N = rows.length;
    const lo = LOOKBACK + 1, hi = N - WIN - FWD - 1;
    if (hi <= lo) { perSymbol.push({ symbol: u.sym, cohort: u.cohort, window: "insufficient history", n_days: 0 }); continue; }
    const startWin = lo + Math.floor(rnd() * Math.max(1, hi - lo));
    const winIdx = []; for (let i = startWin; i < startWin + WIN; i++) winIdx.push(i);
    const fullIdx = []; for (let i = lo; i < N - FWD - 1; i++) fullIdx.push(i);

    const winRecs = evalDays(rows, winIdx);
    byCohort[u.cohort] = byCohort[u.cohort].concat(winRecs);
    pooledAll = pooledAll.concat(winRecs);
    pooledFull = pooledFull.concat(evalDays(rows, fullIdx));

    const fl = winRecs.filter((r) => r.zi >= 2.5).length;
    perSymbol.push({
      symbol: u.sym, cohort: u.cohort,
      window: rows[startWin] ? rows[startWin].date + " → " + rows[startWin + WIN - 1].date : "",
      n_days: winRecs.length, n_events: winRecs.filter((r) => r.cont).length,
      flagged_2_5: fl, tp_2_5: winRecs.filter((r) => r.zi >= 2.5 && r.cont).length,
      precision_2_5: fl ? +(winRecs.filter((r) => r.zi >= 2.5 && r.cont).length / fl).toFixed(3) : null,
    });
  }

  const safe = (a) => (a.length ? a : [{ zi: 0, zt: 0, cont: false }]);
  return {
    config: { universe: UNIVERSE.map((u) => u.sym), n_symbols: UNIVERSE.length, window_days: WIN,
      lookback: LOOKBACK, forward: FWD, k_cont: K_CONT,
      ground_truth: "forward T+1..T+3 same-direction cumulative move >= 1.0*trailing_sigma", seed: 20260705 },
    per_symbol: perSymbol,
    pooled_all: { n: pooledAll.length, idio: prCurve(safe(pooledAll), "zi"), total: prCurve(safe(pooledAll), "zt") },
    cohort_mag7: { n: byCohort.mag7.length, idio: prCurve(safe(byCohort.mag7), "zi") },
    cohort_new20: { n: byCohort.new20.length, idio: prCurve(safe(byCohort.new20), "zi"), total: prCurve(safe(byCohort.new20), "zt") },
    cohort_crypto: { n: byCohort.crypto.length, idio: prCurve(safe(byCohort.crypto), "zi") },
    pooled_full: { n: pooledFull.length, idio: prCurve(safe(pooledFull), "zi"), total: prCurve(safe(pooledFull), "zt") },
  };
})();
