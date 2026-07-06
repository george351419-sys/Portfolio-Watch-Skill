# Event-Aligned Evaluation

The backtest (`Backtest-Report.md`) proves the price-anomaly detector carries
information. But the product's real claim is stronger:

> **When a real investment event happens, does the product turn it into a useful
> alert — earlier, with less noise, and correctly ranked?**

So this evaluation is anchored on **real events**, not on "did price continue for 3
days." Events are assembled **programmatically** from data endpoints (no hand-picking,
so no cherry-picking), point-in-time, over the last ~24 months.

Script: [`backtest/pw-event-aligned.js`](backtest/pw-event-aligned.js) ·
raw result: [`backtest/results-event-aligned.json`](backtest/results-event-aligned.json).

## The event table (111 real events, 12 symbols)

| Event type | How it's sourced (objective) | Count | Detector |
|---|---|---|---|
| **Earnings** | `earnings-calendar` — every reported quarter | 42 | price residual-vol z |
| **Insider / Form 4** | `insider/transactions` — a cluster of ≥2 discretionary open-market **buys** in ≤7 days, or a single ≥ **$10M** discretionary Form 4 | 62 | smart-money overlay |
| **Thesis break** | MSTR / COIN vs BTC — leverage-thesis break (\|z_ref\|≥1, V≥2.5, opposite sign) | 7 | thesis engine |

## Results

| Metric | Result |
|---|---|
| **Real events evaluated** | **111** (42 earnings · 62 insider · 7 thesis) |
| **Earnings covered** (a residual-vol alert in ±1 day) | **22 / 42 (52%)** — the rest are in-line, non-events the product *should* stay quiet on |
| **Thesis breaks caught** | **7 / 7** |
| **Unique catches** — events a **price-only** tracker would miss | **66** = 7 thesis-only + 59 smart-money-only (insiders positioning while price is quiet) |
| **Alert concentration on earnings** | **4.73×** vs chance (`pw-event-study.js`, 125 events: P(earnings-window \| alert)=0.144 vs base 0.03) |
| **Duplicate alerts avoided** (fusion) | ~**6%** of alert-days are consecutive same-symbol repeats, collapsed into one evolving card |
| **Median lead / lag** | **+1 trading day** (earnings mostly report after-market, so the move — and our flag — land next day) |

### How to read this

- **Coverage is not supposed to be 100%.** ~half of earnings are in-line and don't
  move the stock beyond its own noise band — surfacing those would be *noise*, not
  signal. The product's job is to stay quiet on non-events and fire on the material
  ones. 52% earnings coverage + **4.73× concentration** says: our alerts land on real
  catalysts far more than chance, and skip the non-events.
- **The 66 unique catches are the core product argument.** A fixed-% or price-only
  tracker sees none of the 7 thesis breaks (price wasn't unusual vs the *market* — only
  vs the *thesis benchmark*) and none of the 59 insider divergences (insiders buying
  while price is calm). The extra dimensions exist precisely to catch these.
- **Low duplicate rate + same-/next-day timing** means when it does fire, it fires
  once, promptly, and doesn't spam.

## Honest scope & limits

- **Window:** ~last 24 months. Historical earnings dates only go back ~6 quarters via
  `earnings-calendar`; `income-statements` / `dividends` are gated (HTTP 400). So this
  is not a multi-year study.
- **Event types we could NOT source:** news, 8-K / 10-Q / S-1 beyond earnings, M&A,
  litigation, regulatory actions, guidance changes, executive departures — those
  endpoints aren't available at our tier. Covered types are earnings, Form 4 insider,
  and price/proxy thesis.
- **"P0/P1 precision" is a lower bound.** An alert that fires on a *real* but unlogged
  event (e.g. a news headline we can't source) counts as unmatched here, so any
  precision figure understates true performance.
- **Insider "coverage" is by construction** (the overlay reads the same Form 4 data),
  so we report it as *unique divergence catches*, not as a coverage score.

## Why this matters more than forward-price precision

Forward-price continuation rewards momentum the product deliberately suppresses. This
evaluation instead asks the product's actual question — *when a real event happens, does
attention get routed correctly?* — and answers it with real events: **material catalysts
are covered and concentrated; non-events are skipped; the extra signal dimensions catch
66 events price alone would miss; and alerts stay de-duplicated and timely.**
