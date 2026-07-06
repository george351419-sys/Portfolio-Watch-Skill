# Changelog

Iteration trajectory for the **Portfolio Watch Skill**. Newest first, grouped by round
rather than per-commit. Each round was reviewed and refined before the next.

---

## Round 4 — Validation loop & review hardening (Codex feedback) · v2.1.0

Turned "well-argued" into "well-evidenced," and tightened every claim to survive a
careful reviewer.

- **Event-aligned evaluation** — anchored the whole evaluation on **111 real events**
  (earnings · insider/Form 4 · thesis break), built programmatically (no cherry-picking).
  Headline: **4.73× earnings alert concentration** vs chance; **66 non-price events
  surfaced by non-price dimensions**. (`Event-Aligned-Evaluation.md`, `pw-event-aligned.js`,
  `pw-event-study.js`, `fig7`.)
- **Signal ablation** — quantified each layer's marginal value: the volume gate cuts
  alert volume **−26% at equal precision**; thesis adds ~24% unique P0 coverage.
  (`pw-ablation.js`, Backtest-Report §8.5.)
- **Evaluation Matrix** — honest per-capability status (Live / Verified / Backtested /
  Specced / Known-limitation) + tiered asset coverage. (`Evaluation-Matrix.md`.)
- **Framing discipline** — led with concentration (not coverage); relabeled insider as
  *coverage-by-construction*; separated Telegram's two delivery paths; clarified
  Demo/Live shows the *latest scheduled snapshot*, not an on-click recompute.

## Round 3 — New capabilities from review · v2.1.0

- **Instant Demo/Live toggle** — dual-snapshot; the header switches client-side
  instantly for any viewer, no backend trigger.
- **Incident Timeline tab** — visualizes how one P0 fuses (price → volume → options →
  smart-money → thesis) into a single evolving card.
- **Crypto gate** — crypto & crypto-linked names get a higher bar (×1.25) +
  volume-confirmation-to-page (thesis breaks exempt).
- **Thesis onboarding** — the UI infers a likely buy-thesis per holding for one-tap
  confirm; thesis now works vs *any* benchmark (BTC, SMH, QQQ, SPY…), not just crypto.
- **Telegram silent-update wiring** — `deliverTelegram` (sendMessage → editMessageText →
  re-send on escalation), activated by BYOD secrets.
- **Packaged & released** — self-contained `portfolio-watch-skill-v2.1.0.zip`; GitHub
  Release (Latest).

## Round 2 — Packaging, honesty & IM delivery · v2.0.0

- **Skill packaged** as a self-contained bundle (SKILL.md + `scripts/`) + first GitHub Release.
- **`AGENTS.md`** — architecture, platform gotchas, and how-to-extend guide for agents.
- **Discord delivery** — a real alert delivered end-to-end (channel `discord`, status `sent`).
- **Portfolio auto-intake** — *"watch my portfolio"* seeds the watched set from a linked
  Alva account at true weights (designed; not live-demoed — no linked account).
- **Review pass** — made "add any ticker" genuinely work; fixed stale alert/source-count claims.
- **`DELIVERABLES.md`** — one-glance submission status.

## Round 1b — Community-inspired signal sources

- FinTwit KOL sentiment (Alva Fintwit Intelligence), crypto-treasury **mNAV lens**,
  deterministic **daily digest**, single-holding **War-Room** drill-down, presentation
  for discoverability & remix.

## Round 1a — Cross-checking signal sources

- Macro-context overlay (Polymarket), smart-money positioning (insider/congress),
  options-implied enrichment (expected move / IV / skew), crypto microstructure
  (perp funding / OI), semiconductor cycle (DXI), and **catalyst thesis via Polymarket**
  (prediction-market probability as a thesis reference) — each plugged into an existing
  mechanism, never a new per-stock alert stream.

## Round 0 — Core build: thesis-aware monitor

- **Reusable Alva Skill + live Playbook + backtest** — relative per-holding baselines
  (EWMA/MAD, β, residual vol σ_ε), t-thresholds, BH-FDR, hysteresis, bounded 0–100 scoring.
- **Thesis-linked monitoring** — a broken buy-thesis escalates straight to P0 (the
  signature capability); plain-language explainer + extensible invariant library.
- **Dynamic watched set** — a user-owned runtime config, editable by Agent chat **or** a
  registered UDF in the Playbook UI (add/remove any ticker, analysis computed on the spot).
- **Interface** — three tabs (Watch / Theory / Formulas), search-any-ticker,
  per-ticker thresholds, interactive threshold sliders.

---

*Deliverables: [`portfolio-watch/SKILL.md`](portfolio-watch/SKILL.md) (Skill) · the live
[Playbook](https://alva.ai/u/george351419/playbooks/portfolio-watch) · [`One-Pager.md`](One-Pager.md).
Validation: [`Backtest-Report.md`](Backtest-Report.md) · [`Event-Aligned-Evaluation.md`](Event-Aligned-Evaluation.md) ·
[`Evaluation-Matrix.md`](Evaluation-Matrix.md). Architecture: [`AGENTS.md`](AGENTS.md).*
