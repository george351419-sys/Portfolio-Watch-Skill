// Portfolio Watch — Options-implied signal, v1
// The options market's forward view: ATM implied vol → expected move; implied vs
// realized vol → the "fear premium" (is the market bracing for a bigger move than
// recent history); put−call IV skew → downside fear. Role: context/enrichment +
// catalyst-thesis-adjacent forward reference. Never a standalone push.

const http = require("net/http");
const secret = require("secret-manager");
const JWT = secret.loadPlaintext("ARRAYS_JWT");
const H = { headers: { Authorization: "Bearer " + JWT } };
const BASE = "https://data-tools.prd.space.id";
async function gj(u) { const r = await http.fetch(u, H); return JSON.parse(await r.text()); }
const sd = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

async function atmIV(symbol, type, now) {
  const j = await gj(BASE + "/api/v1/options/chain?symbol=" + symbol + "&limit=250&contract_type=" + type +
    "&start_expiration_date=" + (now + 14 * 86400) + "&end_expiration_date=" + (now + 45 * 86400));
  const res = (j.data && j.data[0] && j.data[0].results) || [];
  const withIV = res.filter((c) => c.implied_volatility > 0 && c.details && c.details.strike_price);
  if (!withIV.length) return null;
  const spot = res[0].underlying_asset && res[0].underlying_asset.price;
  if (!spot) return null;
  const atm = withIV.reduce((b, c) => Math.abs(c.details.strike_price - spot) < Math.abs((b ? b.details.strike_price : 1e9) - spot) ? c : b, null);
  const days = Math.max(1, Math.round((Date.parse(atm.details.expiration_date) / 1000 - now) / 86400));
  return { spot, iv: atm.implied_volatility, strike: atm.details.strike_price, days };
}
async function realizedVolAnnual(symbol, now) {
  const j = await gj(BASE + "/api/v1/stocks/kline?symbol=" + symbol + "&interval=1d&session=RTH&limit=30&start_time=" + (now - 50 * 86400) + "&end_time=" + now);
  const b = (j.data || []).slice().reverse();
  const r = []; for (let i = 1; i < b.length; i++) r.push((b[i].price_close - b[i - 1].price_close) / b[i - 1].price_close);
  return sd(r.slice(-20)) * Math.sqrt(252);
}

async function optionsSignal(symbol, now) {
  const call = await atmIV(symbol, "call", now);
  const put = await atmIV(symbol, "put", now);
  if (!call) return { symbol, state: "no options data" };
  const iv = put ? (call.iv + put.iv) / 2 : call.iv;
  const rv = await realizedVolAnnual(symbol, now);
  const expMovePct = iv * Math.sqrt(call.days / 365) * 100;   // ± expected move over the contract's life
  const premium = rv > 0 ? iv / rv : null;                    // implied / realized
  const skew = put ? put.iv - call.iv : null;                 // downside fear
  let state = "normal", note = "";
  if (premium != null && premium >= 1.3) { state = "elevated";
    note = "IV " + (iv * 100).toFixed(0) + "% is " + premium.toFixed(1) + "× recent realized (" + (rv * 100).toFixed(0) + "%) — the options market is bracing for a bigger move (often pre-catalyst)."; }
  else if (skew != null && skew >= 0.05) { state = "downside-skew";
    note = "Put IV exceeds call IV by " + (skew * 100).toFixed(0) + "pts — options are pricing downside fear."; }
  return { symbol, spot: +call.spot.toFixed(2), atm_iv_pct: +(iv * 100).toFixed(0), realized_vol_pct: +(rv * 100).toFixed(0),
    iv_premium: premium ? +premium.toFixed(2) : null, expected_move_pct: +expMovePct.toFixed(1), days: call.days,
    put_call_skew_pts: skew != null ? +(skew * 100).toFixed(0) : null, state, note };
}

(async () => {
  const now = Math.floor(Date.now() / 1000);
  const out = [];
  for (const s of ["NVDA", "TSLA", "AAPL", "MSTR"]) { try { out.push(await optionsSignal(s, now)); } catch (e) { out.push({ symbol: s, error: String(e) }); } }
  return { as_of: new Date(now * 1000).toISOString().slice(0, 10), rows: out };
})();
