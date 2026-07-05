// UDF: edit the user's monitored watch set (holdings.json) from the playbook UI.
// Runs as the playbook owner; edits the owner's config. add | remove a symbol.
const alfs = require("alfs");
const env = require("env");

const CONFIG = "/alva/home/" + env.username + "/feeds/pw-config/v1/holdings.json";
const KNOWN = {
  COIN: { name: "Coinbase", sector: "Crypto-linked" }, PLTR: { name: "Palantir", sector: "Software" },
  AMD: { name: "AMD", sector: "Semiconductors" }, GOOGL: { name: "Alphabet", sector: "Internet" },
  META: { name: "Meta", sector: "Internet" }, MSFT: { name: "Microsoft", sector: "Software" },
  NFLX: { name: "Netflix", sector: "Media" }, JPM: { name: "JPMorgan", sector: "Banks" },
};

(async () => {
  const a = env.args || {};
  const action = a.action;
  const symbol = String(a.symbol || "").toUpperCase().trim();
  if (!symbol || (action !== "add" && action !== "remove")) throw new Error("need action=add|remove and symbol");

  let cfg = { holdings: [] };
  try { cfg = JSON.parse(String(await alfs.readFile(CONFIG))); } catch (e) {}
  if (!Array.isArray(cfg.holdings)) cfg.holdings = [];

  if (action === "add") {
    if (!cfg.holdings.some((h) => h.symbol === symbol)) {
      const meta = KNOWN[symbol] || {};
      cfg.holdings.push({ symbol, name: a.name || meta.name || symbol, weight: 0, sector: meta.sector || "" });
    }
  } else {
    cfg.holdings = cfg.holdings.filter((h) => h.symbol !== symbol);
  }
  // equal-weight normalise
  const n = cfg.holdings.length;
  if (n) cfg.holdings.forEach((h) => { h.weight = Math.round((1 / n) * 1000) / 1000; });

  await alfs.writeFile(CONFIG, JSON.stringify(cfg, null, 2));
  return { ok: true, action, symbol, monitored: cfg.holdings.map((h) => h.symbol) };
})();
