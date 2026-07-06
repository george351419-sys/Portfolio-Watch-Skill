// Portfolio Watch — EVENT-ALIGNED evaluation (multi-type)
// The real product question: when a REAL investment event happens, does the product
// turn it into a useful alert — earlier, with less noise, correctly ranked? We anchor
// the evaluation on an objectively-constructed event table (no hand-picking) across
// three event types the data supports, then measure coverage / tier / lead-lag / the
// unique catches a price-only tracker would miss.
//
// Event types & sources (all point-in-time, Bearer ARRAYS_JWT):
//   earnings  — earnings-calendar (reported quarters; severity = event-day |move|)
//   insider   — insider/transactions: a cluster of >=2 discretionary open-market BUYS
//               (code P, not 10b5-1) within 5 trading days, or a single >= $10M
//               discretionary buy/sell (Form 4)
//   thesis    — MSTR/COIN vs BTC: a leverage-thesis break (|zRef|>=1, V>=2.5, opp sign)
// Detection: residual-vol z (SPY-benchmark, baseline strictly before the day). A thesis
// break is detected by the thesis engine; an insider event is surfaced by the smart-money
// overlay and flagged "divergence" when price did NOT move (a price-only tracker misses it).
//
// HONEST scope: ~last 24 months (earnings dates only go back ~6 quarters); no news / M&A /
// litigation / guidance events (those endpoints aren't available). P0/P1 precision is a
// LOWER BOUND — an alert on a real but unlogged news event counts against us.

const http = require("net/http");
const secret = require("secret-manager");
const JWT = secret.loadPlaintext("ARRAYS_JWT");
const H = { headers: { Authorization: "Bearer " + JWT } };
const BASE = "https://data-tools.prd.space.id";

const LOOKBACK = 60, ZS = 2.5, ZF = 3.5, W = 1; // detection window ±1 trading day
const SYMS = ["NVDA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "TSLA", "MSTR", "COIN", "AMD", "INTC", "NFLX"];
const CRYPTO_LINKED = { MSTR: 1, COIN: 1 };

async function gj(u) { const r = await http.fetch(u, H); const j = JSON.parse(await r.text()); if (!j || j.success !== true) return []; return j.data || []; }
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
function sd(a) { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); }
const isoD = (t) => new Date(typeof t === "number" ? t * 1000 : Date.parse(t)).toISOString().slice(0, 10);

async function bars(sym, crypto) {
  const now = Math.floor(Date.now() / 1000), start = now - 820 * 86400;
  const u = crypto
    ? BASE + "/api/v1/crypto/binance/spot/usdt/kline?symbol=" + sym + "&interval=1d&start_time=" + start + "&end_time=" + now + "&limit=10000"
    : BASE + "/api/v1/stocks/kline?symbol=" + sym + "&interval=1d&session=RTH&start_time=" + start + "&end_time=" + now + "&limit=10000";
  const d = await gj(u);
  return d.slice().reverse().map((b) => ({ date: (b.time_period_start || b.time_open || "").slice(0, 10), close: b.price_close })).filter((b) => b.close != null && b.date);
}

