// UDF: edit the user's monitored watch set (holdings.json) AND, on add, compute
// the new ticker's evidence on the spot so the UI shows analysis immediately.
// Runs as the playbook owner. params: { action:add|remove, symbol, asof? }
const alfs = require("alfs");
const env = require("env");
const http = require("net/http");
const secret = require("secret-manager");

const CONFIG = "/alva/home/" + env.username + "/feeds/pw-config/v1/holdings.json";
const MODE_CFG = "/alva/home/" + env.username + "/feeds/pw-config/v1/mode.json";
const DEMO_ASOF = 1732237200; // 2024-11-21 session (MSTR + ITB thesis breaks)
const BASE = "https://data-tools.prd.space.id";
const KNOWN = {
  COIN: { name: "Coinbase", sector: "Crypto-linked" }, PLTR: { name: "Palantir", sector: "Software" },
  AMD: { name: "AMD", sector: "Semiconductors" }, GOOGL: { name: "Alphabet", sector: "Internet" },
  META: { name: "Meta", sector: "Internet" }, MSFT: { name: "Microsoft", sector: "Software" },
  NFLX: { name: "Netflix", sector: "Media" }, JPM: { name: "JPMorgan", sector: "Banks" },
};

function isoDay(ts) { return new Date(typeof ts === "number" ? ts * 1000 : Date.parse(ts)).toISOString().slice(0, 10); }
async function getJson(url) { const r = await http.fetch(url, { headers: { Authorization: "Bearer " + secret.loadPlaintext("ARRAYS_JWT") } }); const j = JSON.parse(await r.text()); if (!j.success) throw new Error("data " + url); return j.data; }
async function bars(sym, endT) { const u = BASE + "/api/v1/stocks/kline?symbol=" + sym + "&interval=1d&session=RTH&limit=90&start_time=" + (endT - 150 * 86400) + "&end_time=" + endT; return (await getJson(u)).slice().reverse(); }
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

async function evidenceFor(sym, asof) {
  const b = (await bars(sym, asof)).filter((x) => x.time_close <= asof);
  if (b.length < 25) return null;
  const spy = (await bars("SPY", asof)).filter((x) => x.time_close <= asof);
  const spyMap = {}; for (let i = 1; i < spy.length; i++) spyMap[isoDay(spy[i].time_close)] = (spy[i].price_close - spy[i - 1].price_close) / spy[i - 1].price_close;
  const rets = []; for (let i = 1; i < b.length; i++) rets.push((b[i].price_close - b[i - 1].price_close) / b[i - 1].price_close);
  const last = (a, n) => a.slice(Math.max(0, a.length - n));
  const sigma = sd(last(rets, 20)) || 0.02;
  const pairs = []; for (let i = 1; i < b.length; i++) { const r = spyMap[isoDay(b[i].time_close)]; if (r != null) pairs.push([(b[i].price_close - b[i - 1].price_close) / b[i - 1].price_close, r]); }
  let beta = 1, sEps = sigma;
  if (pairs.length >= 25) {
    const A = pairs.slice(0, pairs.length - 1).map((p) => p[0]), M = pairs.slice(0, pairs.length - 1).map((p) => p[1]);
    const ma = mean(A), mm = mean(M); let cov = 0, vm = 0; for (let k = 0; k < A.length; k++) { cov += (A[k] - ma) * (M[k] - mm); vm += (M[k] - mm) ** 2; }
    beta = vm > 0 ? cov / vm : 1; sEps = sd(A.map((x, k) => x - beta * M[k])) || sigma;
  }
  const today = b[b.length - 1], prev = b[b.length - 2];
  const ret = (today.price_close - prev.price_close) / prev.price_close;
  const spyRet = spyMap[isoDay(today.time_close)] || 0;
  const avgVol = mean(last(b.map((x) => x.volume_traded), 20));
  const r2 = (x) => Math.round(x * 100) / 100;
  return { symbol: sym, price: r2(today.price_close), ret_pct: r2(ret * 100), z: r2(ret / sigma), residual_z: r2((ret - beta * spyRet) / sEps), rvol: avgVol ? r2(today.volume_traded / avgVol) : null, beta: r2(beta) };
}

(async () => {
  const a = env.args || {};
  const action = a.action;

  // ---- Demo/Live toggle: flip the run mode the feed reads on its next run ----
  if (action === "mode") {
    const mode = String(a.mode || "").toLowerCase();
    if (mode !== "live" && mode !== "demo") throw new Error("need mode=live|demo");
    const demo_asof = mode === "demo" ? DEMO_ASOF : null;
    await alfs.writeFile(MODE_CFG, JSON.stringify({ demo_asof }, null, 2));
    return { ok: true, action: "mode", mode, demo_asof, note: "Saved. Applies on the next pw-watch run." };
  }

  // ---- Onboarding: confirm (or clear) a holding's buy-thesis, written to config ----
  if (action === "thesis") {
    const sym = String(a.symbol || "").toUpperCase().trim();
    if (!sym) throw new Error("need symbol");
    let c = { holdings: [] };
    try { c = JSON.parse(String(await alfs.readFile(CONFIG))); } catch (e) {}
    if (!Array.isArray(c.holdings)) c.holdings = [];
    const h = c.holdings.find((x) => x.symbol === sym);
    if (!h) throw new Error("not monitored: " + sym);
    if (a.clear) { delete h.thesis; }
    else { h.thesis = { ref: String(a.ref || "SPY").toUpperCase(), refType: a.refType || "stock", type: a.thesisType || "proxy", label: String(a.label || "") }; }
    await alfs.writeFile(CONFIG, JSON.stringify(c, null, 2));
    return { ok: true, action: "thesis", symbol: sym, thesis: h.thesis || null, note: "Saved — monitored from the next run." };
  }

  const symbol = String(a.symbol || "").toUpperCase().trim();
  const asof = Number(a.asof) || Math.floor(Date.now() / 1000);
  if (!symbol || (action !== "add" && action !== "remove")) throw new Error("need action=add|remove|mode|thesis");

  let cfg = { holdings: [] };
  try { cfg = JSON.parse(String(await alfs.readFile(CONFIG))); } catch (e) {}
  if (!Array.isArray(cfg.holdings)) cfg.holdings = [];

  let evidence = null;
  if (action === "add") {
    if (!cfg.holdings.some((h) => h.symbol === symbol)) {
      const meta = KNOWN[symbol] || {};
      cfg.holdings.push({ symbol, name: a.name || meta.name || symbol, weight: 0, sector: meta.sector || "" });
    }
    try { evidence = await evidenceFor(symbol, asof); } catch (e) { evidence = null; }
  } else {
    cfg.holdings = cfg.holdings.filter((h) => h.symbol !== symbol);
  }
  const n = cfg.holdings.length;
  if (n) cfg.holdings.forEach((h) => { h.weight = Math.round((1 / n) * 1000) / 1000; });
  await alfs.writeFile(CONFIG, JSON.stringify(cfg, null, 2));
  return { ok: true, action, symbol, monitored: cfg.holdings.map((h) => h.symbol), evidence };
})();
