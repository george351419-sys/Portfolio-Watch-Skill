# Portfolio Watch — Skill package

A self-contained, distributable **Alva Skill**: load it into Alva's Agent and it
turns any portfolio into a hosted **Portfolio Watch Playbook** — a live interface
over the holdings plus quiet, ranked push alerts. It decides which dimensions to
watch, what's a real move vs noise, and how to rank signals, so it works on a
portfolio it has never seen, from one sentence.

> Output is **monitoring and explanation, not investment advice.**

## Use it (the only required step)

`SKILL.md` is the whole skill — a single, self-contained, pasteable file.

1. Open Alva's Agent (needs the base `alva` skill for platform primitives; this
   skill declares `builds_on: alva`).
2. Paste **`SKILL.md`**, or drop this folder into your agent skills directory.
3. Say what to watch:
   - *"watch my portfolio"* — if you've linked a brokerage/crypto account to Alva's
     Portfolio module, it reads your real holdings at true weights (zero typing).
   - *"watch my NVDA, TSLA, AAPL"* — otherwise name them.
   - optionally tell it **why** you hold something (*"MSTR as a leveraged BTC play"*)
     to arm thesis-linked monitoring.

The Agent then builds the two feeds, the interface, and the alert wiring for you.

## What's in `scripts/`

These are the **reference implementations** the skill builds — each verified on real
Alva data. Read them to understand the mechanics or lift any one into your own
playbook; the skill itself regenerates equivalents when it builds.

```
scripts/live/          The deployable Playbook sources
  pw-profile.js        Feed 1 — adaptive per-holding baseline (EWMA/MAD vol, OLS β, residual σ_ε, cold-start)
  pw-watch.js          Feed 2 — the engine: residual-vol z, BH-FDR, hysteresis, 0–100 scoring,
                       10 signal sources, thesis checks, portfolio roll-up, daily digest, push
  pw-index.html        Interface — 3 tabs (Watch/Theory/Formulas), deep-links, War-Room, sliders, search-add
  updateWatchlist.js   UDF — add/remove a ticker (profiles it live) + flip the Demo/Live mode
  uw-schema.json       UDF parameter schema
  holdings.json        Example watched-set config (symbols · weights · sectors · theses · macro)

scripts/modules/       Standalone, single-purpose signal modules (remix any one)
  thesis-monitor.js    Price/proxy thesis — a broken buy-reason (e.g. MSTR vs BTC) escalates to P0
  catalyst-thesis.js   Catalyst thesis via Polymarket — event priced out ⇒ thesis breaks
  alert-fusion.js      Narrative Fusing + Silent Update — a developing story fuses into one card
  smart-money.js       Insider / congress flow (confirmer / divergence)
  options-signal.js    Options-implied IV / expected-move / skew (enrichment)
  crypto-micro.js      Perp funding / open-interest (enrichment)
  fintwit-sentiment.js KOL bull/bear lean from Alva Fintwit Intelligence (context)
  mnav-lens.js         Crypto-treasury market-cap vs NAV premium/discount (enrichment)
```

## How it works (short)

Every threshold is **relative** — each holding is judged against its own adaptive
baseline, stripped of market beta (residual vol σ_ε), and weighted by its impact on
the portfolio. Signal-to-noise is the product: correlated moves collapse into one
portfolio line, tiny positions are silenced, and a developing story fuses into one
evolving card. New data sources plug into an existing mechanism
(confirmer / divergence / thesis-reference / context-overlay / enrichment) — never a
new per-stock alert stream.

Full spec: **`SKILL.md`**. Math: `../Strategy-Analysis.md`. Architecture, platform
gotchas, and how to extend safely: **`../AGENTS.md`**.

---

*This folder is the packaged Deliverable 1 of the Portfolio Watch take-home. The same
sources are also kept at the repo root (`../playbook-src/`, `../*.js`) for easy
browsing; `scripts/` here is the bundled snapshot so the package is self-contained.*
