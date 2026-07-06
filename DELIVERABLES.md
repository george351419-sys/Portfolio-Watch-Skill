# Deliverables & Status

Live snapshot of what's shipped. **Playbook:** https://alva.ai/u/george351419/playbooks/portfolio-watch
("Portfolio Watch · thesis-aware monitor", public, v1.16.0).

## The three required deliverables

| # | Deliverable | Where | Status |
|---|---|---|---|
| 1 | **The Skill** (single file + code) | [`portfolio-watch/`](portfolio-watch/) folder · packaged [`portfolio-watch-skill-v2.0.0.zip`](portfolio-watch-skill-v2.0.0.zip) | ✅ |
| 2 | **A Playbook built from it** (interface + alerts live) | [live link](https://alva.ai/u/george351419/playbooks/portfolio-watch) | ✅ |
| 3 | **One-pager** on the thinking (bilingual + figures) | [`One-Pager.md`](One-Pager.md) | ✅ |

## Ten signal sources — cross-checked, all verified on real Alva data

Every source plugs into an existing mechanism (confirmer / divergence / thesis
reference / context overlay / enrichment) — never a new per-stock alert stream.
Signal-to-noise is the core asset.

| Signal | Source | Verified (live) | Role |
|---|---|---|---|
| Price anomaly | klines · β · residual σ | MSTR −4.8σ → **P0** | core |
| Catalyst thesis | Polymarket | ITB, P(Fed cut) 83→60% → **P1** | thesis ref |
| Macro overlay | Polymarket | rates → TSLA/ITB (40%) | context |
| Semiconductor cycle | DXI memory index | memory ↑ → NVDA tailwind | context |
| Smart money | insider / congress | MSTR 10 insiders $31M, TSLA CEO $1B | confirmer/divergence |
| Options-implied | options IV | MSTR ±22% move, 12pt downside skew | enrichment |
| Crypto microstructure | perp funding / OI | BTC 8%/yr, OI +9% | enrichment |
| KOL sentiment | Alva Fintwit Intelligence | NVDA 11 bull / 0 bear | context |
| mNAV valuation | company crypto-holdings + mcap | **MSTR −35% to BTC NAV** | enrichment |
| Daily digest | all of the above, woven | one deterministic narrative | proactive |

## Signature capability — watch the *thesis*, not just the price

Tell the Skill *why* you hold something ("MSTR as a leveraged BTC play", "ITB
betting the Fed cuts"); a broken buy-reason escalates straight to **P0** — it
challenges your decision, not just reports a move. Two thesis types live:
**price/proxy** (residual vs a reference asset) and **catalyst** (residual vs a
Polymarket event probability).

## Interface

Three tabs — **Watch · Theory · Formulas**:
- **Watch:** daily digest → macro/sector & smart-money context → search-add/remove
  monitored set (UDF, instant analysis) → threshold sliders → ranked signals
  (deep-link anchors) → holdings grid (each tile enriched with mNAV / KOL / options
  / crypto; **click → War-Room** modal aggregating a holding's full signal stack) →
  portfolio lens.
- **Theory:** the full methodology (the cross-checking sources + asset-class benchmarks, layered
  model, three-check gate, noise rules, ranking, thesis).
- **Formulas:** the exact math.

## Live operational state (verified)

- 8 feed signal outputs populated (signals · macro · smartmoney · options · crypto
  · sentiment · mnav · digest).
- Watched set is a user-owned config (5 holdings), editable by Agent chat **or** in
  the UI (UDF `updateWatchlist`, enabled).
- Cronjobs active: `pw-watch` (push-notify) + `pw-profile`.
- Personal alert subscribed; **delivered end-to-end to Discord + web push** (status =
  sent) with a deep link back to the matching card.
- Pinned creator's note inviting remix; discovery tags + description set.

## Rigor & validation

- **Math** — adaptive baselines (EWMA + robust MAD), residual-vol z, t-thresholds,
  Benjamini–Hochberg FDR, hysteresis ratchet, bounded 0–100 scoring, cold-start
  shrinkage, alert fusion, thesis escalation. See [`Strategy-Analysis.md`](Strategy-Analysis.md).
- **Backtest** — precision-recall on 29 symbols (Mag7 + 20 untuned stocks + BTC/LTC),
  37,837 days, point-in-time. Reusability proven (untuned cohort ≈ Mag7). See
  [`Backtest-Report.md`](Backtest-Report.md).

## Standalone reference modules (remix any one)

`thesis-monitor.js` · `catalyst-thesis.js` · `alert-fusion.js` · `smart-money.js` ·
`options-signal.js` · `crypto-micro.js` · `fintwit-sentiment.js` · `mnav-lens.js` —
each verified on real data. Live feed/UI sources in [`playbook-src/`](playbook-src/).

## IM delivery

- **Discord — delivered end-to-end.** The demo account connected Discord and a real
  alert was delivered (channel = `discord`, status = `sent`): the MSTR P0 thesis-break
  card with its deep link back to the interface. Web push is delivered in parallel.
  The assignment names Telegram — the pipeline is identical (`feed_alert_ready` routes
  to whatever `active_channel` the owner connects), so Telegram/Slack work the same way
  with no code change.

## Auto-intake from the connected Portfolio

Alva has a native **Portfolio** module (linked brokerage/crypto accounts, TREX +
SnapTrade). The Skill uses it as the **preferred zero-entry intake**: *"watch my
portfolio"* → `alva portfolio summary` reads real positions and seeds the watched
set at **true market-value weights** (exact ranking, not equal-weight); *"sync my
portfolio"* diffs in new trades (`activities`). This runs on the Agent under the
user's own identity — a headless feed can't impersonate the user, so refresh is
user-triggered, not a silent background pull. Wired into `SKILL.md` §Step 1;
falls back to manual/chat/UI intake when no account is linked. *(Not live-demoed:
the demo account has no linked account — `alva portfolio accounts` → `[]`.)*

## Demo / Live toggle

The header carries a **📌 Demo · 🔴 Live** switch (signed-in owner). Demo pins the run
to the 2024-11-21 session so the price/catalyst thesis breaks are visible; Live
recomputes on today's data. It's config-driven (`mode.json`, read by the feed via the
`updateWatchlist` UDF `action:"mode"`), not hardcoded — verified round-trip: Live →
`as_of 2026-07-06`, 2×P0; Demo → `as_of 2024-11-22`, 1×P0 (MSTR). All rows write to one
fixed snapshot bucket so `@last` always returns exactly the current run.

## Honest gaps
- **Demo default:** the Playbook opens in Demo (2024-11-21) so a reviewer sees the
  thesis-break narrative immediately; flip the header to Live for current data. The
  runtime can't self-trigger the backend, so after flipping, the feed applies it on its
  next scheduled run (or an owner `alva deploy trigger --id 16985`).
- Threshold parameters are evidence-based starting points, calibrated on historical
  replay and adjustable via three sensitivity presets.

## Roadmap

Two build rounds (all done) are tracked in [`Signals-Roadmap.md`](Signals-Roadmap.md):
Round 1 — smart-money · options · crypto-micro · semiconductor; Round 2
(community-inspired) — FinTwit sentiment · mNAV · daily digest · War-Room drill-down
· presentation.