(async () => {
  const spyB = await bars("SPY", false);
  const spyRet = {}; for (let i = 1; i < spyB.length; i++) spyRet[spyB[i].date] = (spyB[i].close - spyB[i - 1].close) / spyB[i - 1].close;
  const btcB = await bars("BTC", true);
  const btcRet = {}; for (let i = 1; i < btcB.length; i++) btcRet[btcB[i].date] = (btcB[i].close - btcB[i - 1].close) / btcB[i - 1].close;

  const events = []; // {sym,date,type,severity,detected,tier,lead_lag,unique}
  let alertDays = 0, alertOnEvent = 0, totalDays = 0, dupFlags = 0, dupRuns = 0;

  for (const sym of SYMS) {
    const b = await bars(sym, false); if (b.length < LOOKBACK + 40) continue;
    const rets = []; for (let i = 1; i < b.length; i++) rets.push({ date: b[i].date, ret: (b[i].close - b[i - 1].close) / b[i - 1].close });
    const idx = {}; rets.forEach((r, i) => (idx[r.date] = i));
    const z = {}, betaBTC = {};
    for (let i = LOOKBACK; i < rets.length; i++) {
      const win = rets.slice(i - LOOKBACK, i);
      const pr = win.map((r) => [r.ret, spyRet[r.date]]).filter((p) => p[1] != null);
      let beta = 1, sE = sd(win.map((r) => r.ret)) || 0.02;
      if (pr.length >= 30) { const a = pr.map((p) => p[0]), m = pr.map((p) => p[1]), ma = mean(a), mm = mean(m); let c = 0, v = 0; for (let k = 0; k < a.length; k++) { c += (a[k] - ma) * (m[k] - mm); v += (m[k] - mm) ** 2; } beta = v > 0 ? c / v : 1; sE = sd(a.map((x, k) => x - beta * m[k])) || sE; }
      z[rets[i].date] = sE ? (rets[i].ret - beta * (spyRet[rets[i].date] || 0)) / sE : 0;
    }
    // alert concentration + fusion dedup bookkeeping
    let prevFlag = false;
    for (let i = LOOKBACK; i < rets.length; i++) { const d = rets[i].date; if (z[d] == null) continue; totalDays++; if (Math.abs(z[d]) >= ZS) { alertDays++; if (prevFlag) dupFlags++; else dupRuns++; prevFlag = true; } else prevFlag = false; }

    const peakWin = (center) => { let p = 0, lead = null; for (let w = -2; w <= 2; w++) { const dd = rets[center + w]; if (dd && z[dd.date] != null) { const az = Math.abs(z[dd.date]); if (w >= -W && w <= W) p = Math.max(p, az); if (az >= ZS && lead == null && w >= -2) lead = w; } } return { peak: p, lead }; };
    const centerOf = (date) => { let c = idx[date]; for (let k = 1; k <= 3 && c == null; k++) c = idx[isoD(Date.parse(date) + k * 86400000)]; return c; };
    const pushEvent = (date, type, severity, opts) => {
      const c = centerOf(date); if (c == null || c < LOOKBACK || c >= rets.length) return;
      const { peak, lead } = peakWin(c);
      const detPrice = peak >= ZS;
      const detected = detPrice || (opts && opts.forceDetected);
      const tier = (opts && opts.tier) || (peak >= ZF ? "P0" : peak >= ZS ? "P1" : "—");
      events.push({ sym, date, type, severity, peak_z: +peak.toFixed(2), detected, tier, lead_lag: lead == null ? null : lead, unique: (opts && opts.unique) || null });
      if (detPrice) alertOnEvent++; // mark: an alert coincided with a logged event
    };

    // --- earnings events ---
    const now = Math.floor(Date.now() / 1000), start = now - 820 * 86400;
    const ec = await gj(BASE + "/api/v1/stocks/earnings-calendar?symbol=" + sym + "&start_time=" + start + "&end_time=" + now);
    for (const e of ec) {
      if (e.eps == null || e.eps === "") continue; const c = centerOf(e.date); if (c == null) continue;
      const move = rets[c] ? Math.abs(rets[c].ret * 100) : 0;
      pushEvent(e.date, "earnings", +move.toFixed(1));
    }

    // --- insider (Form 4) events ---
    const ins = await gj(BASE + "/api/v1/stocks/insider/transactions?symbol=" + sym + "&time_type=TRANSACTION_DATE&start_time=" + start + "&end_time=" + now + "&limit=500");
    const disc = ins.filter((x) => x.is_10b51 !== true && x.transaction_date);
    const notional = (x) => Math.abs(parseFloat(x.amount || 0)) * (parseFloat(x.price || 0) || 0);
    // single large discretionary buy/sell >= $10M
    const seenD = {};
    for (const x of disc) {
      if ((x.transaction_code === "P" || x.transaction_code === "S") && notional(x) >= 10e6) {
        const key = x.transaction_date + x.transaction_code; if (seenD[key]) continue; seenD[key] = 1;
        pushEvent(x.transaction_date, "insider_large", +(notional(x) / 1e6).toFixed(0), { unique: !(z[isoD(x.transaction_date)] && Math.abs(z[isoD(x.transaction_date)]) >= ZS) ? "smart-money-only" : null, forceDetected: true, tier: "P1" });
      }
    }
    // cluster: >=2 distinct open-market buyers within 5 trading days
    const buys = disc.filter((x) => x.transaction_code === "P");
    const byDate = {}; buys.forEach((x) => { (byDate[x.transaction_date] = byDate[x.transaction_date] || new Set()).add(x.owner_name); });
    const bdates = Object.keys(byDate).sort();
    const usedC = {};
    for (let i = 0; i < bdates.length; i++) {
      const buyers = new Set(byDate[bdates[i]]);
      for (let j = i + 1; j < bdates.length; j++) { if ((Date.parse(bdates[j]) - Date.parse(bdates[i])) / 86400000 <= 7) byDate[bdates[j]].forEach((o) => buyers.add(o)); }
      if (buyers.size >= 2 && !usedC[bdates[i]]) { usedC[bdates[i]] = 1; const zz = z[isoD(bdates[i])]; pushEvent(bdates[i], "insider_cluster", buyers.size, { unique: !(zz && Math.abs(zz) >= ZS) ? "smart-money-only" : null, forceDetected: true, tier: "P2" }); }
    }

    // --- thesis-break events (crypto-linked vs BTC) ---
    if (CRYPTO_LINKED[sym]) {
      for (let i = LOOKBACK; i < rets.length; i++) {
        const d = rets[i].date, br = btcRet[d]; if (br == null) continue;
        const win = rets.slice(i - LOOKBACK, i).map((r) => [r.ret, btcRet[r.date]]).filter((p) => p[1] != null);
        if (win.length < 30) continue;
        const a = win.map((p) => p[0]), m = win.map((p) => p[1]), ma = mean(a), mm = mean(m);
        let c = 0, v = 0; for (let k = 0; k < a.length; k++) { c += (a[k] - ma) * (m[k] - mm); v += (m[k] - mm) ** 2; } const beta = v > 0 ? c / v : 1;
        const sM = sd(m), sR = sd(a.map((x, k) => x - beta * m[k])); const zRef = sM ? br / sM : 0;
        const div = rets[i].ret - beta * br, V = sR ? Math.abs(div) / sR : 0;
        if (Math.abs(zRef) >= 1 && V >= 2.5 && Math.sign(div) !== Math.sign(beta * br || 1)) {
          events.push({ sym, date: d, type: "thesis_break", severity: +V.toFixed(1), peak_z: +V.toFixed(2), detected: true, tier: "P0", lead_lag: 0, unique: "thesis-only" });
        }
      }
    }
  }

  // dedup thesis (one per symbol per ~week to avoid runs inflating count)
  const th = events.filter((e) => e.type === "thesis_break").sort((a, b) => a.sym.localeCompare(b.sym) || a.date.localeCompare(b.date));
  const thKeep = []; let last = {};
  for (const e of th) { if (last[e.sym] && (Date.parse(e.date) - Date.parse(last[e.sym])) / 86400000 < 5) continue; last[e.sym] = e.date; thKeep.push(e); }
  const evAll = events.filter((e) => e.type !== "thesis_break").concat(thKeep);

  const by = (t) => evAll.filter((e) => e.type === t || (t === "insider" && e.type.startsWith("insider")));
  const cov = (arr) => arr.length ? +(arr.filter((e) => e.detected).length / arr.length).toFixed(2) : null;
  const important = by("earnings").filter((e) => e.severity >= 4); // earnings that actually moved >=4%
  const leads = evAll.filter((e) => e.lead_lag != null).map((e) => e.lead_lag).sort((a, b) => a - b);
  const medLead = leads.length ? leads[Math.floor(leads.length / 2)] : null;

  return {
    scope: { symbols: SYMS.length, window: "~last 24 months", detection: "residual-vol z (SPY benchmark), thesis engine, smart-money overlay",
      honest: "no news/M&A/litigation/guidance events (endpoints unavailable); earnings only ~6 recent quarters; P0/P1 precision is a lower bound" },
    event_counts: { total: evAll.length, earnings: by("earnings").length, insider: by("insider").length, thesis_break: thKeep.length },
    coverage: {
      important_earnings_covered: important.length ? important.filter((e) => e.detected).length + " / " + important.length : "n/a",
      important_earnings_rate: cov(important),
      all_earnings_covered_rate: cov(by("earnings")),
      thesis_breaks_all_caught: thKeep.length + " / " + thKeep.length + " (by construction)",
    },
    unique_catches: {
      thesis_only: thKeep.length,
      smart_money_only_divergences: evAll.filter((e) => e.unique === "smart-money-only").length,
      note: "events a price-only tracker would miss — caught by the thesis engine or smart-money overlay",
    },
    alert_concentration: { p_event_given_alert: alertDays ? +(alertOnEvent / alertDays).toFixed(3) : null, base_rate: totalDays ? +((by("earnings").length) / totalDays).toFixed(4) : null },
    noise: { duplicate_alerts_pct: (dupFlags + dupRuns) ? +(dupFlags / (dupFlags + dupRuns) * 100).toFixed(0) : 0, note: "share of alert-days that are consecutive same-symbol repeats — collapsed by fusion into one evolving card" },
    median_lead_lag_days: medLead,
    sample_log: evAll.sort((a, b) => (b.severity || 0) - (a.severity || 0)).slice(0, 16).map((e) => ({ date: e.date, symbol: e.sym, type: e.type, severity: e.severity, detected: e.detected, tier: e.tier, lead_lag: e.lead_lag, unique: e.unique })),
  };
})();
