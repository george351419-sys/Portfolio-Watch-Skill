// Portfolio Watch — FinTwit KOL sentiment, v1
// Reads Alva's Platform Data (Fintwit Intelligence, host `zet`, public read):
// curated financial-Twitter accounts' bull/bear stance per ticker. Role:
// information-layer context/confirmer + divergence (KOLs lean one way while price
// goes the other). Curated accounts only (not raw influencer noise); cite snapshot.

const alfs = require("alfs");
const SENT_PATH = "/alva/home/zet/feeds/kol-ticker-sentiment/v1/data/sentiment/tickers/@last/1";

async function loadSentiment() {
  const raw = await alfs.readFile(SENT_PATH);
  const arr = JSON.parse(String(raw));
  const rows = []; (Array.isArray(arr) ? arr : [arr]).forEach((x) => { if (x && x.items) rows.push(...x.items); else if (x) rows.push(x); });
  const bySym = {}; rows.forEach((r) => { const t = r.ticker || r.symbol; if (t) bySym[t] = r; });
  return { bySym, snapshot: rows[0] && rows[0].date };
}

function sentimentSignal(r) {
  if (!r) return { state: "no coverage" };
  const bull = r.bull_kol_count_30d || 0, bear = r.bear_kol_count_30d || 0;
  const bull7 = r.bull_kol_count_7d || 0, bear7 = r.bear_kol_count_7d || 0;
  const total = bull + bear;
  const lean = total ? (bull - bear) / total : 0;
  let state = "mixed", note = "";
  if (total < 2) state = "thin";
  else if (lean >= 0.5 && bull >= 3) { state = "KOL-bullish"; note = bull + " tracked KOLs bullish / " + bear + " bearish (30d), " + (r.bull_signal_count_30d || 0) + " bull calls."; }
  else if (lean <= -0.5 && bear >= 3) { state = "KOL-bearish"; note = bear + " tracked KOLs bearish / " + bull + " bullish (30d) — curated accounts leaning negative."; }
  else { state = "mixed"; note = bull + " bull / " + bear + " bear KOLs (30d)."; }
  return { bull_30d: bull, bear_30d: bear, bull_7d: bull7, bear_7d: bear7, lean: +lean.toFixed(2), state, note };
}

(async () => {
  const { bySym, snapshot } = await loadSentiment();
  const out = {};
  for (const s of ["NVDA", "TSLA", "AAPL", "MSTR", "COIN", "ITB"]) out[s] = sentimentSignal(bySym[s]);
  return { snapshot_ms: snapshot, source: "Alva Fintwit Intelligence (host: zet)", rows: out };
})();
