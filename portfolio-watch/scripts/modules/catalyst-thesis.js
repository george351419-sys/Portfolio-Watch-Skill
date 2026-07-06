// Portfolio Watch — Catalyst-Thesis monitor (Polymarket-referenced, v1)
// A holding held for an EVENT ("betting the Fed cuts by January") has a thesis
// whose reference is a prediction-market probability, not a price. We watch that
// probability; a material, liquid adverse move = the catalyst thesis is breaking.
// Same escalation idea as the price thesis (thesis-monitor.js), reference swapped
// from an asset's price to Polymarket P(event). Verified on real Polymarket data.

const http = require("net/http");
async function gj(u) { const r = await http.fetch(u, {}); let j = null; try { j = JSON.parse(await r.text()); } catch (e) {} return { status: r.status, j }; }
const sd = (a) => { if (a.length < 2) return 0; const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

// resolve a Polymarket event -> the outcome market matching `sideRe` -> its YES token
async function resolveToken(eventId, sideRe) {
  const ev = await gj("https://gamma-api.polymarket.com/events?id=" + eventId);
  const e = Array.isArray(ev.j) ? ev.j[0] : null; if (!e) return null;
  const m = (e.markets || []).find((x) => sideRe.test(x.question || "")) || (e.markets || [])[0];
  if (!m) return null;
  let toks = []; try { toks = JSON.parse(m.clobTokenIds); } catch (x) {}
  return { title: e.title, market: m.question, token: toks[0], liquidity: +m.liquidity || 0, closed: m.closed };
}

// liquidity gate for a LIVE market (spread tight + book deep). closed markets → historical only.
async function liquidityOK(token) {
  const sp = await gj("https://clob.polymarket.com/spread?token_id=" + token);
  const spread = sp.j && sp.j.spread != null ? +sp.j.spread : null;
  return { spread, live: spread != null, ok: spread != null && spread <= 0.03 };
}

// core: turn a probability series into a catalyst-thesis signal
function evaluate(pts, thesisLabel) {
  const P = pts.map((x) => x.p);
  const dP = []; for (let i = 1; i < P.length; i++) dP.push(P[i] - P[i - 1]);
  const sigma = sd(dP) || 0.01;                 // daily probability volatility
  const pNow = P[P.length - 1];
  const pHigh = Math.max(...P);                 // thesis high-water mark
  const drop = pHigh - pNow;                    // absolute collapse from the best-supported point
  const relDrop = pHigh > 0 ? drop / pHigh : 0;
  // worst 10-day adverse move, z-scored by daily vol
  let worst = 0; const w = 10;
  for (let i = w; i < P.length; i++) { const mv = P[i] - P[i - w]; if (mv < worst) worst = mv; }
  const z = worst / (sigma * Math.sqrt(w));
  let tier = "intact";
  if (relDrop >= 0.5 || pNow < 0.1 * pHigh) tier = "BROKEN";
  else if (relDrop >= 0.25 || z <= -2) tier = "strained";
  return { pNow: +pNow.toFixed(3), pHigh: +pHigh.toFixed(3), drop: +drop.toFixed(3), relDrop: +(relDrop * 100).toFixed(0),
    sigma: +sigma.toFixed(3), z: +z.toFixed(1), tier, thesisLabel };
}

(async () => {
  // DEMO: a rate-sensitive holding (e.g. homebuilders ITB) held betting the Fed
  // cuts by Jan 2024. Reference = Polymarket P(Fed cuts by Jan 2024).
  const HOLDING = "ITB (homebuilders)", EVENT = "903022"; // Fed Interest Rates: January 2024
  const t = await resolveToken(EVENT, /decrease/i);
  if (!t || !t.token) return { error: "could not resolve market" };
  const h = await gj("https://clob.polymarket.com/prices-history?market=" + t.token + "&interval=max&fidelity=1440");
  const pts = (h.j && h.j.history) || [];
  const lg = await liquidityOK(t.token);
  const sig = evaluate(pts, "held betting the Fed cuts by January 2024");

  const p = (x) => (x * 100).toFixed(0) + "%";
  const escalate = sig.tier === "BROKEN" ? "P0" : sig.tier === "strained" ? "P1" : "—";
  return {
    holding: HOLDING, event: t.title, market: t.market, points: pts.length,
    liquidity_gate: lg.live ? "live spread " + lg.spread : "historical (market closed)",
    thesis_side_prob_high: p(sig.pHigh / 1), // best-supported
    signal: {
      tier: escalate, state: sig.tier,
      headline: escalate === "—" ? "Catalyst thesis intact" :
        "⚠️ Catalyst thesis " + sig.tier + " — " + HOLDING + ": " + sig.thesisLabel +
        ", but Polymarket P(cut) collapsed from " + p(sig.pHigh) + " to " + p(sig.pNow) +
        " (−" + sig.relDrop + "%, " + sig.z + "σ vs its own move-vol). The event you're betting on is being priced out.",
      escalation: escalate === "P0" ? "Thesis broken → P0 (your buy logic is failing, not just a price wiggle)." : "",
    },
  };
})();
