# AGENTS.md — Project guide for AI agents & maintainers

> Read this first if you're an agent picking up this repo. It explains **what we
> built, how it works on Alva, why the design is what it is, and how to extend it
> safely**. Deep detail lives in the docs this file points to — don't duplicate it.

---

## 1. What this project is

A **Portfolio Watch Skill** for [Alva](https://alva.ai) (an agentic finance
platform), built as a PM take-home. A "Skill" is a single pasteable spec that loads
into Alva's Agent so any user can generate a high-quality **Portfolio Watch
Playbook**: a live interface over their holdings + quiet, ranked alerts pushed to an
IM app, that works on a portfolio it has **never seen before**.

**Three deliverables:**
1. **The Skill** — [`portfolio-watch/SKILL.md`](portfolio-watch/SKILL.md) (single file).
2. **A live Playbook** built from it — https://alva.ai/u/george351419/playbooks/portfolio-watch
3. **A one-pager** on the thinking — [`One-Pager.md`](One-Pager.md) (bilingual).

Status & full inventory: **[`DELIVERABLES.md`](DELIVERABLES.md)** (start there for "what's shipped").

## 2. The one idea everything follows from

> **Every threshold is relative.** NVDA −3% is a normal day; a utility −3% is news.
> Reusability on an unseen portfolio is *only* possible if each holding is judged
> against **its own** adaptive baseline. Get this right and the rest follows.

Two more convictions: **signal-to-noise IS the product** (protect the user's
attention — collapse correlated moves, silence tiny positions, fuse a developing
story into one card), and **Alva-native** (compose platform primitives, add no new
infrastructure). Full articulation in the One-Pager.

## 3. Architecture (data flow)

```
User (Agent chat)                          ┌─ real brokerage/crypto accounts
  │  "watch my portfolio" / "watch NVDA…"  │   (alva portfolio summary, TREX+SnapTrade)
  ▼                                        │   → seeds the watched set at true weights
pw-config feed  (~/feeds/pw-config/v1/)  ◄─┘
  ├─ holdings.json   watched set: [{symbol,name,weight,sector,thesis?}] + macro[]
  └─ mode.json       {demo_asof: <sec>|null}  ← Demo/Live toggle
        │ (both read at runtime — no code change to re-target)
        ▼
pw-profile feed (cron)   adaptive per-holding baseline: EWMA/MAD vol, OLS β,
        │                residual vol σ_ε, cold-start prior  → profile/holdings
        ▼
pw-watch feed (cron 16985, "0 21 * * 1-5", push_notify)   THE core engine:
        │   reads config + profiles → for each holding computes residual-vol z,
        │   BH-FDR, hysteresis, bounded 0–100 score; 10 signal sources; thesis
        │   checks; portfolio roll-up; deterministic daily digest.
        ├─► feed rows (overview, holdings, signals, universe, macro, smartmoney,
        │              options, crypto, sentiment, mnav, digest)
        └─► notify/message sidecar → feed_alert_ready → active_channel (Discord/web)
        ▼
Interface (~/playbooks/portfolio-watch/index.html)   live-read HTML, 3 tabs
        │   Watch / Theory / Formulas; deep-link #sig-<id>; War-Room modal;
        │   threshold sliders (client-side re-threshold); search-add any ticker.
        └─ updateWatchlist UDF  (~/playbooks/.../udf/updateWatchlist.js)
             action: add | remove | mode   (writes config, profiles new ticker live)
```

## 4. Platform primitives & where they live

