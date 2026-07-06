// Portfolio Watch — Smart-money signal (insider + congress), v1
// "Who is positioning, with their own money?" Open-market insider BUYS (Form 4
// code P, excluding routine 10b5-1) by a CLUSTER of officers/directors are a
// high-signal, distinctive input. Role: a confirmer (raises confluence) and a
// DIVERGENCE signal (insiders buying while price falls = bullish divergence).
// Never a standalone push. Guardrails: disclosure lag, 10b5-1 filter, cluster.

const http = require("net/http");
const secret = require("secret-manager");
const JWT = secret.loadPlaintext("ARRAYS_JWT");
const H = { headers: { Authorization: "Bearer " + JWT } };
const BASE = "https://data-tools.prd.space.id";
async function gj(u) { const r = await http.fetch(u, H); const j = JSON.parse(await r.text()); return j.data || []; }

// Trailing-window insider positioning for one symbol, as of `asof`.
async function insiderSignal(symbol, asof, windowDays) {
  const start = asof - (windowDays || 120) * 86400;
  const raw = await gj(BASE + "/api/v1/stocks/insider/transactions?symbol=" + symbol +
    "&time_type=TRANSACTION_DATE&start_time=" + start + "&end_time=" + asof + "&limit=500");
  const seen = {}; const rows = raw.filter((x) => { const k = x.tx_id || (x.owner_name + x.transaction_date + x.amount + x.price); if (seen[k]) return false; seen[k] = 1; return true; }); // dedup
  const discretionary = (x) => x.is_10b51 !== true;         // drop pre-planned 10b5-1
  const notional = (x) => (parseFloat(x.amount) || 0) * (parseFloat(x.price) || 0);
  const buys = rows.filter((x) => x.transaction_code === "P" && discretionary(x));
  const sells = rows.filter((x) => x.transaction_code === "S" && discretionary(x));
  const buyers = new Set(buys.map((x) => x.owner_name));
  const sellers = new Set(sells.map((x) => x.owner_name));
  const buyNotional = buys.reduce((a, x) => a + notional(x), 0);
  const sellNotional = sells.reduce((a, x) => a + notional(x), 0);
  const cluster = buyers.size >= 2;                          // ≥2 distinct insiders buying
  const ceoBuy = buys.some((x) => /CEO|Chief Exec/i.test(x.officer_title || ""));
  // classify
  let state = "quiet", note = "";
  if ((cluster || ceoBuy) && buyNotional > sellNotional) {
    state = "cluster-buy";
    note = buyers.size + " insider" + (buyers.size > 1 ? "s" : "") + " bought ~$" +
      (buyNotional / 1e6).toFixed(1) + "M open-market" + (ceoBuy ? " (incl. the CEO)" : "") +
      " in the last " + (windowDays || 120) + "d — none pre-planned. Insiders are backing it with their own money.";
  } else if (sellers.size >= 3 && sellNotional > 3 * buyNotional) {
    state = "cluster-sell";
    note = sellers.size + " insiders sold ~$" + (sellNotional / 1e6).toFixed(1) + "M (ex-10b5-1) — broad insider distribution.";
  }
  return { symbol, buyers: buyers.size, sellers: sellers.size, buy_notional_m: +(buyNotional / 1e6).toFixed(1),
    sell_notional_m: +(sellNotional / 1e6).toFixed(1), cluster, ceoBuy, state, note,
    top: buys.sort((a, b) => notional(b) - notional(a)).slice(0, 3).map((x) => ({ who: x.owner_name, title: x.officer_title || (x.is_director ? "Director" : ""), date: x.transaction_date, m: +(notional(x) / 1e6).toFixed(1) })) };
}

(async () => {
  const asof = Math.floor(Date.now() / 1000); // current — trailing window is date-agnostic
  const holdings = ["NVDA", "TSLA", "AAPL", "MSTR", "ITB"];
  const out = [];
  for (const s of holdings) { try { out.push(await insiderSignal(s, asof, 400)); } catch (e) { out.push({ symbol: s, error: String(e) }); } }
  return { asof_date: new Date(asof * 1000).toISOString().slice(0, 10), signals: out.filter((o) => o.state && o.state !== "quiet"), all: out.map((o) => ({ s: o.symbol, buyers: o.buyers, sellers: o.sellers, state: o.state })) };
})();
