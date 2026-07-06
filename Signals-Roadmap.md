# Portfolio Watch — Additional Signals Roadmap

Integrating more Alva data sources (the way Polymarket was integrated) to deepen
the strategy — **without adding alert noise**.

## Architecture principle (non-negotiable)

A new source may only plug into one of five existing mechanisms; it never spawns
an independent per-stock alert stream:

1. **Confirmer** → raises confluence `F` in the 0–100 score (upgrades an existing
   move's tier when independent evidence agrees).
2. **Divergence signal** → reuses the residual/thesis machinery (a positioning
   series that diverges from price becomes a heads-up).
3. **Thesis reference** → the source is the reference series for a thesis
   (options IV / crypto funding as invariants).
4. **Context overlay** → a portfolio-level panel (like the Polymarket macro
   overlay), not per-stock alerts.
5. **Enrichment** → attached to an existing signal's *why*, no new card.

Every source is **gated** (liquidity/quality/recency), **labeled** with its lag
and provenance, and is a confirmer/context — not a standalone trigger — except
where it is an explicit thesis reference.

## Phases (each: explore real data → build+verify module → wire live → doc → push)

### Phase 1 — Smart-money divergence (insider + congress)  ⭐
- Source: `equity-ownership-and-flow` (insider Form 4, congress trades).
- Signal: **cluster** open-market buying/selling; **divergence** (insiders buy
  while price falls = bullish divergence, and vice-versa).
- Role: confirmer (F) + divergence signal.
- Guardrails: disclosure lag (insiders ~2d, congress ~45d — label it); drop
  routine 10b5-1 sales; require a *cluster*, not one filer.

### Phase 2 — Options-implied signal
- Source: `options` (IV, chain, OI, Greeks).
- Signal: unusual options activity (vol ≥ 2× OI, blocks pre-catalyst), IV-rank
  spike, expected move.
- Role: confirmer (F) + **catalyst-thesis reference** (IV/expected-move ≈ the
  options market's implied probability, the dual of Polymarket) + enrichment.
- Guardrails: only when options exist & liquid; never push options-only.

### Phase 3 — Crypto microstructure
- Source: `crypto-futures-data` (funding, OI, liquidations, long-short),
  `crypto-exchange-flow`, `crypto-metrics` (MVRV/NUPL, stablecoin peg).
- Signal: leverage stress (funding extreme + OI + liquidations), exchange-inflow
  sell pressure, on-chain regime.
- Role: crypto confirmer + **enriches the MSTR/COIN/BTC thesis** + a crypto
  stress overlay.
- Guardrails: crypto/crypto-linked holdings only; wash-volume filters.

### Phase 4 — Sector fundamental leading indicators
- Sources: `semiconductor-price` (DRAM/NAND/DXI — a real leading indicator for
  NVDA), `etf-fundamentals` (sector fund flows = rotation),
  `equity-estimates-and-targets` (consensus estimate revisions).
- Role: **context overlays** (sector headwind/tailwind, rotation) + estimate-
  revision confirmer.
- Guardrails: map to the right sector holdings; context, not per-stock alerts.

## Status
- Phase 1: ✅ DONE — smart-money.js verified (MSTR 10-insider cluster $31M, TSLA CEO $1B); live "Smart-money positioning" green context panel
- Phase 2: ✅ DONE — options-signal.js verified (MSTR ±22% expected move, 12pt downside skew); live per-holding options enrichment
- Phase 3: ✅ DONE — crypto-micro.js verified (BTC funding 8%/yr, OI +9%); live crypto backdrop on crypto-linked holdings (MSTR via BTC)
- Phase 4: ✅ DONE (semiconductor) — DXI memory-cycle overlay live (NVDA tailwind); ETF-flows + estimate-revisions specced as conventional confirmers (not wired in the 5-holding demo)

---

## Round 2 — Community-inspired optimizations

Referencing Alva's trending playbooks (zet's FinTwit leaderboard/sentiment ★72/17,
lake's chipflation, PURR mNAV tracker, war-room consoles, scheduled AI digests).
Same architecture principle (new source → existing mechanism, no new noise).

- **Phase A — FinTwit KOL sentiment.** Per-holding bullish/bearish signal from
  quality-weighted covered accounts. Role: information-layer confirmer + divergence
  (KOLs flip vs price). Guardrail: weight by track record; confirmer, not "influencer shouting".
- **Phase B — Crypto-treasury mNAV lens.** For crypto-linked names (MSTR): market
  cap vs on-chain crypto-holdings NAV → premium/discount. Role: crypto-linked
  enrichment / valuation context. Data: company-crypto-holdings + market cap + BTC price.
- **Phase C — Scheduled AI daily digest.** A once-a-day narrative summary of the
  book (alpi/alvaask), separate from quiet-by-default alerts. Habit-forming touchpoint.
- **Phase D — Single-holding War-Room drill-down.** Click a holding → a deep view
  aggregating all its signals (price/thesis/insider/options/crypto/sentiment).
- **Phase E — Presentation.** Catchier name, a pinned creator's note, precise tags
  for explore discoverability.

### Round 2 status
- Phase A: ✅ DONE — fintwit-sentiment.js verified (NVDA 11 KOLs bullish/0 bearish, source Alva Fintwit Intelligence); live KOL sentiment chip on holdings
- Phase B: ✅ DONE — mnav-lens.js verified (MSTR mNAV 0.65 = 35% discount to 847k-BTC NAV; materiality gate excludes COIN 41x); live mNAV chip on crypto-treasury holdings
- Phase C: pending
- Phase D: pending
- Phase E: pending
