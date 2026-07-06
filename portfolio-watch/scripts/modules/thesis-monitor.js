// Portfolio Watch — Thesis-linked monitor (v1 capability)
// A holding can carry a THESIS ("I hold MSTR as a leveraged BTC play"). We derive
// a monitorable invariant (MSTR should track BTC, amplified) and watch for its
// VIOLATION. A thesis break challenges the user's *decision*, not just reports a
// move — so it escalates straight to P0.
//
// Math reuses the residual-vol engine, re-pointed at the THESIS benchmark (BTC):
//   expected_t = beta_BTC * r_BTC,t      (thesis-implied move)
//   divergence_t = r_MSTR,t - expected_t (what the thesis failed to explain)
//   V = |divergence_t| / sigma_resid     (violation severity, in sigma)
// Thesis-break when BTC moved materially (|z_BTC|>=1.5) yet MSTR diverged (V>=2)
// against the thesis direction — plus a slow regime check on rolling correlation.

const http = require("net/http");
const secret = require("secret-manager");
const JWT = secret.loadPlaintext("ARRAYS_JWT");
const H = { headers: { Authorization: "Bearer " + JWT } };
const BASE = "https://data-tools.prd.space.id";
const WIN = 60; // rolling window for beta/correlation

async function getJson(u) { const r = await http.fetch(u, H); const j = JSON.parse(await r.text()); if (!j.success) throw new Error("bad " + u); return j.data; }
async function stockBars(sym) { const now = Math.floor(Date.now() / 1000); return (await getJson(BASE + "/api/v1/stocks/kline?symbol=" + sym + "&interval=1d&session=RTH&limit=10000&start_time=" + (now - 5.2 * 372 * 86400) + "&end_time=" + now)).slice().reverse(); }
async function cryptoBars(sym) { const now = Math.floor(Date.now() / 1000); return (await getJson(BASE + "/api/v1/crypto/binance/spot/usdt/kline?symbol=" + sym + "&interval=1d&limit=10000&start_time=" + (now - 5.2 * 372 * 86400) + "&end_time=" + now)).slice().reverse(); }
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

(async () => {
  const mstr = await stockBars("MSTR");
  const btc = await cryptoBars("BTC");
  const iso = (ts) => new Date(ts * 1000).toISOString().slice(0, 10); // stock: unix seconds
  // returns keyed by UTC calendar date (stock time_close = unix ; crypto time_open = ISO string)
  const rBTC = {};
  for (let i = 1; i < btc.length; i++) rBTC[String(btc[i].time_open).slice(0, 10)] = (btc[i].price_close - btc[i - 1].price_close) / btc[i - 1].price_close;
  const rows = [];
  for (let i = 1; i < mstr.length; i++) {
    const d = iso(mstr[i].time_close);
    const rm = (mstr[i].price_close - mstr[i - 1].price_close) / mstr[i - 1].price_close;
    const rb = rBTC[d];
    if (rb != null) rows.push({ date: d, rMSTR: rm, rBTC: rb });
  }

  // scan for the most severe thesis-break day (BTC up big, MSTR failed to follow)
  const breaks = [];
  for (let i = WIN; i < rows.length; i++) {
    const w = rows.slice(i - WIN, i);
    const a = w.map((r) => r.rMSTR), b = w.map((r) => r.rBTC);
    const ma = mean(a), mb = mean(b);
    let cov = 0, vb = 0, va = 0;
    for (let k = 0; k < w.length; k++) { cov += (a[k] - ma) * (b[k] - mb); vb += (b[k] - mb) ** 2; va += (a[k] - ma) ** 2; }
    const beta = vb > 0 ? cov / vb : 0;
    const corr = va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
    const resid = a.map((x, k) => x - beta * b[k]);
    const sResid = sd(resid) || 0.02;
    const sBTC = sd(b) || 0.02;
    const zBTC = rows[i].rBTC / sBTC;
    const expected = beta * rows[i].rBTC; // thesis-implied MSTR move
    const divergence = rows[i].rMSTR - expected;
    const V = Math.abs(divergence) / sResid;
    // thesis break: BTC moved materially, MSTR failed to follow the amplified relation
    const brokeUp = zBTC >= 1.5 && divergence < 0 && V >= 2;   // BTC up, MSTR lagged
    const brokeDn = zBTC <= -1.5 && divergence > 0 && V >= 2;  // BTC down, MSTR didn't (still could be break)
    if (brokeUp || brokeDn) breaks.push({ date: rows[i].date, rMSTR: rows[i].rMSTR, rBTC: rows[i].rBTC, beta, corr, expected, divergence, V, zBTC });
  }
  breaks.sort((x, y) => y.V - x.V);
  const top = breaks[0];

  // escalation decision + human-readable alert (proves the mechanism)
  function escalate(ev) {
    const p = (x) => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "%";
    return {
      tier: "P0",
      reason: "THESIS BREAK",
      headline: "⚠️ Thesis break — MSTR: held as a leveraged BTC play, but the leverage relationship isn't holding.",
      detail: "BTC " + p(ev.rBTC) + " (" + ev.zBTC.toFixed(1) + "σ) → thesis-expected MSTR " + p(ev.expected) +
        " (β=" + ev.beta.toFixed(1) + "), actual MSTR " + p(ev.rMSTR) + ". Divergence " + p(ev.divergence) +
        " = " + ev.V.toFixed(1) + "σ against the thesis. 60d correlation " + ev.corr.toFixed(2) + ".",
      escalation: "Thesis violation → priority escalated to P0 (challenges the buy logic, not just a market move).",
    };
  }

  return {
    thesis: "MSTR = leveraged BTC play (invariant: MSTR tracks BTC, amplified, β>1, high ρ)",
    aligned_days: rows.length,
    break_days_found: breaks.length,
    worst_break: top ? escalate(top) : null,
    sample_top3: breaks.slice(0, 3).map((e) => ({ date: e.date, btc: +(e.rBTC * 100).toFixed(1), mstr: +(e.rMSTR * 100).toFixed(1), beta: +e.beta.toFixed(1), V: +e.V.toFixed(1), corr: +e.corr.toFixed(2) })),
  };
})();
