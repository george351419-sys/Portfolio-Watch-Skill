// Portfolio Watch — Crypto-treasury mNAV lens, v1
// For companies that hold crypto on the balance sheet (MSTR, MARA, ...): market
// cap vs the market value of the crypto they hold → premium/discount to NAV.
// A big premium = leverage/optimism froth; a discount = value dislocation or
// skepticism. Role: crypto-linked valuation enrichment (community: PURR mNAV).

const http = require("net/http");
const secret = require("secret-manager");
const JWT = secret.loadPlaintext("ARRAYS_JWT");
const H = { headers: { Authorization: "Bearer " + JWT } };
const BASE = "https://data-tools.prd.space.id";
async function gj(u) { const r = await http.fetch(u, H); const j = JSON.parse(await r.text()); return j.data || []; }

async function marketCap(sym, now) {
  const mc = await gj(BASE + "/api/v1/stocks/market-metrics?symbol=" + sym + "&indicator=MARKET_CAP&interval=1d&start_time=" + (now - 20 * 86400) + "&end_time=" + now);
  return mc[0] && mc[0].values && mc[0].values[0] ? mc[0].values[0].value : null;
}
async function cryptoPrice(token, now) {
  const k = await gj(BASE + "/api/v1/crypto/binance/spot/usdt/kline?symbol=" + token + "&interval=1d&limit=2&start_time=" + (now - 6 * 86400) + "&end_time=" + now);
  return k[0] && k[0].price_close;
}

async function mnav(sym, now, holdingsIndex) {
  const rec = holdingsIndex[sym]; if (!rec || !rec.token_holdings) return { symbol: sym, state: "not a crypto-treasury" };
  const tokens = Object.keys(rec.token_holdings);
  let nav = 0; const parts = [];
  for (const tk of tokens) {
    const amt = rec.token_holdings[tk] && rec.token_holdings[tk].amount; if (!amt) continue;
    const px = await cryptoPrice(tk, now); if (!px) continue;
    nav += amt * px; parts.push(tk + " " + (amt / 1e3).toFixed(0) + "k × $" + Math.round(px));
  }
  const mc = await marketCap(sym, now);
  if (!mc || !nav) return { symbol: sym, state: "incomplete" };
  const m = mc / nav, prem = (m - 1) * 100;
  let state = "near-NAV", note = "";
  if (m >= 1.2) { state = "premium"; note = sym + " market cap $" + (mc / 1e9).toFixed(1) + "B is " + prem.toFixed(0) + "% above the crypto it holds ($" + (nav / 1e9).toFixed(1) + "B) — a leverage/optimism premium."; }
  else if (m <= 0.9) { state = "discount"; note = sym + " trades " + (-prem).toFixed(0) + "% BELOW its crypto NAV ($" + (nav / 1e9).toFixed(1) + "B vs $" + (mc / 1e9).toFixed(1) + "B mcap) — a valuation dislocation."; }
  else { note = sym + " near NAV (mNAV " + m.toFixed(2) + ")."; }
  return { symbol: sym, mnav: +m.toFixed(2), premium_pct: +prem.toFixed(0), mcap_b: +(mc / 1e9).toFixed(1), nav_b: +(nav / 1e9).toFixed(1), holdings: parts.join(", "), state, note };
}

(async () => {
  const now = Math.floor(Date.now() / 1000);
  const hold = await gj(BASE + "/api/v1/crypto/holdings?symbol=BTC");
  const idx = {}; hold.forEach((h) => { if (h.symbol) idx[h.symbol] = h; });
  const out = [];
  for (const s of ["MSTR", "MARA", "COIN"]) { try { out.push(await mnav(s, now, idx)); } catch (e) { out.push({ symbol: s, error: String(e) }); } }
  return { as_of: new Date(now * 1000).toISOString().slice(0, 10), rows: out };
})();