| Concern | Mechanism | Location / id |
|---|---|---|
| Market data | **Arrays REST** via `net/http`, `Authorization: Bearer <ARRAYS_JWT>` (secret-manager) | base `https://data-tools.prd.space.id`; catalog: `alva data-skills list` |
| Prediction markets | Polymarket data-skill (events/history) | via Arrays passthrough |
| Compute | jagent V8 runtime | `alva run --local-file …`; SDK partitions: `feed_widgets`, `technical_indicator_calculation_helpers`, `unified_search` |
| Scheduling | cronjobs | `alva deploy` (pw-watch = **id 16985**) |
| Feed rows | `@alva/feed` SDK (`feed.def`, `ctx.self.ts(series,doc).append`) | code at `~/feeds/pw-watch/v1/src/index.js` |
| Filesystem | `alfs` (`readFile`, `writeFile`, `remove(path)`, `readDir`, `stat`) | `~/feeds/…`, `~/playbooks/…` |
| Interface | live-read HTML + `AlvaToolkit.AlvaClient` | `~/playbooks/portfolio-watch/index.html` |
| In-UI actions | UDF (`alva functions`, `window.alva.udf.call`) | playbook **id 8436**, function `updateWatchlist` (no-charge) |
| Alerts / push | `notify/message` sidecar → platform fanout → `active_channel` | verified delivered to **Discord + web** |
| User's real holdings | `alva portfolio accounts|summary` (TREX + SnapTrade) | **Agent-side only** (user identity) |
| Design gate | `alva lint playbook <file.html>` | must pass before release |

## 5. Hard-won operational knowledge (read before editing)

These are non-obvious and already cost debugging time. Respect them.

- **Storage is a virtual time-series FS.** You *cannot* `alfs.writeFile` arbitrary
  paths under `…/data/`. Rows are written only via `ctx.self.ts(series,doc).append`.
  `alfs.remove` takes **one path arg** (no options object).
- **Same `date`-bucket ⇒ REPLACE.** A new run's append at the same `date` value
  overwrites the prior contents of that bucket. Different `date` values coexist and
  `@last/N` returns the largest-`date` records. **We exploit this two ways:** (1) all
  rows write to a **fixed bucket** (not the wall clock) so each run replaces its
  snapshot instead of accumulating; (2) the Demo and Live modes use **two different
  fixed buckets** (`BUCKET_DEMO = 1700000000000`, `BUCKET_LIVE = 1700000001000`), so
  both snapshots **coexist permanently** and the interface loads both and switches
  client-side instantly. The real analysis date is the **`as_of`** string field, not
  `date`. NB: every row must use `SNAP_BUCKET` for its `date` — the signals row once
  used the event's `time_close` and silently fell outside both buckets.
- **The runtime cannot trigger a cron / recompute the backend.** No SDK for it. So
  UI actions that need a fresh feed run (the Demo/Live toggle) **write a config flag**
  and apply on the next scheduled run or an owner `alva deploy trigger --id 16985`.
- **Push fanout dedups by record date.** A backward-dated notify won't advance the
  fanout cursor, so `notify/message` uses `date: Date.now()` (independent of `asof`).
  Clearing `…/data` also clears the `ctx.kv` hysteresis, which makes a P0 re-push.
- **Timestamps differ by asset class.** Stock kline `time_close` is **Unix seconds**;
  crypto kline times are **ISO strings**. Align on the `YYYY-MM-DD` day string.
- **Polymarket has look-alike events.** e.g. two "Fed decision in December?" markets
  (2024 vs 2025). Disambiguate by scanning candidate events for history at the target
  date; pin the correct token id.
- **Lint constraints (design system):** don't override canonical classes — we renamed
  active-state classes to **`.pwsel`**; a `.button` must carry class `btn` (we use
  `<span>` instead); no `overflow-y:auto` except on `body`/`html`. Run `alva lint`
  before writing the interface to ALFS.
- **`alfs.readFile` returns a Promise of bytes** → `JSON.parse(String(await alfs.readFile(p)))`.

## 6. The monitoring model (what makes a "real move")

Precise math: **[`Strategy-Analysis.md`](Strategy-Analysis.md)**. In brief:

- **Baseline:** EWMA(λ=0.94) + robust MAD floor (1.4826·MAD) so the move being
  detected can't inflate its own baseline.
