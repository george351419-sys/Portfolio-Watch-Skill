// Portfolio Watch — EVENT-LEVEL evaluation (earnings-aligned)
// Codex's biggest remaining item: the main backtest uses forward-price continuation
// as ground truth, which rewards momentum. This instead asks the product's real
// question — "do our alerts land on genuine catalysts, not just price noise?" —
// using EARNINGS as the catalyst and EPS surprise as its magnitude.
//
// Data honesty: historical earnings dates are NOT broadly available (earnings-calendar
// only returns ~6 recent quarters; income-statements/dividends are gated). So this is a
// RECENT-WINDOW study (~last 1.5y, ~6 earnings/symbol), not the full 5y — scoped exactly
// to where the data exists. Detection = residual-vol z (point-in-time, baseline strictly
// before the day). Reported: earnings recall, big-surprise recall, and alert concentration
// (how much more likely an alert is to sit on an earnings window than chance = lift).

const http = require("net/http");
const secret = require("secret-manager");
const JWT = secret.loadPlaintext("ARRAYS_JWT");
const H = { headers: { Authorization: "Bearer " + JWT } };
const BASE = "https://data-tools.prd.space.id";

const LOOKBACK = 60, T = 2.5, WINDOW_D = 1; // detection window = earnings date ±1 trading day
const MAG7 = ["NVDA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "TSLA"];
const NEW20 = ["JPM", "GS", "XOM", "CVX", "JNJ", "PFE", "UNH", "WMT", "HD", "KO",
  "PG", "DIS", "NFLX", "BA", "CAT", "NKE", "V", "CRM", "INTC", "AMD"];
const SYMS = MAG7.concat(NEW20);

async function gj(u) { const r = await http.fetch(u, H); const j = JSON.parse(await r.text()); if (!j || j.success !== true) return []; return j.data || []; }
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
function sd(a) { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); }
function iso(t) { return new Date((typeof t === "number" ? t * 1000 : Date.parse(t))).toISOString().slice(0, 10); }

async function bars(sym) {
  const now = Math.floor(Date.now() / 1000), start = now - 760 * 86400;
  const d = await gj(BASE + "/api/v1/stocks/kline?symbol=" + sym + "&interval=1d&session=RTH&start_time=" + start + "&end_time=" + now + "&limit=10000");
  return d.slice().reverse().map((b) => ({ date: (b.time_period_start || "").slice(0, 10), close: b.price_close })).filter((b) => b.close != null);
}
async function earnings(sym) {
  const now = Math.floor(Date.now() / 1000), start = now - 760 * 86400;
  const rows = await gj(BASE + "/api/v1/stocks/earnings-calendar?symbol=" + sym + "&start_time=" + start + "&end_time=" + now);
  return rows.filter((r) => r.eps != null && r.eps !== "" && r.eps_estimated != null && r.eps_estimated !== "")
    .map((r) => { const e = parseFloat(r.eps), est = parseFloat(r.eps_estimated); return { date: r.date, eps: e, est, surprise: est ? Math.abs((e - est) / Math.abs(est)) : null }; })
    .filter((r) => r.date);
}

