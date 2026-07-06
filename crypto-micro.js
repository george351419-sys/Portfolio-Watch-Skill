// Portfolio Watch — Crypto microstructure, v1
// For crypto / crypto-linked holdings: perpetual funding (crowded positioning),
// open-interest change (leverage building / deleveraging). Extreme funding = froth
// or capitulation; a funding-vs-price or OI signal is a distinctive crypto input.
// Role: enriches the crypto/crypto-linked thesis + a crypto-stress context.

const http = require("net/http");
const secret = require("secret-manager");
const JWT = secret.loadPlaintext("ARRAYS_JWT");
const H = { headers: { Authorization: "Bearer " + JWT } };
const BASE = "https://data-tools.prd.space.id";
async function gj(u) { const r = await http.fetch(u, H); return (JSON.parse(await r.text())).data || []; }
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

async function cryptoMicro(sym, now) {
  const fr = await gj(BASE + "/api/v1/crypto/funding-rate?symbol=" + sym + "&start_time=" + (now - 45 * 86400) + "&end_time=" + now + "&limit=300");
  const oi = await gj(BASE + "/api/v1/crypto/open-interest?symbol=" + sym + "&start_time=" + (now - 30 * 86400) + "&end_time=" + now + "&limit=200");
  if (!fr.length) return { symbol: sym, state: "no data" };
  const rates = fr.map((x) => x.funding_rate);         // latest first
  const latest = rates[0];
  const annual = latest * 3 * 365 * 100;               // 3 settlements/day, %/yr
  const z = sd(rates) ? (latest - mean(rates)) / sd(rates) : 0;
  let oiChg = null;
  if (oi.length >= 8) { const oiVals = oi.map((x) => x.sum_open_interest_value); oiChg = (oiVals[0] - oiVals[7]) / oiVals[7] * 100; }
  let state = "normal", note = "";
  if (z >= 2 || annual >= 40) { state = "crowded-longs";
    note = sym + " perp funding is elevated (" + annual.toFixed(0) + "%/yr, " + z.toFixed(1) + "σ) — longs are crowded and paying up; squeeze/mean-revert risk."; }
  else if (z <= -2 || annual <= -20) { state = "capitulation";
    note = sym + " funding is deeply negative (" + annual.toFixed(0) + "%/yr) — shorts crowded / capitulation."; }
  else if (oiChg != null && oiChg <= -12) { state = "deleveraging";
    note = sym + " open interest fell " + oiChg.toFixed(0) + "% in a week — leverage flushing out (liquidations)."; }
  return { symbol: sym, funding_annual_pct: +annual.toFixed(0), funding_z: +z.toFixed(1), oi_change_pct: oiChg != null ? +oiChg.toFixed(0) : null, state, note };
}

(async () => {
  const now = Math.floor(Date.now() / 1000);
  const out = [];
  for (const s of ["BTC", "ETH", "SOL"]) { try { out.push(await cryptoMicro(s, now)); } catch (e) { out.push({ symbol: s, error: String(e) }); } }
  return { as_of: new Date(now * 1000).toISOString().slice(0, 10), rows: out };
})();
