// Portfolio Watch — Watch Feed v2 (rigorous model)
// z_idio = residual / sigma_eps (residual vol, not total); market-driven test
// phi>0.5; t-inflated thresholds; BH-FDR across holdings; bounded 0-100 score
// with impact gate; hysteresis/ratchet via ctx.kv; cold-start aware confidence.
// Optional arg { "asof": <unix_seconds> }.

const { Feed, feedPath, makeDoc, str, num, bool } = require("@alva/feed");
const http = require("net/http");
const secret = require("secret-manager");
const alfs = require("alfs");
const env = require("env");

const PLAYBOOK = "portfolio-watch";
const SENSITIVITY = "Standard";
const BASE = "https://data-tools.prd.space.id";
const JWT = secret.loadPlaintext("ARRAYS_JWT");
const H = { headers: { Authorization: "Bearer " + JWT } };
const USER = env.username;
const asof = (env.args && Number(env.args.asof)) || Math.floor(Date.now() / 1000);
const Q_FDR = 0.1; // Benjamini-Hochberg target false-discovery rate
const Z_ON = 2.5, Z_OFF = 1.5; // hysteresis thresholds (on z_idio)
// Thesis-linked monitoring: holding -> stated buy-thesis, read from the user-owned
// config (so add/remove/thesis are all driven by the Agent editing holdings.json).
let THESIS = {};
const THESIS_WIN = 60; // rolling window for thesis beta/corr
async function loadThesis() {
  try {
    const raw = await alfs.readFile("/alva/home/" + env.username + "/feeds/pw-config/v1/holdings.json");
    const cfg = JSON.parse(String(raw));
    const m = {};
    (cfg.holdings || []).forEach((h) => { if (h.thesis && h.thesis.ref) m[h.symbol] = h.thesis; });
    return m;
  } catch (e) { return { MSTR: { ref: "BTC", refType: "crypto", type: "leverage", label: "leveraged BTC play" } }; }
}
// macro-context overlay: liquid macro markets → portfolio-level heads-up (not per-stock alerts)
async function loadMacro() {
  try {
    const raw = await alfs.readFile("/alva/home/" + env.username + "/feeds/pw-config/v1/holdings.json");
    return JSON.parse(String(raw)).macro || [];
  } catch (e) { return []; }
}