- **Idiosyncratic test:** decompose variance σ²=β²σ_m²+σ_ε²; the denominator for
  "single-name news" is **residual vol σ_ε**, not total vol. `z_idio = residual/σ_ε`.
  (This fix moved AAPL −2.6σ→−4.1σ, MSTR to P0 — rigor changed the conclusion.)
- **Thresholds:** t-quantile (not a fixed 2.0) ⇒ less data ⇒ higher bar; **BH-FDR**
  (q=0.10) across holdings; **hysteresis ratchet** (z_on 2.5 / z_off 1.5).
- **Ranking:** bounded 0–100 score `0.30S+0.25I+0.15C+0.10η+0.20F−0.40P`, ordered by
  **impact on the user's money** (move × weight), tiers P0/P1/P2, ≤4 P0 pushes/day.
- **Cold start:** sector-median prior + intraday realized-variance bootstrap + linear
  shrinkage `w(n)=clip(n/20,0,1)`.
- **Signature capability — thesis-linked:** watch *why* the user bought (price/proxy
  thesis vs a reference asset like BTC; or catalyst thesis vs a Polymarket event
  probability). A broken buy-reason escalates **straight to P0**. It reuses the same
  residual-vol engine, re-pointed at the thesis's reference. See SKILL §Thesis-Linked.

## 7. The ten signal sources (and the rule that governs them)

Price anomaly · catalyst thesis (Polymarket) · macro overlay (Polymarket) ·
semiconductor cycle (DXI) · smart money (insider/congress) · options-implied
(IV/expected-move/skew) · crypto microstructure (perp funding/OI) · FinTwit KOL
sentiment · mNAV valuation · daily digest. Table with live evidence: DELIVERABLES.md.

> **Governing rule for adding a source:** a new source must plug into an **existing
> mechanism** — *confirmer*, *divergence*, *thesis reference*, *context overlay*, or
> *enrichment* — **never a new per-stock alert stream.** Signal-to-noise is the core
> asset; more inputs must raise conviction, not raise noise.

## 8. Feature highlights / why it's good

- Relative, per-holding baselines ⇒ genuinely reusable on unseen portfolios.
- Residual-vol correctness ⇒ separates single-name news from market beta.
- Thesis-linked P0 ⇒ challenges the *decision*, not just reports a move.
- Aggressive noise control (β roll-up, FDR, hysteresis, narrative fusing, silent
  update, quiet-by-default) ⇒ alert trust preserved.
- 10 cross-checking sources, each verified on real Alva data, all noise-safe.
- Interface is transparent (Theory + Formulas tabs, adjustable thresholds), not a
  black box; War-Room drill-down; search-add **any** ticker (UDF profiles it live).
- Dynamic, user-owned watched set (Agent chat **or** in-UI); optional zero-entry
  auto-intake from the connected Alva Portfolio.
- Demo/Live toggle; alerts delivered to Discord + web with deep links.

## 8.5 Validation (how we know it works)

Three complementary evidence layers — don't re-derive these, cite them:

![Event-aligned evaluation — 111 real events](assets/fig7-event-aligned.png)

- **Precision-recall backtest** (`Backtest-Report.md`) — 29 symbols, 37,837 days,
  point-in-time. Calibrates the σ thresholds; proves reusability (untuned cohort ≈ Mag7).
- **Ablation** (`backtest/pw-ablation.js`, §8.5) — the volume gate cuts alert volume
  **−26% at equal precision**; thesis adds ~24% unique P0 coverage.
- **Event-aligned evaluation** (`backtest/pw-event-aligned.js`, `Event-Aligned-Evaluation.md`)
  — anchored on **111 real events** (earnings · insider/Form 4 · thesis break). Headline:
  **4.73× earnings alert concentration** (a price alert is 4.73× more likely to sit on an
  earnings window than a random day). Plus **66 non-price events surfaced by non-price
  dimensions** (7 thesis-only + 59 smart-money/insider divergences) a price-only tracker
  can't represent. (52% of earnings produced an alert — a *neutral* rate, not a target.)
  ~6% duplicates, +1-day timing. **Framing discipline:** lead with the concentration, not
  the 52%; call insider *coverage-by-construction* (not an independent hit-rate); P0/P1
  precision is a lower bound. Honest scope: recent ~24-month window, sourceable event
  types only (news/M&A/litigation endpoints unavailable) — extend as endpoints appear.