(async () => {
  const spyBars = await bars("SPY");
  const spyRet = {}; for (let i = 1; i < spyBars.length; i++) spyRet[spyBars[i].date] = (spyBars[i].close - spyBars[i - 1].close) / spyBars[i - 1].close;

  let E = 0, detected = 0, surprises = [];
  const perEvent = []; // {sym,date,surprise,z,detected}
  let alertDays = 0, alertOnEvent = 0, totalDays = 0, eventWindowDays = 0;

  for (const sym of SYMS) {
    const b = await bars(sym); if (b.length < LOOKBACK + 30) continue;
    const rets = []; for (let i = 1; i < b.length; i++) rets.push({ date: b[i].date, ret: (b[i].close - b[i - 1].close) / b[i - 1].close });
    // point-in-time residual-vol z per day (baseline strictly before)
    const z = {}; const idxByDate = {};
    for (let i = 0; i < rets.length; i++) idxByDate[rets[i].date] = i;
    for (let i = LOOKBACK; i < rets.length; i++) {
      const win = rets.slice(i - LOOKBACK, i);
      const pairs = win.map((r) => [r.ret, spyRet[r.date]]).filter((p) => p[1] != null);
      let beta = 1, sEps = sd(win.map((r) => r.ret)) || 0.02;
      if (pairs.length >= 30) {
        const a = pairs.map((p) => p[0]), m = pairs.map((p) => p[1]); const ma = mean(a), mm = mean(m);
        let cov = 0, vm = 0; for (let k = 0; k < a.length; k++) { cov += (a[k] - ma) * (m[k] - mm); vm += (m[k] - mm) ** 2; }
        beta = vm > 0 ? cov / vm : 1; sEps = sd(a.map((x, k) => x - beta * m[k])) || sEps;
      }
      const sr = spyRet[rets[i].date] || 0;
      z[rets[i].date] = sEps ? (rets[i].ret - beta * sr) / sEps : 0;
    }
    // alert concentration bookkeeping (all evaluable days)
    const evDates = await earnings(sym);
    const evSet = new Set();
    evDates.forEach((ev) => {
      const gi = idxByDate[ev.date];
      // map to nearest trading day if the exact date isn't a bar (amc/bmo)
      let center = gi;
      if (center == null) { for (let d = 1; d <= 3 && center == null; d++) { if (idxByDate[iso(Date.parse(ev.date) + d * 86400000)] != null) center = idxByDate[iso(Date.parse(ev.date) + d * 86400000)]; } }
      if (center == null) return;
      for (let w = -WINDOW_D; w <= WINDOW_D; w++) { const dd = rets[center + w]; if (dd) evSet.add(dd.date); }
    });
    for (let i = LOOKBACK; i < rets.length; i++) {
      const d = rets[i].date; if (z[d] == null) continue;
      totalDays++; const inEv = evSet.has(d); if (inEv) eventWindowDays++;
      if (Math.abs(z[d]) >= T) { alertDays++; if (inEv) alertOnEvent++; }
    }
    // per-earnings detection (recall)
    for (const ev of evDates) {
      let center = idxByDate[ev.date];
      if (center == null) { for (let dd = 1; dd <= 3 && center == null; dd++) { const k = iso(Date.parse(ev.date) + dd * 86400000); if (idxByDate[k] != null) center = idxByDate[k]; } }
      if (center == null || center < LOOKBACK || center >= rets.length) continue;
      let hit = false, peak = 0;
      for (let w = -WINDOW_D; w <= WINDOW_D; w++) { const dd = rets[center + w]; if (dd && z[dd.date] != null) { peak = Math.max(peak, Math.abs(z[dd.date])); if (Math.abs(z[dd.date]) >= T) hit = true; } }
      E++; if (hit) detected++; if (ev.surprise != null) surprises.push({ s: ev.surprise, hit });
      perEvent.push({ sym, date: ev.date, surprise: ev.surprise == null ? null : +(ev.surprise * 100).toFixed(1), peak_z: +peak.toFixed(2), detected: hit });
    }
  }

  // big-surprise recall (top half by |surprise|)
  const withS = surprises.filter((x) => x.s != null).sort((a, b) => b.s - a.s);
  const bigHalf = withS.slice(0, Math.ceil(withS.length / 2));
  const bigRecall = bigHalf.length ? bigHalf.filter((x) => x.hit).length / bigHalf.length : null;

  const pEventGivenAlert = alertDays ? alertOnEvent / alertDays : null;
  const baseEvent = totalDays ? eventWindowDays / totalDays : null;

  return {
    scope: { symbols: SYMS.length, window: "~last 24 months (where earnings dates exist)", detection: "|residual-vol z| >= " + T + " within earnings ±" + WINDOW_D + " trading day", note: "point-in-time; SPY-benchmark residual" },
    earnings_events: E,
    earnings_recall: E ? +(detected / E).toFixed(3) : null,
    big_surprise_recall: bigRecall == null ? null : +bigRecall.toFixed(3),
    alert_concentration: {
      p_event_window_given_alert: pEventGivenAlert == null ? null : +pEventGivenAlert.toFixed(3),
      base_rate_event_window: baseEvent == null ? null : +baseEvent.toFixed(3),
      lift: (pEventGivenAlert && baseEvent) ? +(pEventGivenAlert / baseEvent).toFixed(2) : null,
      reading: "an alert is Nx more likely to sit on an earnings window than a random day — evidence alerts track real catalysts, not just price noise",
    },
    sample_events: perEvent.filter((e) => e.surprise != null).sort((a, b) => b.surprise - a.surprise).slice(0, 12),
  };
})();