async function getJson(url) {
  const r = await http.fetch(url, H);
  if (r.status !== 200) throw new Error("HTTP " + r.status + " " + url);
  const j = JSON.parse(await r.text());
  if (!j || j.success !== true || !Array.isArray(j.data)) throw new Error("bad shape " + url);
  return j.data;
}
async function dailyBars(symbol, days, endT) {
  const url = BASE + "/api/v1/stocks/kline?symbol=" + symbol + "&interval=1d&session=RTH&limit=" +
    days + "&start_time=" + (endT - Math.ceil(days * 1.7) * 86400) + "&end_time=" + endT;
  return (await getJson(url)).slice().reverse();
}
async function cryptoBars(symbol, days, endT) {
  const url = BASE + "/api/v1/crypto/binance/spot/usdt/kline?symbol=" + symbol + "&interval=1d&limit=" +
    days + "&start_time=" + (endT - Math.ceil(days * 1.7) * 86400) + "&end_time=" + endT;
  return (await getJson(url)).slice().reverse();
}
const isoDay = (ts) => new Date((typeof ts === "number" ? ts * 1000 : Date.parse(ts))).toISOString().slice(0, 10);
// build UTC-date -> daily return map for a reference asset (crypto)
async function refReturnMap(sym, endT) {
  const b = await cryptoBars(sym, 120, endT);
  const m = {};
  for (let i = 1; i < b.length; i++) m[isoDay(b[i].time_open)] = (b[i].price_close - b[i - 1].price_close) / b[i - 1].price_close;
  return m;
}
function olsBetaResid(pairs) {
  const a = pairs.map((p) => p[0]), m = pairs.map((p) => p[1]);
  const ma = a.reduce((x, y) => x + y, 0) / a.length, mm = m.reduce((x, y) => x + y, 0) / m.length;
  let cov = 0, vm = 0, va = 0;
  for (let k = 0; k < a.length; k++) { cov += (a[k] - ma) * (m[k] - mm); vm += (m[k] - mm) ** 2; va += (a[k] - ma) ** 2; }
  const beta = vm > 0 ? cov / vm : 0;
  const corr = va > 0 && vm > 0 ? cov / Math.sqrt(va * vm) : 0;
  const resid = a.map((x, k) => x - beta * m[k]);
  const mr = resid.reduce((x, y) => x + y, 0) / resid.length;
  const sResid = Math.sqrt(resid.reduce((s, x) => s + (x - mr) ** 2, 0) / (resid.length - 1));
  const sM = Math.sqrt(vm / (m.length - 1));
  return { beta, corr, sResid, sM };
}
const clip = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const round = (x, n = 2) => (x == null || isNaN(x) ? null : Number(x.toFixed(n)));
function ymd(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");
}
// normal CDF via erf (Abramowitz-Stegun 7.1.26)
function erf(x) {
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
const Phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
const pTwoSided = (z) => 2 * (1 - Phi(Math.abs(z)));

(async () => {
  THESIS = await loadThesis();
  const MACRO = await loadMacro();
  const profRaw = await alfs.readFile("/alva/home/" + USER + "/feeds/pw-profile/v1/data/profile/holdings/@last/10");
  const profiles = JSON.parse(String(profRaw)).flatMap((r) => (r && r.items ? r.items : [r])).filter((r) => r && r.symbol);
  if (!profiles.length) throw new Error("no profile baseline");

  // market (SPY): today's return + a trailing return map (for universe beta)
  let spyRet = 0, marketAvailable = true, spyMap = {};
  try {
    const spy = (await dailyBars("SPY", 90, asof)).filter((b) => b.time_close <= asof);
    for (let i = 1; i < spy.length; i++) spyMap[isoDay(spy[i].time_close)] = (spy[i].price_close - spy[i - 1].price_close) / spy[i - 1].price_close;
    spyRet = (spy[spy.length - 1].price_close - spy[spy.length - 2].price_close) / spy[spy.length - 2].price_close;
  } catch (e) { marketAvailable = false; }

  // ---- searchable universe: per-ticker evidence, computed on the fly vs SPY ----
  const UNIVERSE = ["MSFT","GOOGL","META","AMZN","JPM","GS","XOM","CVX","JNJ","PFE","UNH","WMT","HD","KO","DIS","NFLX","BA","CAT","V","CRM","INTC","AMD","COIN","PLTR"];
  const universeRows = [];
  for (const sym of UNIVERSE) {
    try {
      const b = (await dailyBars(sym, 70, asof)).filter((x) => x.time_close <= asof);
      if (b.length < 25) continue;
      const rets = []; for (let i = 1; i < b.length; i++) rets.push((b[i].price_close - b[i - 1].price_close) / b[i - 1].price_close);
      const last = (a, n) => a.slice(Math.max(0, a.length - n));
      const sd2 = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
      const sigma = sd2(last(rets, 20)) || 0.02;
      const pairs = []; for (let i = 1; i < b.length; i++) { const r = spyMap[isoDay(b[i].time_close)]; if (r != null) pairs.push([(b[i].price_close - b[i - 1].price_close) / b[i - 1].price_close, r]); }
      let beta = 1, sEps = sigma;
      if (pairs.length >= 25) { const br = olsBetaResid(pairs.slice(0, pairs.length - 1)); beta = br.beta; sEps = br.sResid || sigma; }
      const today = b[b.length - 1], prev = b[b.length - 2];
      const ret = (today.price_close - prev.price_close) / prev.price_close;
      const avgVol = last(b.map((x) => x.volume_traded), 20).reduce((x, y) => x + y, 0) / 20;
      universeRows.push({ date: asof * 1000, symbol: sym, price: round(today.price_close), ret_pct: round(ret * 100, 2),
        z: round(ret / sigma, 2), residual_z: round((ret - beta * spyRet) / sEps, 2), rvol: avgVol ? round(today.volume_traded / avgVol, 2) : null, beta: round(beta, 2) });
    } catch (e) { /* skip uncovered symbol */ }
  }

  // ---- thesis reference return maps (fetch each referenced asset once) ----
  const refMaps = {};
  for (const sym of Object.keys(THESIS)) {
    const t = THESIS[sym];
    if (t.type !== "catalyst" && t.ref && !refMaps[t.ref]) { try { refMaps[t.ref] = await refReturnMap(t.ref, asof); } catch (e) { refMaps[t.ref] = null; } }
  }

  // ---- catalyst theses: Polymarket P(event) up to asof → collapse signal ----
  const catalystMap = {};
  for (const sym of Object.keys(THESIS)) {
    const t = THESIS[sym];
    if (t.type !== "catalyst" || !t.token) continue;
    try {
      const r = await http.fetch("https://clob.polymarket.com/prices-history?market=" + t.token + "&interval=max&fidelity=1440", {});
      const hj = JSON.parse(await r.text());
      const pts = ((hj && hj.history) || []).filter((x) => x.t <= asof);
      if (pts.length < 8) continue;
      const P = pts.map((x) => x.p);
      const dP = []; for (let i = 1; i < P.length; i++) dP.push(P[i] - P[i - 1]);
      const mdP = dP.reduce((a, b) => a + b, 0) / dP.length;
      const sig = Math.sqrt(dP.reduce((s, x) => s + (x - mdP) ** 2, 0) / (dP.length - 1)) || 0.01;
      const pNow = P[P.length - 1];
      const pHigh = Math.max(...P.slice(Math.max(0, P.length - 30))); // recent-window high (robust)
      const relDrop = pHigh > 0 ? (pHigh - pNow) / pHigh : 0;
      let worst = 0; const w = 10;
      for (let i = w; i < P.length; i++) { const mv = P[i] - P[i - w]; if (mv < worst) worst = mv; }
      const zc = worst / (sig * Math.sqrt(w));
      const broke = relDrop >= 0.5 || pNow < 0.1 * pHigh;
      const strained = !broke && (relDrop >= 0.2 || zc <= -2);
      catalystMap[sym] = { label: t.label, ref: t.ref, pNow, pHigh, relDrop, z: zc, broke, strained };
    } catch (e) { /* skip on fetch/parse error */ }
  }

  // ---- macro-context overlay: a liquid macro market moving → portfolio-level heads-up ----
  const macroRows = [];
  for (const mk of MACRO) {
    if (!mk.token) continue;
    try {
      const r = await http.fetch("https://clob.polymarket.com/prices-history?market=" + mk.token + "&interval=max&fidelity=1440", {});
      const hj = JSON.parse(await r.text());
      const pts = ((hj && hj.history) || []).filter((x) => x.t <= asof);
      if (pts.length < 10) continue;
      const P = pts.map((x) => x.p);
      const pNow = P[P.length - 1];
      const win = P.slice(Math.max(0, P.length - 14));  // recent ~2 weeks
      const hi = Math.max(...win), lo = Math.min(...win);
      const dropMove = pNow - hi, riseMove = pNow - lo;   // peak-to-now / trough-to-now
      const change = Math.abs(dropMove) >= Math.abs(riseMove) ? dropMove : riseMove;
      const pRef = Math.abs(dropMove) >= Math.abs(riseMove) ? hi : lo;
      const dP = []; for (let i = 1; i < P.length; i++) dP.push(P[i] - P[i - 1]);
      const md = dP.reduce((a, b) => a + b, 0) / dP.length;
      const sig = Math.sqrt(dP.reduce((s, x) => s + (x - md) ** 2, 0) / (dP.length - 1)) || 0.01;
      const zChg = change / (sig * Math.sqrt(10));
      // material move gate (and it's a liquid market by construction)
      if (Math.abs(change) < 0.08 && Math.abs(zChg) < 1.5) continue;
      const secset = new Set((mk.sensitive_sectors || []).map((s) => s.toLowerCase()));
      const hit = profiles.filter((p) => secset.has(String(p.sector || "").toLowerCase()));
      const exposure = hit.reduce((a, p) => a + (p.weight || 0), 0);
      const dir = change < 0 ? "fell" : "rose";
      const impl = mk.factor === "rates" ? (change < 0 ? "less easing priced — a headwind for rate-sensitive holdings" : "more easing priced — a tailwind for rate-sensitive holdings") : "";
      macroRows.push({
        date: asof * 1000, factor: mk.factor, label: mk.label,
        prob_now_pct: round(pNow * 100, 0), change_pct: round(change * 100, 0), z: round(zChg, 1),
        exposure_pct: round(exposure * 100, 0), holdings: hit.map((p) => p.symbol).join(", "),
        note: mk.label + " " + dir + " " + round(pRef * 100, 0) + "% → " + round(pNow * 100, 0) + "% this week (" +
          (change >= 0 ? "+" : "") + round(change * 100, 0) + "pts, " + round(zChg, 1) + "σ) — " + impl +
          (hit.length ? ": " + hit.map((p) => p.symbol).join(", ") + " (" + round(exposure * 100, 0) + "% of book)." : "."),
      });
    } catch (e) { /* skip */ }
  }

  // ---- semiconductor cycle (DXI memory index) → sector context for semi holdings ----
  try {
    const dxiNow = Math.floor(Date.now() / 1000);
    const dxi = await getJson(BASE + "/api/v1/other/semiconductor/dxi-index?start_time=" + (dxiNow - 120 * 86400) + "&end_time=" + dxiNow + "&limit=100");
    if (dxi.length) {
      const d0 = dxi[0]; // latest first
      const val = d0.value, ma30 = d0.ma30, ma60 = d0.ma60, chg = d0.change_pct;
      const semis = profiles.filter((p) => /semiconductor/i.test(p.sector || ""));
      if (semis.length) {
        const exposure = semis.reduce((a, p) => a + (p.weight || 0), 0);
        const up = val > ma30 && ma30 > ma60, down = val < ma30 && ma30 < ma60;
        if (up || down) {
          macroRows.push({ date: asof * 1000, factor: "semiconductor", label: "Memory cycle (DXI)",
            prob_now_pct: null, change_pct: round(chg, 1), z: null, exposure_pct: round(exposure * 100, 0), holdings: semis.map((p) => p.symbol).join(", "),
            note: "Memory prices (TrendForce DXI, as of " + d0.date + ") are " + (up ? "rising — above their 30/60-day averages: a semiconductor-cycle tailwind" : "rolling over — below their 30/60-day averages: a semiconductor-cycle headwind") +
              " for " + semis.map((p) => p.symbol).join(", ") + " (" + round(exposure * 100, 0) + "% of book). [DXI is most direct for memory names; a broad cycle read for GPU/AI via HBM.]" });
        }
      }
    }
  } catch (e) { /* skip */ }

  // ---- smart-money positioning (insider open-market buys, trailing, current data) ----
  // Context overlay, not per-stock alerts: "who is backing this with their own money".
  const smRows = [];
  const smNow = Math.floor(Date.now() / 1000), smStart = smNow - 400 * 86400;
  for (const p of profiles) {
    try {
      const raw = await getJson(BASE + "/api/v1/stocks/insider/transactions?symbol=" + p.symbol +
        "&time_type=TRANSACTION_DATE&start_time=" + smStart + "&end_time=" + smNow + "&limit=500");
      const seen = {}; const rows = raw.filter((x) => { const k = (x.owner_name || "") + "|" + x.transaction_date + "|" + x.amount + "|" + x.price; if (seen[k]) return false; seen[k] = 1; return true; });
      const disc = (x) => x.is_10b51 !== true;
      const notion = (x) => (parseFloat(x.amount) || 0) * (parseFloat(x.price) || 0);
      const buys = rows.filter((x) => x.transaction_code === "P" && disc(x));
      const sells = rows.filter((x) => x.transaction_code === "S" && disc(x));
      const buyers = new Set(buys.map((x) => x.owner_name)), sellers = new Set(sells.map((x) => x.owner_name));
      const buyM = buys.reduce((a, x) => a + notion(x), 0) / 1e6, sellM = sells.reduce((a, x) => a + notion(x), 0) / 1e6;
      const ceoBuy = buys.some((x) => /CEO|Chief Exec/i.test(x.officer_title || ""));
      let state = "quiet", note = "";
      if ((buyers.size >= 2 || ceoBuy) && buyM > sellM) {
        state = "cluster-buy";
        note = buyers.size + " insider" + (buyers.size > 1 ? "s" : "") + " bought ~$" + buyM.toFixed(1) + "M open-market" + (ceoBuy ? " (incl. CEO)" : "") + ", none pre-planned — backing it with their own money.";
      } else if (sellers.size >= 3 && sellM > 3 * buyM) {
        state = "cluster-sell"; note = sellers.size + " insiders sold ~$" + sellM.toFixed(1) + "M (ex-10b5-1) — broad distribution.";
      }
      if (state !== "quiet") smRows.push({ date: asof * 1000, symbol: p.symbol, state, buyers: buyers.size, sellers: sellers.size,
        buy_m: round(buyM, 1), sell_m: round(sellM, 1), note });
    } catch (e) { /* skip symbol */ }
  }

  // ---- options-implied enrichment (expected move, IV premium, skew; current data) ----
  const optRows = [];
  async function atmIVf(sym, type) {
    const dataArr = await getJson(BASE + "/api/v1/options/chain?symbol=" + sym + "&limit=250&contract_type=" + type +
      "&start_expiration_date=" + (smNow + 14 * 86400) + "&end_expiration_date=" + (smNow + 45 * 86400));
    const res = (dataArr[0] && dataArr[0].results) || [];
    const withIV = res.filter((c) => c.implied_volatility > 0 && c.details && c.details.strike_price);
    if (!withIV.length || !(res[0].underlying_asset && res[0].underlying_asset.price)) return null;
    const spot = res[0].underlying_asset.price;
    const atm = withIV.reduce((b, c) => Math.abs(c.details.strike_price - spot) < Math.abs((b ? b.details.strike_price : 1e9) - spot) ? c : b, null);
    const days = Math.max(1, Math.round((Date.parse(atm.details.expiration_date) / 1000 - smNow) / 86400));
    return { spot, iv: atm.implied_volatility, days };
  }
  for (const p of profiles) {
    try {
      const call = await atmIVf(p.symbol, "call"); if (!call) continue;
      const put = await atmIVf(p.symbol, "put");
      const iv = put ? (call.iv + put.iv) / 2 : call.iv;
      const rvAnn = (p.sigma_ewma || p.sigma_base || 0.02) * Math.sqrt(252);
      const expMove = iv * Math.sqrt(call.days / 365) * 100;
      const premium = rvAnn > 0 ? iv / rvAnn : null;
      const skew = put ? (put.iv - call.iv) * 100 : null;
      let ost = "normal", onote = "";
      if (premium != null && premium >= 1.3) { ost = "elevated"; onote = "IV " + round(iv * 100, 0) + "% is " + round(premium, 1) + "× realized — options bracing for a bigger move (often pre-catalyst)."; }
      else if (skew != null && skew >= 5) { ost = "downside-skew"; onote = "Put IV exceeds call IV by " + round(skew, 0) + "pts — options pricing downside fear."; }
      optRows.push({ date: asof * 1000, symbol: p.symbol, atm_iv_pct: round(iv * 100, 0), expected_move_pct: round(expMove, 1),
        iv_premium: premium ? round(premium, 2) : null, skew_pts: skew != null ? round(skew, 0) : null, days: call.days, state: ost, note: onote });
    } catch (e) { /* skip symbol */ }
  }

  // ---- crypto microstructure: funding + OI for the crypto refs of crypto-linked holdings ----
  const cryptoRows = [];
  const cryptoRefs = {}; // ref symbol -> holdings it backs
  for (const p of profiles) {
    const t = THESIS[p.symbol];
    const ref = t && t.refType === "crypto" ? t.ref : (String(p.sector || "").toLowerCase().indexOf("crypto") >= 0 ? "BTC" : null);
    if (ref) { (cryptoRefs[ref] = cryptoRefs[ref] || []).push(p.symbol); }
  }
  for (const ref of Object.keys(cryptoRefs)) {
    try {
      const fr = await getJson(BASE + "/api/v1/crypto/funding-rate?symbol=" + ref + "&start_time=" + (smNow - 45 * 86400) + "&end_time=" + smNow + "&limit=300");
      const oi = await getJson(BASE + "/api/v1/crypto/open-interest?symbol=" + ref + "&start_time=" + (smNow - 30 * 86400) + "&end_time=" + smNow + "&limit=200");
      if (!fr.length) continue;
      const rates = fr.map((x) => x.funding_rate);
      const mAvg = rates.reduce((a, b) => a + b, 0) / rates.length;
      const rsd = Math.sqrt(rates.reduce((s, x) => s + (x - mAvg) ** 2, 0) / (rates.length - 1)) || 1e-9;
      const annual = rates[0] * 3 * 365 * 100, z = (rates[0] - mAvg) / rsd;
      let oiChg = null; if (oi.length >= 8) { const v = oi.map((x) => x.sum_open_interest_value); oiChg = (v[0] - v[7]) / v[7] * 100; }
      let cstate = "normal", cnote = "";
      if (z >= 2 || annual >= 40) { cstate = "crowded-longs"; cnote = ref + " funding elevated (" + round(annual, 0) + "%/yr, " + round(z, 1) + "σ) — crowded longs, squeeze/mean-revert risk."; }
      else if (z <= -2 || annual <= -20) { cstate = "capitulation"; cnote = ref + " funding deeply negative — shorts crowded / capitulation."; }
      else if (oiChg != null && oiChg <= -12) { cstate = "deleveraging"; cnote = ref + " open interest fell " + round(oiChg, 0) + "% in a week — leverage flushing (liquidations)."; }
      cryptoRows.push({ date: asof * 1000, ref, holdings: cryptoRefs[ref].join(", "), funding_annual_pct: round(annual, 0),
        funding_z: round(z, 1), oi_change_pct: oiChg != null ? round(oiChg, 0) : null, state: cstate, note: cnote });
    } catch (e) { /* skip */ }
  }

  // ---- crypto-treasury mNAV lens (market cap vs on-balance-sheet crypto NAV) ----
  const mnavRows = [];
  const treasuryHoldings = profiles.filter((p) => /crypto-linked|crypto linked/i.test(p.sector || ""));
  if (treasuryHoldings.length) {
    try {
      const hold = await getJson(BASE + "/api/v1/crypto/holdings?symbol=BTC");
      const idx = {}; hold.forEach((h) => { if (h.symbol) idx[h.symbol] = h; });
      const mNow = Math.floor(Date.now() / 1000);
      for (const p of treasuryHoldings) {
        const rec = idx[p.symbol]; if (!rec || !rec.token_holdings) continue;
        let nav = 0, parts = [];
        for (const tk of Object.keys(rec.token_holdings)) {
          const amt = rec.token_holdings[tk] && rec.token_holdings[tk].amount; if (!amt) continue;
          const k = await getJson(BASE + "/api/v1/crypto/binance/spot/usdt/kline?symbol=" + tk + "&interval=1d&limit=2&start_time=" + (mNow - 6 * 86400) + "&end_time=" + mNow);
          const px = k[0] && k[0].price_close; if (!px) continue;
          nav += amt * px; parts.push(tk + " " + Math.round(amt / 1e3) + "k");
        }
        const mc = await getJson(BASE + "/api/v1/stocks/market-metrics?symbol=" + p.symbol + "&indicator=MARKET_CAP&interval=1d&start_time=" + (mNow - 20 * 86400) + "&end_time=" + mNow);
        const mcap = mc[0] && mc[0].values && mc[0].values[0] ? mc[0].values[0].value : null;
        if (!mcap || !nav || nav / mcap < 0.3) continue; // materiality gate
        const m = mcap / nav, prem = (m - 1) * 100;
        let state = "near-NAV", note = "";
        if (m >= 1.2) { state = "premium"; note = p.symbol + " market cap $" + round(mcap / 1e9, 1) + "B is +" + round(prem, 0) + "% over the crypto it holds ($" + round(nav / 1e9, 1) + "B) — a leverage/optimism premium."; }
        else if (m <= 0.9) { state = "discount"; note = p.symbol + " trades " + round(-prem, 0) + "% BELOW its crypto NAV ($" + round(nav / 1e9, 1) + "B vs $" + round(mcap / 1e9, 1) + "B mcap) — a valuation dislocation."; }
        else note = p.symbol + " near NAV (mNAV " + round(m, 2) + ").";
        mnavRows.push({ date: asof * 1000, symbol: p.symbol, mnav: round(m, 2), premium_pct: round(prem, 0), mcap_b: round(mcap / 1e9, 1), nav_b: round(nav / 1e9, 1), holdings: parts.join(", "), state, note });
      }
    } catch (e) { /* skip */ }
  }

  // ---- FinTwit KOL sentiment (Alva Platform Data, host zet, public read) ----
  const sentiRows = [];
  try {
    const sraw = await alfs.readFile("/alva/home/zet/feeds/kol-ticker-sentiment/v1/data/sentiment/tickers/@last/1");
    const sarr = JSON.parse(String(sraw));
    const srows = []; (Array.isArray(sarr) ? sarr : [sarr]).forEach((x) => { if (x && x.items) srows.push(...x.items); else if (x) srows.push(x); });
    const sBy = {}; srows.forEach((r) => { const t = r.ticker || r.symbol; if (t) sBy[t] = r; });
    for (const p of profiles) {
      const r = sBy[p.symbol]; if (!r) continue;
      const bull = r.bull_kol_count_30d || 0, bear = r.bear_kol_count_30d || 0, tot = bull + bear;
      if (tot < 2) continue;
      const lean = (bull - bear) / tot;
      let state = "mixed", note = "";
      if (lean >= 0.5 && bull >= 3) { state = "KOL-bullish"; note = bull + " tracked KOLs bullish / " + bear + " bearish (30d), " + (r.bull_signal_count_30d || 0) + " bull calls."; }
      else if (lean <= -0.5 && bear >= 3) { state = "KOL-bearish"; note = bear + " tracked KOLs bearish / " + bull + " bullish (30d)."; }
      else { note = bull + " bull / " + bear + " bear KOLs (30d)."; }
      sentiRows.push({ date: asof * 1000, symbol: p.symbol, bull_30d: bull, bear_30d: bear, lean: round(lean, 2), state, note });
    }
  } catch (e) { /* fintwit unavailable → skip */ }

  // ---- per holding evaluation ----
  const evals = [];
  for (const p of profiles) {
    const bars = (await dailyBars(p.symbol, 70, asof)).filter((b) => b.time_close <= asof);
    if (bars.length < 3) continue;
    const today = bars[bars.length - 1], prev = bars[bars.length - 2];
    const ret = (today.price_close - prev.price_close) / prev.price_close;
    const gap = (today.price_open - prev.price_close) / prev.price_close;
    const sigBase = p.sigma_base || p.sigma_ewma || 0.02;
    const sigEps = p.sigma_eps || sigBase;
    const zTot = ret / sigBase;
    const gapZ = gap / sigBase;
    const residual = ret - (p.beta || 1) * spyRet;
    const zIdio = residual / sigEps;
    const rvol = p.avg_vol_20d ? today.volume_traded / p.avg_vol_20d : null;
    const phi = ret !== 0 ? ((p.beta || 1) * spyRet) / ret : 0;
    const marketDriven = Math.abs(zIdio) < 2 && phi > 0.5;
    // t-inflated effective threshold (estimation error): k_eff = k*sqrt(1+1/(2n))
    const n = p.bars_used || 60;
    const infl = Math.sqrt(1 + 1 / (2 * n));
    const recentHigh = Math.max(...bars.slice(-20).map((b) => b.price_high));
    const ddFromHigh = (today.price_close - recentHigh) / recentHigh;
    const near52wHigh = p.week52_high && today.price_close >= p.week52_high * 0.995;
    const near52wLow = p.week52_low && today.price_close <= p.week52_low * 1.005;

    // ---- thesis-linked check: is the buy-thesis still holding? ----
    let thesis = null;
    const tcfg = THESIS[p.symbol];
    if (tcfg && tcfg.type === "catalyst" && catalystMap[p.symbol]) {
      const c = catalystMap[p.symbol];
      thesis = { kind: "catalyst", ref: c.ref, label: c.label, pNow: c.pNow, pHigh: c.pHigh,
        relDrop: c.relDrop, zc: c.z, broke: c.broke, strained: c.strained };
    } else if (tcfg && tcfg.ref && refMaps[tcfg.ref]) {
      const rmap = refMaps[tcfg.ref];
      const pairs = [];
      for (let i = 1; i < bars.length; i++) {
        const d = isoDay(bars[i].time_close);
        const rr = rmap[d];
        if (rr != null) pairs.push([(bars[i].price_close - bars[i - 1].price_close) / bars[i - 1].price_close, rr]);
      }
      const refToday = rmap[isoDay(today.time_close)];
      if (pairs.length >= 20 && refToday != null) {
        const trail = pairs.slice(0, pairs.length - 1); // exclude today from baseline
        const { beta, corr, sResid, sM } = olsBetaResid(trail);
        const zRef = sM ? refToday / sM : 0;
        const expected = beta * refToday;           // thesis-implied move
        const divergence = ret - expected;          // what the thesis failed to explain
        const V = sResid ? Math.abs(divergence) / sResid : 0;
        // break = reference actually moved (>=1σ) AND holding diverged hard against the thesis (V>=2.5, opposite sign)
        const broke = Math.abs(zRef) >= 1.0 && V >= 2.5 && Math.sign(divergence) !== Math.sign(expected || 1);
        thesis = { ref: tcfg.ref, label: tcfg.label, beta: beta, corr: corr, zRef: zRef,
          expected: expected, divergence: divergence, V: V, refRet: refToday, broke: broke };
      }
    }
    evals.push({ p, today, ret, gap, zTot, gapZ, zIdio, rvol, phi, marketDriven, infl, ddFromHigh, near52wHigh, near52wLow, thesis });
  }

  // ---- Benjamini-Hochberg FDR across holdings (on z_idio) ----
  const cand = evals.filter((e) => !e.marketDriven).map((e) => ({ e, p: pTwoSided(e.zIdio) }));
  cand.sort((a, b) => a.p - b.p);
  const K = cand.length;
  let jMax = 0;
  for (let j = 1; j <= K; j++) if (cand[j - 1].p <= (j / K) * Q_FDR) jMax = j;
  const fdrPass = new Set(cand.slice(0, jMax).map((c) => c.e.p.symbol));

  // ---- classify + score ----
  const state = {}; // hysteresis state, loaded from kv below
  const holdings = [], signals = [];
  function scoreOf(e, confirmed) {
    const S = 1 - Math.exp(-Math.abs(e.zIdio) / 1.5);
    const I = clip((Math.abs(e.ret) * e.p.weight) / 0.01);
    const cData = e.p.cold_start ? 0.5 : 1.0;
    const C = cData * 0.5 * (1 + clip((e.rvol || 0) / 3));
    const eta = 1;
    const fs = [];
    if (Math.abs(e.zIdio) >= 2.5) fs.push(0.6);
    if (confirmed) fs.push(0.5);
    if (Math.abs(e.gapZ) >= 2) fs.push(0.3);
    const F = 1 - fs.reduce((a, f) => a * (1 - f), 1);
    const P = e.marketDriven ? 0.6 : 0;
    let sc = Math.floor(100 * clip(0.3 * S + 0.25 * I + 0.15 * C + 0.1 * eta + 0.2 * F - 0.4 * P));
    if (e.p.weight < 0.02) sc = Math.min(sc, 59); // impact gate
    return sc;
  }
  for (const e of evals) {
    const p = e.p, confirmed = e.rvol != null && e.rvol >= 2;
    const rs = Math.abs(e.zIdio);
    const kSurface = 2.0 * e.infl, kPush = 2.5 * e.infl, kForce = 3.5 * e.infl;
    const passFDR = fdrPass.has(p.symbol);
    let tier = "P3", surfaced = false;
    if (!e.marketDriven && passFDR) {
      const sc = scoreOf(e, confirmed);
      if (rs >= kForce || (rs >= 3.0 && confirmed) || sc >= 80) tier = "P0";
      else if (rs >= kPush || sc >= 60) tier = "P1";
      else if (rs >= kSurface || sc >= 40) tier = "P2";
      if (tier !== "P3") surfaced = true;
    }
    if (e.near52wHigh || e.near52wLow) surfaced = true;

    // ---- thesis break escalates straight to P0 (challenges the buy logic) ----
    let kind = "move";
    const th = e.thesis;
    if (th && th.broke) { tier = "P0"; surfaced = true; kind = th.kind === "catalyst" ? "catalyst" : "thesis"; }
    else if (th && th.kind === "catalyst" && th.strained) { tier = "P1"; surfaced = true; kind = "catalyst"; }

    const score = th && th.broke ? 100 : (kind === "catalyst" ? 70 : scoreOf(e, confirmed));
    const sigId = p.symbol + "_" + ymd(e.today.time_close * 1000);
    const dir = e.ret >= 0 ? "up" : "down";
    const pc = (x) => (x >= 0 ? "+" : "") + round(x * 100, 1) + "%";
    const pp = (x) => round(x * 100, 0) + "%";

    let headline = "", why = "";
    if (kind === "catalyst") {
      const verb = th.broke ? "void" : "weakening";
      headline = "⚠️ Catalyst thesis " + (th.broke ? "broken" : "strained") + " — " + p.symbol + ": " + th.label + ".";
      why = th.ref + " fell from " + pp(th.pHigh) + " to " + pp(th.pNow) + " (−" + round(th.relDrop * 100, 0) +
        "%, " + round(th.zc, 1) + "σ). The event you're betting on is being priced " + (th.broke ? "out" : "down") + " — the buy logic is " + verb + ".";
    } else if (kind === "thesis") {
      headline = "⚠️ Thesis break — " + p.symbol + ": held as a " + th.label + ", but the relationship isn't holding.";
      why = th.ref + " " + pc(th.refRet) + " (" + round(th.zRef, 1) + "σ) → thesis-expected " + p.symbol + " " +
        pc(th.expected) + " (β=" + round(th.beta, 1) + "), actual " + pc(e.ret) + ". Divergence " + pc(th.divergence) +
        " = " + round(th.V, 1) + "σ against the thesis (60d ρ " + round(th.corr, 2) + ").";
    } else if (surfaced && tier !== "P3") {
      headline = p.symbol + " " + pc(e.ret) + " (" + round(e.zTot, 1) +
        "σ), idiosyncratic " + round(e.zIdio, 1) + "σ" + (confirmed ? ", volume " + round(e.rvol, 1) + "× avg" : ", no volume confirm") +
        (p.cold_start ? " · cold-start baseline" : "");
      why = tier === "P0" ? "Large idiosyncratic move (" + round(e.zIdio, 1) + "σ vs residual vol) not explained by the market."
        : tier === "P1" ? "Notable single-name move beyond " + p.symbol + "'s residual-vol range."
        : "Elevated move, watching for confirmation.";
    } else if (e.near52wHigh) { headline = p.symbol + " at 52-week high"; why = "Milestone."; }
    else if (e.near52wLow) { headline = p.symbol + " at 52-week low"; why = "Milestone."; }

    holdings.push({
      date: asof * 1000, symbol: p.symbol, name: p.name, weight: round(p.weight, 3),
      price: round(e.today.price_close), ret_pct: round(e.ret * 100, 2), z: round(e.zTot, 2),
      residual_z: round(e.zIdio, 2), rvol: round(e.rvol, 2), dd_from_high_pct: round(e.ddFromHigh * 100, 2),
      beta: round(p.beta, 2), sigma_eps_pct: round(p.sigma_eps * 100, 2), tier: surfaced ? tier : "—",
      cold_start: !!p.cold_start, near_52w_high: !!e.near52wHigh, near_52w_low: !!e.near52wLow,
      thesis_label: th ? th.label : "", thesis_ref: th ? th.ref : "",
      thesis_corr: th && th.kind !== "catalyst" ? round(th.corr, 2) : null,
      thesis_state: th ? (th.broke ? "BROKEN" : th.strained || th.V >= 1.2 ? "strained" : "intact") : "",
    });
    if (surfaced) {
      signals.push({
        date: e.today.time_close * 1000, signal_id: sigId, symbol: p.symbol, name: p.name, tier, score, kind,
        direction: dir, ret_pct: round(e.ret * 100, 2), z: round(e.zTot, 2), residual_z: round(e.zIdio, 2),
        rvol: round(e.rvol, 2), weight: round(p.weight, 3), confirmed, market_driven: e.marketDriven,
        fdr_pass: fdrPass.has(p.symbol), cold_start: !!p.cold_start,
        thesis_break: kind === "thesis" || kind === "catalyst", headline, why,
        deep_link: "https://alva.ai/u/" + USER + "/playbooks/" + PLAYBOOK + "#sig-" + sigId,
      });
    }
  }

  // ---- portfolio layer ----
  const portRet = holdings.reduce((a, h) => a + (h.ret_pct / 100) * h.weight, 0);
  const betaW = profiles.reduce((a, p) => a + (p.beta || 1) * p.weight, 0);
  const portExpected = marketAvailable ? betaW * spyRet : null;
  const portDD = holdings.reduce((a, h) => a + (h.dd_from_high_pct / 100) * h.weight, 0);
  const p0 = signals.filter((s) => s.tier === "P0"), p1 = signals.filter((s) => s.tier === "P1"), p2 = signals.filter((s) => s.tier === "P2");
  const portBreach = Math.abs(portRet) >= 0.025;
  const anyMarketDriven = evals.some((e) => e.marketDriven);
  signals.sort((a, b) => b.score - a.score);

  const overview = {
    date: asof * 1000, as_of: new Date(asof * 1000).toISOString().slice(0, 10),
    port_return_pct: round(portRet * 100, 2), port_expected_pct: portExpected == null ? null : round(portExpected * 100, 2),
    market_return_pct: marketAvailable ? round(spyRet * 100, 2) : null, port_drawdown_pct: round(portDD * 100, 2),
    beta_weighted: round(betaW, 2), p0_count: p0.length, p1_count: p1.length, p2_count: p2.length,
    attention: p0.length + p1.length + (portBreach ? 1 : 0), sensitivity: SENSITIVITY, holdings_count: holdings.length,
    fdr_q: Q_FDR, fdr_selected: fdrPass.size,
    market_note: marketAvailable && anyMarketDriven ? "Market moved " + round(spyRet * 100, 1) +
      "%; some holdings tracked it (beta-driven, rolled up — not single-name news)." : "",
  };

  // ---- hysteresis / ratchet + push body ----
  await (async () => {})(); // placeholder; kv accessed in feed.run
  const feed = new Feed({
    path: feedPath("pw-watch"), name: "Portfolio Watch — Signals",
    description: "Rigorous: residual-vol z, FDR, hysteresis, bounded scoring, quiet-by-default alerts.",
  });
  feed.def("portfolio", { overview: makeDoc("Portfolio Overview", "Header metrics", [
    str("as_of"), num("port_return_pct"), num("port_expected_pct"), num("market_return_pct"), num("port_drawdown_pct"),
    num("beta_weighted"), num("p0_count"), num("p1_count"), num("p2_count"), num("attention"), str("sensitivity"),
    num("holdings_count"), num("fdr_q"), num("fdr_selected"), str("market_note")]) });
  feed.def("holdings", { rows: makeDoc("Holdings Grid", "Per-holding state", [
    str("symbol"), str("name"), num("weight"), num("price"), num("ret_pct"), num("z"), num("residual_z"), num("rvol"),
    num("dd_from_high_pct"), num("beta"), num("sigma_eps_pct"), str("tier"), bool("cold_start"), bool("near_52w_high"), bool("near_52w_low"),
    str("thesis_label"), str("thesis_ref"), num("thesis_corr"), str("thesis_state")]) });
  feed.def("signals", { items: makeDoc("Ranked Signals", "Surfaced real-moves", [
    str("signal_id"), str("symbol"), str("name"), str("tier"), num("score"), str("kind"), str("direction"), num("ret_pct"), num("z"),
    num("residual_z"), num("rvol"), num("weight"), bool("confirmed"), bool("market_driven"), bool("fdr_pass"), bool("cold_start"), bool("thesis_break"),
    str("headline"), str("why"), str("deep_link")]) });
  feed.def("universe", { rows: makeDoc("Searchable Universe", "Per-ticker evidence for search/add", [
    str("symbol"), num("price"), num("ret_pct"), num("z"), num("residual_z"), num("rvol"), num("beta")]) });
  feed.def("macro", { rows: makeDoc("Macro Context", "Portfolio-level prediction-market overlay", [
    str("factor"), str("label"), num("prob_now_pct"), num("change_pct"), num("z"), num("exposure_pct"), str("holdings"), str("note")]) });
  feed.def("smartmoney", { rows: makeDoc("Smart-money Positioning", "Insider open-market activity (trailing)", [
    str("symbol"), str("state"), num("buyers"), num("sellers"), num("buy_m"), num("sell_m"), str("note")]) });
  feed.def("options", { rows: makeDoc("Options-implied", "Expected move, IV premium, skew per holding", [
    str("symbol"), num("atm_iv_pct"), num("expected_move_pct"), num("iv_premium"), num("skew_pts"), num("days"), str("state"), str("note")]) });
  feed.def("crypto", { rows: makeDoc("Crypto Microstructure", "Perp funding + OI for crypto refs", [
    str("ref"), str("holdings"), num("funding_annual_pct"), num("funding_z"), num("oi_change_pct"), str("state"), str("note")]) });
  feed.def("sentiment", { rows: makeDoc("KOL Sentiment", "FinTwit curated-account stance per holding", [
    str("symbol"), num("bull_30d"), num("bear_30d"), num("lean"), str("state"), str("note")]) });
  feed.def("mnav", { rows: makeDoc("Crypto-treasury mNAV", "Market cap vs on-balance-sheet crypto NAV", [
    str("symbol"), num("mnav"), num("premium_pct"), num("mcap_b"), num("nav_b"), str("holdings"), str("state"), str("note")]) });
  feed.def("notify", { message: makeDoc("Push", "Quiet-by-default alert body", [str("title"), str("body")]) });

  let pushedFlag = false, body = "<|SKIP_NOTIFICATION|>";
  await feed.run(async (ctx) => {
    // hysteresis: decide which surfaced P0/P1 are NEW pushes (state 0->1 or tier up)
    const pushSet = [];
    for (const s of [...p0, ...(SENSITIVITY !== "Quiet" ? p1 : [])]) {
      const key = "hys_" + s.symbol;
      const prevRaw = await ctx.kv.load(key);
      const prev = prevRaw ? JSON.parse(prevRaw) : { on: false, tierRank: 0 };
      const rank = s.tier === "P0" ? 3 : s.tier === "P1" ? 2 : 1;
      const isNew = !prev.on || rank > prev.tierRank;
      if (isNew) pushSet.push(s);
      await ctx.kv.put(key, JSON.stringify({ on: true, tierRank: rank, sig: s.signal_id }));
    }
    // relax holdings that fell below z_off
    for (const h of holdings) {
      if (Math.abs(h.residual_z) <= Z_OFF) await ctx.kv.put("hys_" + h.symbol, JSON.stringify({ on: false, tierRank: 0 }));
    }

    if (pushSet.length || portBreach) {
      const lines = ["**Portfolio Watch — " + overview.as_of + "**"];
      if (portBreach) lines.push("⚠️ Portfolio " + (portRet >= 0 ? "+" : "") + round(portRet * 100, 1) +
        "% today, drawdown " + round(portDD * 100, 1) + "% — portfolio-level move.");
      for (const s of pushSet.slice(0, 4)) lines.push("\n**[" + s.tier + "] " + s.symbol + "**: " + s.headline +
        "\n" + s.why + "\nImpact: ~" + round(s.ret_pct * s.weight, 2) + "% of portfolio\nOpen: " + s.deep_link);
      if (overview.market_note) lines.push("\n_" + overview.market_note + "_");
      body = lines.join("\n");
      pushedFlag = true;
    }

    await ctx.self.ts("portfolio", "overview").append([overview]);
    await ctx.self.ts("holdings", "rows").append(holdings);
    if (universeRows.length) await ctx.self.ts("universe", "rows").append(universeRows);
    if (macroRows.length) await ctx.self.ts("macro", "rows").append(macroRows);
    if (smRows.length) await ctx.self.ts("smartmoney", "rows").append(smRows);
    if (optRows.length) await ctx.self.ts("options", "rows").append(optRows);
    if (cryptoRows.length) await ctx.self.ts("crypto", "rows").append(cryptoRows);
    if (sentiRows.length) await ctx.self.ts("sentiment", "rows").append(sentiRows);
    if (mnavRows.length) await ctx.self.ts("mnav", "rows").append(mnavRows);
    if (signals.length) await ctx.self.ts("signals", "items").append(signals);
    // notify uses processing time (monotonic) so the platform fanout dispatches
    // even when the demo asof points at a historical session; signals/holdings keep asof.
    await ctx.self.ts("notify", "message").append([{ date: Date.now(), title: "Portfolio Watch", body }]);
  });

  return { as_of: overview.as_of, port_return_pct: overview.port_return_pct, fdr_selected: fdrPass.size,
    signals: signals.length, tiers: { p0: p0.length, p1: p1.length, p2: p2.length }, pushed: pushedFlag,
    body_preview: body.slice(0, 360) };
})();