## 9. How to extend or optimize (playbook for the next agent)

1. **Read the source docs first** (harness rule): SKILL.md, One-Pager.md,
   Strategy-Analysis.md, DELIVERABLES.md, and this file. Don't rely on session history.
2. **Adding a signal source:** implement a standalone `*.js` module at repo root first
   (there are 8 verified ones — `thesis-monitor.js`, `catalyst-thesis.js`,
   `alert-fusion.js`, `smart-money.js`, `options-signal.js`, `crypto-micro.js`,
   `fintwit-sentiment.js`, `mnav-lens.js`), verify it on real data via `alva run`,
   then wire it into `pw-watch.js` **through an existing mechanism** (§7), add its rows
   to the interface's render path, and update SKILL/DELIVERABLES.
3. **Changing the interface:** edit locally, `alva lint playbook` (must be 0 errors),
   then `alva fs write --path '~/playbooks/portfolio-watch/index.html'`. Keep the repo
   copy in `playbook-src/pw-index.html` in sync. Respect the lint constraints (§5).
4. **Changing the feed:** edit `playbook-src/pw-watch.js`, `alva fs write` to
   `~/feeds/pw-watch/v1/src/index.js`, then `alva deploy trigger --id 16985` and poll
   `alva deploy runs`. Verify outputs via `alva fs read …/data/<series>/…/@last/N`.
   Remember the fixed-bucket rule (§5) if you touch the `date:` field.
5. **Changing the UDF:** edit `playbook-src/updateWatchlist.js`, write to
   `~/playbooks/portfolio-watch/udf/updateWatchlist.js`, and **re-register** with
   `alva functions register --playbook-id 8436 … --params-schema-file playbook-src/uw-schema.json`.
6. **Don't** commit until checks pass; **don't** hide a failing run — report the exact
   command, outcome, and next action. One feature/fix per commit.

## 10. Repo map (deliverables + working artifacts)

```
portfolio-watch/SKILL.md   Deliverable 1 — the Skill (single, pasteable)
One-Pager.md               Deliverable 3 — one-pager (bilingual, figures)
DELIVERABLES.md            Live status of everything shipped — start here
README.md                  Public-facing hero + methodology highlights
Strategy-Analysis.md       Rigorous math (baselines, residual-vol, FDR, fusion, thesis)
Backtest-Report.md         Precision-recall, 29 symbols, 37,837 days
Signals-Roadmap.md         Two build rounds (all done)
playbook-src/              LIVE sources: pw-profile.js, pw-watch.js, pw-index.html,
                           updateWatchlist.js, uw-schema.json, holdings.json
*.js (repo root)           8 standalone, verified signal modules (remix any one)
assets/                    Figures + the thesis-break hero shot
notes/                     Working trail (not deliverables)
```

## 11. Known gaps / honest limits (candidates for future work)

- **Live freshness:** the Demo/Live toggle is instant (dual-snapshot, client-side),
  but the Live bucket is only as fresh as the last feed run (scheduled weekdays; the
  runtime can't self-trigger a recompute on demand). Demo is a frozen pinned session
  by design.
- **Portfolio auto-intake not live-demoed:** the demo account has no linked account
  (`alva portfolio accounts` → `[]`); wire + demo once an account is connected.
- **Telegram "silent update"** (edit one card in place) needs a BYOD bot token; the
  fusion *logic* is verified, the editable-card *delivery* is documented, not wired.
- **Backtest edge is modest** (precision ≈ 0.33 @ 2.5σ, ~1.3× lift) — by design the
  product is *noise suppression + attention routing*, not price prediction. Keep this
  honest; don't oversell.
