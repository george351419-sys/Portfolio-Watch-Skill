// Portfolio Watch — Alert Fusion Engine (Narrative Fusing + Silent Update)
// Delivery-side coalescing: collapse a multi-event incident into ONE evolving
// IM card. Reusable module + self-test. Wire `store` to ctx.kv in a live feed;
// wire the Telegram adapter with a Secret-Manager bot token.

// --- causal precedence: causal events take narrative sovereignty over price/vol ---
const CAUSAL_RANK = {
  earnings: 3, guidance: 3, ma: 3, regulatory: 3, halt: 3, exploit: 3,
  news: 2, filing: 2,
  short: 1, volume: 1, price: 1, gap: 1, milestone: 1,
};
const TIER_RANK = { none: -1, P3: 0, P2: 1, P1: 2, P0: 3 };
const W_MS = 10 * 60 * 1000; // coalescing window
const W_MAX_MS = 30 * 60 * 1000; // hard cap on episode growth

const fmtT = (ms) => new Date(ms).toISOString().slice(11, 16); // HH:MM
const maxTier = (a, b) => (TIER_RANK[a] >= TIER_RANK[b] ? a : b);
const r2 = (x) => Math.round(x * 100) / 100;

// Narrative fusion: recompose the episode into one coherent card.
function fuse(ep) {
  const head = ep.evidence
    .slice()
    .sort((a, b) => CAUSAL_RANK[b.type] - CAUSAL_RANK[a.type] || b.severity - a.severity)[0];
  const trail = ep.evidence
    .slice()
    .sort((a, b) => a.t - b.t)
    .map((a) => fmtT(a.t) + " " + a.text)
    .join(" → ");
  return (
    "[" + ep.tier + "] " + ep.symbol + " — " + head.text +
    "\nDeveloping: " + trail +
    "\nImpact: ~" + r2(ep.impact) + "% of portfolio" +
    "\nOpen: " + ep.deep_link
  );
}

class FusionEngine {
  constructor(store) {
    this.store = store || new Map(); // key -> episode (swap for ctx.kv wrapper)
  }
  // ingest a signal atom; returns a delivery action for the IM layer
  ingest(sig, nowMs) {
    const key = sig.cluster || sig.symbol;
    let ep = this.store.get(key);
    if (ep && nowMs < ep.t_seal) {
      // attach to open episode
      ep.evidence.push(sig.atom);
      ep.t_seal = Math.min(ep.t_open + W_MAX_MS, Math.max(ep.t_seal, nowMs + W_MS));
      ep.tier = maxTier(ep.tier, sig.tier);
      ep.impact += sig.impact;
    } else {
      // open a fresh episode
      ep = {
        symbol: sig.symbol, t_open: nowMs, t_seal: nowMs + W_MS,
        tier: sig.tier, tier_notified: "none", evidence: [sig.atom],
        impact: sig.impact, deep_link: sig.deep_link, msg_ref: null,
      };
      this.store.set(key, ep);
    }
    const body = fuse(ep);
    let action;
    if (ep.msg_ref == null) {
      action = { op: "send", buzz: true, body }; // first alert → one vibration
      ep.msg_ref = "msg#" + (nowMs % 100000);
      ep.tier_notified = ep.tier;
    } else if (TIER_RANK[ep.tier] > TIER_RANK[ep.tier_notified]) {
      action = { op: "send", buzz: true, escalation: true, body }; // escalation override
      ep.tier_notified = ep.tier;
    } else {
      action = { op: "edit", buzz: false, body, ref: ep.msg_ref }; // silent update
    }
    return action;
  }
}

// --- Telegram delivery adapter (BYOD; wire in a live feed, never in the demo) ---
// const http = require("net/http"); const secret = require("secret-manager");
async function tgSend(http, token, chatId, text) {
  const r = await http.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
  return (JSON.parse(await r.text()).result || {}).message_id; // store as msg_ref
}
async function tgEdit(http, token, chatId, messageId, text) {
  // editMessageText never rings — inherently silent
  await http.fetch("https://api.telegram.org/bot" + token + "/editMessageText", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: "Markdown" }),
  });
}

// ===================== SELF-TEST (synthetic logic test, not market data) =====================
(async () => {
  const eng = new FusionEngine();
  const dl = "https://alva.ai/u/demo/playbooks/portfolio-watch#sig-NVDA";
  const t0 = Date.UTC(2026, 5, 25, 14, 2, 0);
  // Reference anti-pattern: 3 correct signals for ONE NVDA incident within 5 min
  const timeline = [
    { symbol: "NVDA", tier: "P2", impact: -1.7, deep_link: dl,
      atom: { t: t0, type: "price", severity: 2.1, text: "-5.2σ selloff" } },
    { symbol: "NVDA", tier: "P2", impact: -0.3, deep_link: dl,
      atom: { t: t0 + 2 * 60000, type: "short", severity: 1.6, text: "short volume 3× avg" } },
    { symbol: "NVDA", tier: "P0", impact: -0.6, deep_link: dl,
      atom: { t: t0 + 4 * 60000, type: "guidance", severity: 2.8, text: "guidance cut confirmed" } },
  ];

  const out = [];
  let buzzes = 0;
  for (const s of timeline) {
    const a = eng.ingest(s, s.atom.t);
    if (a.buzz) buzzes++;
    out.push({
      at: fmtT(s.atom.t), event: s.atom.text,
      op: a.op, buzz: a.buzz ? "📳 BUZZ" + (a.escalation ? " (escalation)" : "") : "🔕 silent edit",
      headline: a.body.split("\n")[0],
    });
  }

  return {
    delivery_log: out,
    naive_buzzes: timeline.length,
    fused_buzzes: buzzes,
    final_card: eng.store.get("NVDA") ? fuse(eng.store.get("NVDA")) : null,
  };
})();
