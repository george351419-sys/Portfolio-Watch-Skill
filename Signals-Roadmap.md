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
- Phase 3: pending
- Phase 4: pending
