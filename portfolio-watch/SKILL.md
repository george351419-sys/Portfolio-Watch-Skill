---
name: portfolio-watch
description: >-
  Use this skill whenever a user wants to WATCH, MONITOR, TRACK, or KEEP AN EYE ON
  one or more stocks / crypto / a portfolio / a watchlist AND be ALERTED, PINGED, or
  NOTIFIED when something material happens — ongoing monitoring with push alerts, not a
  one-off price lookup. Trigger phrases include: "keep an eye on my NVDA, TSLA, AAPL and
  ping me when something big happens", "watch AAPL for me", "monitor my holdings", "track
  my portfolio", "alert me on big moves", "tell me if something happens to TSLA", "set up
  alerts for my stocks", "watch the top US stocks", as well as Chinese: "帮我盯一下我的
  股票/持仓，有大事提醒我", "监控我的组合", "有异动提醒我", "关注一下 NVDA/TSLA". Prefer
  this skill over generic price/quote/chart lookups whenever the intent is *continuous
  monitoring + alerting*. Works on any US-listed security (stocks, ETFs, ADRs, REITs,
  closed-end funds, SPACs, preferreds) and crypto / crypto-linked equities, from one
  sentence, on a portfolio it has never seen. It builds a hosted Portfolio Watch Playbook
  on Alva: a live interface over the holdings plus quiet, ranked push alerts wired to the
  user's IM channel (Discord/Telegram), each deep-linking back to the matching card. It
  decides which dimensions to watch, what's a real move vs noise, and how to rank signals
  when several fire — and is **thesis-aware**: tell it *why* you hold something and a
  broken buy-reason escalates to a top-priority alert. Output is monitoring and
  explanation, not investment advice.
metadata:
  author: portfolio-watch-skill
  version: v2.1.4
  builds_on: alva
---

# Portfolio Watch

Turn a one-line request like *"watch my NVDA, TSLA, AAPL and ping me when
something big happens"* into a hosted **Portfolio Watch Playbook**: an interface
the user opens to see what's happening to their holdings, plus quiet, ranked
push alerts that reach their phone and deep-link back to the matching card.

This skill is a **methodology blueprint**. It does not replace Alva's build
mechanics — it drives them. Alva owns the primitives (Data Skills, runtime
feeds, Altra, alpi, playbook release, push). This skill owns the **monitoring
judgment**: dimensions, thresholds, noise filters, and ranking. When the two
conflict on *mechanics*, follow the `alva` skill; on *what to watch and what to
say*, follow this file. The product goal is signal, not coverage — separate
material investment signals from market noise for a portfolio it has never seen.

## Core Principle: Every Threshold Is Relative

**There are no hardcoded percentage thresholds.** NVDA down 3% is a normal day;
Coca-Cola down 3% is news. The skill works on an unseen portfolio because every
anomaly test is measured against *that holding's own statistical baseline* and
against *what the market and its sector did today*, computed at setup. This is
the entire reusability engine — get it right and the rest follows.

## Build Order (map to Alva primitives)

Follow the `alva` skill's session start and gates. The skill-specific order is:

1. **Intake** — parse holdings, weights, intent, alert channel, time horizon.
2. **Profile feed** — per-holding baseline + benchmark routing (the reusability
   engine). Build it first; all thresholds read from it.
3. **Watch feed(s)** — the monitoring layers, emitting scored signals.
4. **Playbook interface** — live-read HTML, **four tabs** (Watch / Incident / Theory /
   Formulas — see §The Interface); Theory + Formulas are required, not optional.
5. **Alert sidecar** — `notify/message` push, quiet by default, deep-linked.
6. **Release + verify** — release, screenshot, enable alert, confirm a real run.

Use Alva Data Skills for every number, `@alva/feed` for persistence, `FeedAltra`
for portfolio-level math (weights, drawdown, correlation, contribution),
`@alva/pi` for one-line narrative, and the push flow from
`references/push-notifications.md`. Never hardcode financial values into HTML.

---

## Step 0 — Onboarding & Preflight (run this first, from one line)

A user often invokes this skill from a **fresh local agent** with nothing set up, and
says one line — *"watch my NVDA, TSLA, AAPL and ping me on big moves."* From that line,
**proactively drive the entire setup and build** — don't make them configure things by
hand, and don't ask for specs you can default. Before building, silently check three
prerequisites and guide the user **only** where something is missing:

1. **Base Alva skill available?** This skill declares `builds_on: alva` and needs Alva's
   platform primitives (feeds, playbook release, push). If the agent can't reach the
   Alva build tools, tell the user to install them once, then retry:
   `npx skills add https://github.com/alva-ai/skills`.
2. **Signed in to Alva?** The Playbook is created **under the user's own account** and
   alerts are delivered to *them*, so they must be authenticated (`alva whoami` to check;
   `alva auth login` if not). Guide the one-time login if needed.
3. **Alert channel connected?** For pushes to reach the phone the user needs an
   `active_channel` (Discord / Telegram / Slack) linked at **alva.ai/settings**. Check
   `alva whoami` (`active_channel`); if none, note it now but **don't block the build** —
   remind again right after the first alert is ready.

Then **just build it**: parse the one line (Step 1), stand up the profile + watch feeds
and the interface, and wire alerts to the user (see The Alerts → *Deliver to this user*).
Report back in one line: *"Watching NVDA/TSLA/AAPL · interface: &lt;link&gt; · alerts →
your &lt;channel&gt;."* Ask **at most one** blocking question, and only if truly ambiguous.
Default everything else (equal weight, Standard sensitivity, long-horizon).

## Step 1 — Intake (works on an unseen portfolio)

Extract: tickers/assets, shares or notional, weights, cost basis, watch style,
alert channel, timezone, time horizon.

**Preferred zero-entry path — pull the user's real portfolio.** Alva has a native
Portfolio module (connected brokerage / crypto accounts across TREX + SnapTrade).
If the user says *"watch my portfolio"* and has a linked account, do **not** ask
them to type tickers — read the positions directly and populate the watched set:

1. `alva portfolio accounts` → list connected accounts (`trex:…` / `snaptrade:…`).
   If several, ask which (or watch all, unioned).
2. `alva portfolio summary --account-id <id>` → holdings + balance. Map each
   position to `{symbol, name, weight (from market value / total), sector}` and
   write it into the watched-set config (below). Weights come **free** from real
   balances, so ranking is exact instead of equal-weight.
3. Confirm the resolved list back to the user in one line before monitoring; then
   the feed auto-profiles every name (§Step 2) and thesis prompts follow.
4. **Sync on request** — "sync my portfolio" re-reads accounts and diffs against
   the config (new buys added, full exits removed); `alva portfolio activities`
   gives the recent trade trail. This runs on the Agent under the user's own
   identity — a headless feed can't impersonate the user, so refresh is
   user-triggered (or via a stored restricted token), never a silent background
   pull. If **no** account is linked, fall back to the manual intake below.

Defaults when missing:
- **Weights** — equal weight; label portfolio-impact estimates as approximate.
  Weights affect ranking only, never whether an anomaly is detected.
- **Watch style** — Standard (P0 immediate, P1 digested, P2 interface-only).
- **Time horizon** — long-term; emphasize fundamentals, events, liquidity,
  filings, and portfolio impact over small technical moves.
- **Ambiguous ticker** — resolve to the most likely US-listed security with
  `getStockCompanyDetail`. Ask **at most one** blocking question, and only when
  the ambiguity changes asset type or monitoring template.

Resolve nothing silently: if a symbol won't resolve, tell the user and continue
with the rest.

**Capture any stated thesis.** If the user says *why* they hold something ("MSTR
as a leveraged BTC play", "NVDA to beat the semis"), parse and store it as a
per-holding thesis (holding · relation · reference · direction) — it drives
thesis-linked monitoring (§Thesis-Linked). Optional; absence just means the
default market model.

## The watched set is a user-owned config (dynamic add/remove)

The list of monitored tickers is **not hardcoded** — it's a config the user owns
(e.g. `~/feeds/pw-config/v1/holdings.json`: `[{symbol, name, weight, sector,
thesis?}]`). It can be **seeded automatically from the connected Alva Portfolio**
(§Step 1 zero-entry path) or filled by hand. The feeds **read it at runtime**, so
changing what's watched never needs a code change:

- **Add / remove anytime — two ways, same config.** (a) Talk to the Agent ("also
  watch COIN", "stop watching TSLA"); it edits the config. (b) Do it **in the
  Playbook UI**: a registered **UDF (`updateWatchlist`)** lets the search box add a
  ticker and a chip's ✕ remove one, writing directly to the config (no charge;
  unauthenticated viewers see a sign-in prompt). On add, the UDF **computes the new
  ticker's σ-analysis on the spot** and returns it, so the interface shows the
  added name's move/z_idio/tier immediately; full profiling + alerts follow on the
  next scheduled run. Verified live: NVDA/TSLA/AAPL/MSTR → +COIN (evidence computed
  live, thesis auto-applied) → −TSLA, by config edit and by UDF.
- **New names get the full treatment automatically** — a freshly added ticker is
  profiled (its own σ/β/σ_ε baseline), and if it's new-listed it enters the
  cold-start path (§Cold Start). This is the reusability requirement made
  operational: the Skill works on any set the user names, and the set is live.
- Weights are optional (equal-weight default); per-holding `thesis` is optional.

## Step 2 — Profile Feed (the reusability engine)

Before watching anything, build one feed that persists a **profile per holding**
from the config above, using Data Skills history. This is what makes thresholds
relative and routing correct.

Per holding, compute and store:

| Field | Source / method | Used for |
|---|---|---|
| `asset_type` | company/asset detail | which templates apply |
| `sector`, `industry` | company detail | sector template + benchmark |
| `sigma_ewma`, `sigma_mad`, `sigma_eps` | EWMA(λ=0.94) vol, `1.4826·MAD` robust floor, and **residual (idiosyncratic) vol** `√(σ²−β²σ_m²)` | z-score denominators (§Step 4) |
| `avg_vol_20d`, `avg_dollar_vol_20d` (time-of-day if intraday) | volume history | RVOL / turnover / liquidity |
| `free_float` | ownership data | turnover denominator |
| `beta`, `primary_benchmark`, `sector_benchmark`, `peer_basket` | regress on benchmarks (see Appendix A) | market/sector-noise removal |
| `liquidity_bucket`, `volatility_bucket`, `market_cap_bucket` | derived | confirmation strictness |
| `options_available`, `short_interest_available`, `crypto_exposure` | capability flags | which confirmers activate |
| `earnings_next`, `ex_div_next`, `event_calendar` | calendar endpoints | event scheduling |
| `week52_high`, `week52_low` | klines | milestone signals |

Refresh on a slow cadence (daily/weekly). **All downstream thresholds read from
this feed** — change the portfolio and the same rules re-fit automatically. For
newly listed or thinly traded names, require stronger evidence and mark
confidence lower.

**Asset types to recognize:** common equity, ADR, ETF/ETP, closed-end fund,
REIT, BDC, MLP, preferred, SPAC/de-SPAC, crypto asset, crypto-linked equity
(exchanges, miners, treasury companies, brokers, stablecoin/payment proxies —
COIN, MSTR, MARA, RIOT, CLSK, HOOD), other listed security. If a holding spans
templates, apply all material ones and mark the primary driver.

## Step 3 — What To Watch (layered model)

Organize by *why an investor cares*, not by data source. Universal monitors apply
to every holding when data exists; templates add asset-specific intelligence.

### Layer A — Price, relative performance, liquidity (intraday/hourly poll)
| Signal | Definition (relative) | Role |
|---|---|---|
| Abnormal move | `z = day_return / sigma_20d` (also 5d/1m/YTD, gap, open-to-close) | core |
| Residual move | `residual = ticker_return − explained_market_sector_move`; flag when market+sector explain **< half** the move | core |
| Sector-relative | `z` of (ticker_return − sector_benchmark_return) ≥ 2.0 | core |
| Volume anomaly | **RVOL = vol / avg_vol** (time-of-day adjusted); 2× notable, 3× strong, 5×+ major catalyst. *5×+ is often climactic/exhaustion, not continuation — read with price direction* | confirmer |
| Turnover | `vol / free_float` ≥ 2× 60d median or > 90th pct; high turnover + failed advance after good news = distribution | confirmer |
| Liquidity stress | bid-ask spread > 90th pct for a liquid name; halts, LULD, SSR | confirmer |
| Range break | 20/50/200-day break **with volume confirmation**, or 52-week high/low, all-time high | weak |
| Slow trend | N consecutive down days, or 5-day cumulative move > 2σ (not daily-significant, cumulatively significant) | slow |

### Layer B — Events & filings (calendar/filing-driven; many are knowable early)
- Earnings: pre-announce reminder (T−1/2) + result vs estimate + guidance change.
- Dividends / splits / spin-offs / ex-div; index changes; ETF rebalancing.
- **Filings & ownership:** 8-K material events, 10-Q/10-K, going-concern language,
  auditor change/late filing, restatements, financing/dilution (S-1/S-3/424B/ATM,
  convertibles, secondaries), Form 4 insider transactions, 13D activist stakes.
  *Upgrade* open-market insider buys, clustered exec buying, financing for
  cash-burning names, activist 13D. **Built (v1):** a *Smart-money positioning*
  overlay counts discretionary open-market Form-4 buys/sells (10b5-1 excluded);
  a cluster of insiders (or the CEO) buying is a confirmer + a bullish-divergence
  heads-up when price is weak — shown as portfolio context, never a per-stock push. *Downgrade* routine 10b5-1 sales and
  mechanical split/dividend adjustments.
- Lockup / PIPE unlocks (SPACs), redemption risk.
- Macro calendar (FOMC, CPI, rates, dollar, oil) **only when the portfolio is
  sensitive** (high beta or rate/commodity-exposed sectors) or several holdings
  share the exposure — otherwise it's noise for this user.

### Layer C — Information & narrative (news-driven, not knowable in advance)
- Material company news: M&A, litigation, regulatory action, executive change,
  major product failure/recall (Data Skills news + `unified_search` for context).
- Estimate & rating changes — **aggregated**, never per-line: one small revision
  is noise; a broad cluster of same-direction revisions, or a target change *with*
  an estimate/thesis change, is a signal.
- Require multiple credible sources; suppress reposted old news, single-source
  rumors, and generic market commentary. Social velocity is a weak signal only.
- **Semiconductor cycle (TrendForce DXI memory index)** — built (v1) as a
  *sector-context* overlay: DXI trend vs its 30/60-day MAs = a memory-cycle
  tailwind/headwind mapped to semiconductor holdings (most direct for memory
  names; a broad cycle read for GPU/AI via HBM). Sector fund-flows (rotation) and
  consensus estimate-revision momentum are specced as conventional confirmers.
- **Prediction markets (Polymarket) as a structured event signal** — for events
  with a *liquid* market (Fed decisions, elections, some catalysts), a sharp move
  in the event probability is a quantified, often-early re-pricing. Use as a
  **catalyst-thesis reference** (§Thesis-Linked) or a **macro-context overlay** (v1,
  built): a sharp liquid move in P(Fed cut)/election is mapped by sector to the
  rate/policy-sensitive holdings and surfaced as *one portfolio-level heads-up*,
  never per-stock alerts. Gate hard on liquidity (spread/volume); it is *not* a price
  oracle. Coverage is lumpy (deep for macro/politics/sports, thin for single-name
  catalysts), so it enriches — it is not a core pillar.

### Layer D — Portfolio (the user's real concern — the interface's first screen)
Compute with `FeedAltra` so weights, drawdown, correlation, and contribution are
point-in-time correct:
- Portfolio P&L move vs the portfolio's own daily volatility; top contributors /
  detractors.
- Drawdown from recent high beyond the portfolio's normal band.
- Concentration drift: a position whose weight passively grew past a bound (the
  40% position that grew from a rally).
- Correlation convergence: pairwise correlation spikes = diversification failing,
  the book has quietly become one bet. **This is an alertable signal, not just a
  risk-map tile.**
- Factor / exposure drift: sector, country, currency (FX for ADR/international),
  and value/momentum/quality tilt shifting materially.

### Conditional confirmers (activate only when `Step 2` flags data exists)
- **Options** — RVOL of options ≥ 2×, IV rank > 80, skew jump, unusual blocks
  before a catalyst. *Never push an options-only alert*; use only to confirm a
  spot/news/event signal.
- **Short interest / borrow / FTD** — SI > 15% float and rising, days-to-cover > 5
  with price rising on volume, borrow-fee spike. Data is lagged — label the
  reporting date; FTD is settlement-stress context, not proof of abuse; high SI
  can mean conviction or squeeze — infer direction only with price + catalyst.

### Templates (asset-specific event/info intelligence)
After universal monitors, apply the matching sector or asset-type template from
**Appendix B** (e.g. SaaS → ARR/NRR/RPO; semis → book-to-bill/inventory/export
controls; banks → NIM/deposit beta/CET1; REIT → occupancy/AFFO/cap rates) and,
for crypto / crypto-linked names, the **Appendix C** crypto template (funding,
basis, OI, liquidations, exchange flows, ETF flows, stablecoin peg, on-chain,
unlocks, exploits). Templates decide *which fundamentals a move should be read
against* — they are what make the event/info layers smart per holding.

## Step 4 — What Counts As A Real Move (three-check gate)

A price/volume signal becomes a *real move* only after passing, in order. Full
derivations in `Strategy-Analysis.md`; the operational rules:

1. **Statistically significant** — measured in the holding's *own* σ, where σ is
   an **adaptive baseline**: EWMA volatility (RiskMetrics λ=0.94) combined with a
   robust floor `1.4826·MAD` (so the very move being detected can't inflate the
   baseline and mask itself). Threshold `k` is a **t-quantile** `t(ν=n−1, 1−α/2)`,
   not a fixed 2.0 — large samples give k≈2.0 (interface) / 2.5 (push) / 3.5
   (force); small samples widen automatically (this is the cold-start link, §Cold
   Start). The ruler is never a fixed %.
2. **Idiosyncratic** — the correct denominator is **residual volatility**, not
   total σ. Regress `r_i = α + β·r_m + ε`; decompose `σ_i² = β²σ_m² + σ_ε²`; the
   single-name ruler is `z_idio = ε_t / σ_ε`. The book down 3% while the market is
   down 3% has `z_idio ≈ 0` — not news; it rolls up (Noise #1). A move is
   market-driven when `|z_idio| < 2` **and** market explains > 50%
   (`φ = β·r_m / r_i > 0.5`).
3. **Confirmed / attributable** — abnormal RVOL/turnover, or attributable to a
   specific news/event/filing → upgrade. A pure price blip with no volume and no
   cause → down one tier, watch, report only if it persists.

Across many holdings × dimensions, control the **batch** false-positive rate with
Benjamini–Hochberg FDR (target q=0.10) on the `z_idio` p-values — not per-signal
α, which would let ~1 in 20 tests fire spuriously every day.

**Hard events skip the statistical gate** and can be P0 *before* price confirms:
material earnings/guidance surprise, going-concern warning, auditor resignation,
late filing, major financing/dilution, bankruptcy/restructuring/delisting risk,
CEO/CFO sudden departure, FDA failure, major lawsuit/enforcement/sanctions/fraud,
trading halt, M&A/takeover/strategic review, stablecoin depeg, exchange
withdrawal freeze, protocol exploit/bridge hack, or one event hitting multiple
holdings.

## Step 5 — What Is Noise (test every signal before ranking)

Assign a `noise_penalty` (0–5). Common noise explanations:

1. **Beta/sector-driven co-movement** — when the market/sector moves together, do
   **not** fire one alert per holding. Roll up into **one** portfolio-level line:
   *"Market −2.8%; your beta-weighted book expected −3.1%, actual −3.0%, no
   single-name anomaly."* This is the key product decision that turns 10 noise
   alerts into 1 signal.
2. Intraday chop inside the normal band (`|z| < 2`, mean-reverting same day).
3. Low dollar volume / wide spread / unreliable pre/after-hours print — downgrade
   large % moves that lack dollar-volume confirmation (esp. illiquid microcaps).
4. Mechanical corporate action: split, dividend, ticker change, NAV adjustment,
   ETF/index rebalance, options-expiration pinning.
5. Duplicated / stale / single-source news; cluster by story, 24h cooldown per
   ticker per theme.
6. Analyst target change without an estimate or thesis change.
7. Routine 10b5-1 insider sale; short-*volume* misread as short *interest*; FTD
   misread as proof of abusive shorting.
8. **Continuation of an already-reported move** — reported "−3σ" yesterday, more
   grind today does **not** re-fire *unless severity ratchets to a new tier*.
   Implement as a **two-threshold hysteresis (Schmitt trigger)**: enter alert
   state at `z_on=2.5`, hold until `z` falls below `z_off=1.5`; exponential
   cooldown `1−e^(−Δt/T)`, T=4h, pierced only by a severity ratchet. This kills
   threshold-flapping. (Ratchet rule: update/upgrade, never repeat.)

## Step 6 — Ranking When Several Fire At Once

Every signal record carries:
```
signal_id, symbol, severity, signal_type, headline, what_happened,
why_it_matters, evidence, thresholds_crossed, noise_filters_checked,
portfolio_impact, confidence, novelty, timestamp, ui_deep_link
```

### Score (0–100)
Each component is a **bounded [0,1] map** (derivations in `Strategy-Analysis.md`):
```
S (severity)   = 1 − e^(−|z_idio|/1.5)          # saturating, extremes don't blow up
I (impact)     = min(|r_i|·w_i / 0.01, 1)        # 1% weighted contribution = full
C (confidence) = c_data · ½(1 + min(RVOL/3, 1))  # c_data ≤ 0.5 during cold start
η (novelty)    = 1 new / 0.5 follow-up / e^(−Δt/T)→0 continuation
F (confluence) = 1 − Π(1 − f_j)                  # independent confirmations
P (noise)      = noise_penalty / 5

score = ⌊100 · clip( 0.30·S + 0.25·I + 0.15·C + 0.10·η + 0.20·F − 0.40·P , 0, 1)⌋
```
**Why these, not arbitrary weights:** score is a monotone proxy for the expected
utility of notifying *now* — `E[U] ∝ P(material | evidence) × impact`, with
`P(material|·)` rising in S, C, F and impact = I. Core intuition it encodes: **a
5σ move in a 1% position can matter less than a 2.5σ move in a 40% position** —
rank by impact on the user's money, not by how loud the news is.

**Impact gate (multiplicative override):** for non-hard-events, if `w_i < 2%`
cap the score at 59 (P2) — loud news on a 0.5% position does not page the user.
Portfolio-level breaches and hard events bypass the gate.

### Severity → handling
| Tier | Definition | Handling |
|---|---|---|
| P0 | hard event, **thesis break** (§Thesis-Linked), portfolio drawdown/concentration breach, or score ≥ 80 | immediate single push, deep-linked to the matching card |
| P1 | score 60–79 (e.g. 2–2.5σ confirmed, clustered revisions, slow-signal trigger) | folded into a digest (max two windows/day: morning + evening) |
| P2 | score 40–59 (near-threshold, milestones, FYI) | interface + digest, no push |
| P3 | score < 40 | archived unless Sensitive mode |

### Concurrency merge rules (anti-spam)
1. **Same ticker, many signals → fuse into one** complete narrative (price + volume
   + news), take the highest tier — not three fragments.
2. **Many tickers, one cause → roll up to one portfolio-level line** (Noise #1).
3. **Confluence upgrades:** price anomaly + sector-relative + high turnover +
   credible catalyst = high priority; filing + dilution + weak balance sheet +
   high weight = high priority. **Isolated downgrades:** price-only + no volume +
   sector explains it = low; headline-only + old source + no estimate impact = low.
4. **Push budget** — P0 defaults to ≤4/day. Formally a 0/1 knapsack (maximize
   Σ score s.t. Σ pushes ≤ B); under unit cost, **greedy-by-score is optimal** —
   demote the rest into the digest. **Rather miss one medium signal than have the
   user mute notifications — alert trust is this product's core asset.**
5. **When many fire, order by:** portfolio loss/concentration → hard
   fundamental/financing/regulatory/liquidity events → multi-signal confluence on
   high-weight holdings → idiosyncratic unexplained moves → sector/macro events
   hitting multiple holdings → confirmed options/short/flow → pure technicals →
   background news.

---

## Thesis-Linked Monitoring (v1 capability)

The highest-value question isn't "what is the market doing?" — it's **"is the
reason I bought this still true?"** A generic 2σ move is *informational*; a broken
buy-thesis is *decision-grade*. So a thesis is a **first-class monitored object**,
and its violation escalates **straight to P0** — it challenges the user's
decision, not just reports a move.

**Capture — three sources (reliability descending).** A thesis can arrive:
1. **Stated** — the user says *why* at intake ("I hold MSTR as a leveraged BTC
   play"); parse into (holding · relation · reference · direction). Most reliable.
2. **Proposed & confirmed** — if unstated, *infer a likely thesis and offer it for
   one-tap confirm* rather than interrogate: "MSTR looks like a BTC proxy — watch
   that relationship? [yes / it's something else / no thesis]". One tap, near-zero
   friction.
3. **Data-inferred** — as a fallback, propose the asset it historically tracks
   most tightly as a candidate.

*Live in the Playbook:* the feed emits a **suggested thesis per holding** (from its
sector → a benchmark + a plain-language reason), and the interface's **"Arm a thesis"**
card lets the user **confirm in one tap** (writes the thesis to config via the
`updateWatchlist` UDF; monitored from the next run). The reference can be **any
benchmark** — crypto (BTC) *or* a stock/ETF (SMH, QQQ, XLF, SPY, …) — so the same
residual-vs-reference engine arms a thesis for any holding, not just crypto-linked ones.

**Elicitation rule — propose, don't interrogate.** Never ask a thesis question per
holding (that violates the one-blocking-question rule and trains users to ignore
you). Ask/propose only where a thesis materially changes monitoring *and* is
likely — concentrated positions, and names with an obvious proxy (crypto-linked,
ADRs, thematic). And a thesis is **dynamic, not intake-only**: the user can add or
revise one anytime in plain language ("actually I hold XOM for the dividend as
long as oil stays above $70") and the loop picks it up on the next run.

**Derive a monitorable invariant — an extensible library.** A thesis is ultimately
a *testable invariant*, and testable invariants come in only a few mathematical
shapes. So a "new thesis" is usually **new parameters, not new code** — parse →
route to a template → fill parameters → live in seconds:

| Thesis shape | Invariant type | Monitored as |
|---|---|---|
| "X is my leveraged / proxy Y" | **relationship** | residual vs Y (built) |
| "X to beat sector Z" | **ranking** | relative-performance spread vs Z |
| "X hedges my book" | **correlation** | sign of ρ(X, book) in drawdowns |
| "hold XOM while oil > $70" | **level** | a named series crossing a threshold |
| "X should move with gold" | **correlation** | rolling ρ decay toward 0 |
| **"held betting event E happens"** | **catalyst** | **Polymarket P(E) — a material, liquid drop = thesis breaking** |

**Catalyst thesis via prediction markets (v1).** When the thesis *is* an event
("I hold homebuilders betting the Fed cuts", "I hold PFE for the approval"), point
the invariant at the **Polymarket probability** of that event (a real, daily,
well-calibrated series for *liquid* markets). Treat the probability `p_t` as the
reference series: watch the collapse from its thesis high-water `pHigh`
(`relDrop = (pHigh − pNow)/pHigh`) and the vol-normalised worst move. A material
adverse move on a **liquid** market (spread ≤ ~3¢, deep book) → thesis
strained/broken → escalate. Same escalation logic as the price thesis, reference
swapped from asset price to event probability. **Verified on real data**
(`catalyst-thesis.js`): "held betting the Fed cuts by Jan 2024" → Polymarket
P(cut) collapsed **51% → 1%** → thesis BROKEN → P0. Guardrails: **liquidity gate**
(thin markets are noise — the highest-volume markets skew sports/politics, so gate
hard and label confidence), probability is **not a price oracle**, and the
market→holding mapping is **user-confirmed, not auto-guessed**.

For a genuinely novel shape the in-loop LLM acts as a **thesis compiler**:
translate the thesis into a monitorable proxy and check the data exists — wire it
if so (Polymarket, calendars, filings), or honestly state what can and can't be
watched. (Deep fundamental-level theses still need extra data → v2.)

**Watch the invariant — the framing flips.** In the base model, idiosyncratic
(residual) moves are the *signal* and market moves are rolled up as *noise*. A
thesis inverts this: it declares what *should* be correlated, so a **residual
against the thesis benchmark is a thesis violation**. Same residual-vol math
(§Step 4), re-pointed at the thesis reference asset:
```
expected_t   = β_ref · r_ref,t          # thesis-implied move
divergence_t = r_holding,t − expected_t  # what the thesis failed to explain
V            = |divergence_t| / σ_resid  # violation severity, in σ
```
**Thesis-break trigger:** the reference made a material move (|z_ref| ≥ 1.5) yet
the holding diverged against the thesis (V ≥ 2). Plus a **slow regime check**:
rolling ρ(holding, ref) decaying toward 0 over weeks = the relationship is
breaking even without one dramatic day. A confirmed break → **P0, bypassing the
normal σ gate** (escalation weight is maximal by construction).

**Verified on real data.** `thesis-monitor.js` run on 5y MSTR/BTC found e.g.
**2024-11-21: BTC +4.3% but MSTR −16.2%** (thesis-expected +6.5% at β=1.5) — a
−22.6% divergence = **4.6σ against the thesis** → P0: *"you hold MSTR as leveraged
BTC, but on a day BTC rallied it fell 16% — the leverage relationship isn't
holding."*

**Interface & alert.** Each thesis-carrying holding shows a **thesis chip**
(`intact / strained / BROKEN`, with live β/ρ vs expected); a break surfaces as a
distinct top-of-feed **"Thesis break"** signal and a P0 alert whose body names the
violated logic, not just the price. The portfolio lens gains a *thesis-health* row.

## The Interface (Playbook)

Live-read HTML over the feeds (never hardcode values).

**Required tab structure — build all four (this is not optional).** The product's
promise is "usable *and* transparent, not a black box," so the interface must expose
its reasoning, not just its output:

- **Watch** — the live dashboard (the five content views below).
- **Incident** — for a chosen P0, show how the raw facts (price → volume → options →
  smart-money → thesis) fuse into a *single evolving card* with minimal buzzes
  (visualizes Narrative Fusing + Silent Update).
- **Theory** — the methodology in plain language: the layered model, the three-check
  gate, the noise rules, the ranking, and thesis-linked monitoring. So an adopter
  understands *why*.
- **Formulas** — the exact math (adaptive baseline, residual-vol z, t-thresholds,
  FDR, the 0–100 score). So a reviewer can audit it.

Theory and Formulas are **static explanatory content authored from this spec** — they
don't read the feed, so include them even on a minimal build. (A rebuild that ships
only the Watch dashboard is incomplete: it loses the transparency that differentiates
this product.)

> **Reuse the shipped reference interface — do not re-author these tabs from scratch.**
> A complete, lint-passing reference interface is bundled with this skill at
> **`scripts/live/pw-index.html`** (also at `playbook-src/pw-index.html` in the repo).
> The **Theory, Incident, and Formulas tabs are portfolio-independent static content**
> — lift them **verbatim** from that file; hand-rewriting them is what produces the thin,
> low-fidelity Theory/Formulas an agent tends to generate. Only the **Watch** tab needs
> adapting to the new build: repoint `USER`/`FEED` paths and the watched set to the new
> feeds, and (if not using the demo pin) drop the Demo/Live buckets. In other words:
> **adapt the reference, don't reinvent it.** If the agent cannot read the bundled file,
> at minimum reproduce the Theory sections ⓪–⑥ (reading-the-numbers, sources, layered
> model, three-check gate, noise filters, ranking, thesis) and the full formula set.

The **Watch** tab holds five content views, top-down by what the user cares about most:

1. **Portfolio Overview** — today's return vs normal band, estimated P&L,
   top contributors/detractors, active P0/P1/P2 counts, market/sector context,
   shared exposures, data freshness, and missing-data warnings. Answers *"do I
   need to worry?"* in one glance.
2. **Signal Feed (ranked)** — live real-moves sorted by score, each card showing
   ticker, what happened, σ/RVOL/cause, tier badge, portfolio impact, confidence,
   alert status, time. **Each card has a stable anchor id** (`#sig-<id>`) so an
   alert deep-links straight to it.
3. **Holding Detail** — Asset Profile, price chart vs market/sector/peers,
   volume/turnover/liquidity panel, news & filing timeline, sector-template
   indicators, options/short/borrow panel when available, signal history, and
   which monitors are active vs unavailable.
4. **Risk Map** — position weights, sector/factor exposure, correlation clusters,
   shared event exposure, concentration risk, and the largest "what changed today"
   explanations.
5. **Settings** — sensitivity preset, push thresholds, watchlist vs weighted mode,
   cooldowns, digest schedule, custom ticker notes, user thesis.

Follow `references/design.md` and pass `alva lint playbook`. ECharts must wrap
init/resize in `requestAnimationFrame`.

## The Alerts

**Deliver to *this* user (subscribe + channel + verify).** Emitting a `notify/message`
record is not enough — the user must actually receive it on their phone:
- After release, **subscribe the user to the Playbook's alerts** so `feed_alert_ready`
  fans out to their `active_channel` (`alva subscriptions subscribe-playbook --username
  <user> --name <playbook>`).
- **Confirm a channel is connected.** If `alva whoami` shows no `active_channel`, guide
  the user to link one at **alva.ai/settings** (Discord / Telegram / Slack) — the very
  same pipeline regardless of app, no code change. Telegram's editable single-card
  *silent update* additionally needs a BYOD bot token (Secret Manager); without it,
  delivery degrades gracefully to one coalesced card per episode.
- **Verify end-to-end, don't assume.** Trigger one run and confirm delivery via
  `alva notification-history`; the loop the assignment asks for — *push on the phone →
  tap → the matching card in the interface* — must be demonstrated, not claimed.

- Sidecar: **`notify/message`** (proactive alerts, not trading targets).
- **Quiet by default** — emit `<|SKIP_NOTIFICATION|>` on any tick with no P0/P1;
  a watch feed that pings every run trains the user to mute it.
- **Deep link back** — every alert body ends with a link to the exact card:
  `https://alva.ai/u/<username>/playbooks/<name>#sig-<id>`. Tapping an alert lands
  on the matching content — this closes the loop the assignment asks for.
- **Message shape** — lead with the outcome, then evidence, then link:
  ```
  [P0] SYMBOL: headline
  Move: price/relative move + timeframe
  Why it matters: one sentence
  Evidence: 2–3 bullets
  Portfolio impact: estimated contribution/exposure
  Open: <deep link to signal detail>
  ```
  One P0 = one message. Multiple P1 = one digest message. Format per
  `references/user-facing-prose.md`.
- **Dedup & throttle** — never resend the same signal; **update the existing
  thread** when severity changes or new evidence arrives; 60-min cooldown for
  same-symbol same-type P1; P0 breaks cooldown only on new material evidence.
- **Narrative Fusing + Silent Update (delivery-side coalescing).** An incident
  unfolds over time — NVDA −5σ, then unusual short volume, then a guidance-cut
  headline: three correct signals, but *one* event. Do not send three cards.
  Open an **episode** keyed by symbol/cluster with a ~10-min coalescing window;
  attach later related signals to it. Fuse them by **causal precedence
  (sovereign merge)**: the causal event (earnings/M&A/regulatory) takes the
  headline even if it arrived last; earlier price/volume moves become its
  evidence trail — one headline, one evidence timeline, one impact, one deep
  link. Deliver with **Silent Update**: the first alert is a real push (one
  vibration) and stores the message handle; within-window updates *edit the same
  message* (Telegram `editMessageText` is inherently silent) — the phone keeps
  one evolving card, no re-buzz. **Escalation override:** re-notify (one new
  buzz) only when the fused tier rises above the last-notified tier (P1→P0) or a
  hard event lands — a worsening incident earns a vibration; everything else is a
  silent edit. Result: buzzes scale with *distinct incidents* (`1 + escalations`,
  usually 1), not with number of facts (naive `k`). Editable single-card UX uses
  a direct Telegram Bot API via a Secret-Manager bot token; with only the
  platform push available it degrades to one coalesced card per episode.
- **Delivery** — web push always works; Telegram/Discord/Slack if `active_channel`
  is set in `alva whoami`. If none, tell the user web works now and they can
  connect an IM channel at https://alva.ai/settings.

Complete the push flow exactly as `references/push-notifications.md` requires:
sidecar → automation publish → `--push-notify` → `alva alert enable --playbook`
→ trigger a real run → confirm a fresh, non-empty (or correctly quiet) sidecar
record.

## Sensitivity Presets (user-tunable in plain language)

| Preset | Pushes | For |
|---|---|---|
| Quiet | P0 only; P1/P2 digested | long-term holders who only want the big stuff |
| Standard (default) | P0 immediate, P1 digested, P2 interface | most users |
| Sensitive | P0 + P1 immediate, selected high-confidence P2, tighter cooldowns, technical/options/intraday included | active traders |

Switch by talking: *"too noisy"* → step down; *"I want more"* → step up. Store the
choice in the profile feed. All presets share the same detection math — only the
push gate and cooldowns move.

## Schedule (default cadence → Alva cronjobs)

- US equities regular session: price/volume/liquidity every **5 min**.
- Pre/after-hours: every **15 min** with stricter volume filters.
- News: every **10–15 min** during active hours.
- SEC filings: every **10–15 min** intraday + once after close.
- Options: every **15 min** when options exist.
- Analyst/estimate changes: daily + event-driven.
- Short interest / FTD / ownership: daily or on update; label reporting lag.
- End-of-day summary: after US close.
- Crypto: **24/7 every 5 min** for price/perp/liquidation/venue data; 15–60 min
  for on-chain and ETF-flow data by availability.

Use the user's timezone for summaries; show US market timestamps in ET.

## Cold Start (new IPOs, freshly bridged tokens, < 20 days of history)

A just-IPO'd stock or a token new to a venue has too little history for a stable
baseline — the naive σ estimate has ~32% relative error at n=5
(`SE(σ)/σ ≈ 1/√(2n)`). Do **not** wait 20 days silently. Three steps (full math
in `Strategy-Analysis.md`):

1. **Sector-benchmark prior.** Seed the baseline from the holding's sector
   benchmark's **cross-sectional median** risk metrics:
   `σ̂_i⁽⁰⁾ = m · median_{j∈sector}(σ_ε,j)` where m (~1.5–2.5) is the single-name
   dispersion multiplier calibrated from the sector; seed β from the sector median
   (IPOs often start at 1.0). For a bridged token with no history on the new
   venue, attach to its **origin-chain / other-venue history** or a same-class
   basket (e.g. L1 tokens) median before falling back to the sector prior.
2. **High-frequency bootstrap.** Estimate daily σ from intraday **realized
   variance** `RV_d = Σ r_{d,j}²`, `σ̂ = √RV_d`, instead of waiting for daily bars.
   With ~78 five-minute RTH bars, one day carries the information of dozens of
   daily observations (`Var(RV) ≈ 2σ⁴/M`), so the estimate converges **within a
   week**. Add an overnight-gap variance term (RV covers only the session).
3. **Linear shrinkage correction.** Blend prior → own estimate as data
   accumulates: `σ̂_i(n) = w(n)·σ̂_sample+HF + (1−w(n))·σ̂⁽⁰⁾`, with
   `w(n) = clip(n / 20, 0, 1)` over HF-equivalent days — a ~1-week ramp to full
   self-calibration.

**Cold-start guardrails:** thresholds use t-quantiles so small n auto-widens the
bar (Step 4); confidence is capped `C ≤ 0.5` so a cold-start signal can't be P0
on statistics alone (hard events — lockup expiry, S-1 risk factors, token
contract exploit/unlock — still escalate); the interface labels the state
("baseline: sector prior, converging — day n/5"), never faking a mature signal.

## Latency & Data Timeliness

- **Staleness-aware confidence.** Every metric carries an as-of timestamp; when
  lag Δt exceeds its type threshold, decay confidence `c_data · e^(−Δt/T_stale)`
  (minutes for price, hours for filings, days for short-interest with labeled lag)
  — down-weight, never fabricate.
- **Event-time recompute.** Align on the bar's close time, not processing time;
  set a watermark + allowed-lateness window. When late/backfilled bars arrive,
  **idempotently re-score** that timestamp; the hysteresis/ratchet suppresses a
  duplicate push unless severity now crosses a higher tier.
- **Thin pre/after-hours.** Widen the threshold (`k_ETH = k·γ`, γ>1) and require
  volume confirmation; unconfirmed ticks wait for the RTH open (Noise #4).

## Data Quality & Degradation

For every signal, show data freshness and confidence. If data is unavailable:
continue with the remaining monitors, **never fabricate metrics**, mark missing
data in the interface, lower confidence when key confirmation is missing, and
explain what would upgrade/downgrade the signal when data arrives. This matches
Alva's content-legitimacy contract: every visible number comes from Data Skills,
feed output, or validated BYOD — no memory-derived figures posing as live facts.
If the portfolio is a watchlist only, use equal-weight estimates, rank by severity
then equal-weight impact, and prompt the user to add weights.

## Verification (done means done)

- Profile feed has a fresh record with `sigma`, `beta`, benchmark routing,
  `avg_vol`, and capability flags per holding; crypto / crypto-linked recognized.
- Watch feed emitted ≥1 scored record; three-check gate, noise filters, ranking,
  and merge rules demonstrably applied (test with a known past move).
- Interface has **all four tabs** — Watch (five content views rendering live feed
  data), Incident, Theory, Formulas; missing/stale data labeled; screenshot verifies.
  A Watch-only build is incomplete.
- Every alert body carries a working `#sig-<id>` deep link.
- **Preflight handled (Step 0):** base `alva` skill reachable (else the user was told to
  `npx skills add …`), user signed in, and an `active_channel` connected — or the user
  was explicitly guided to link one at alva.ai/settings.
- **Delivery wired to the user:** the user is subscribed to the Playbook's alerts, and a
  real push was **confirmed delivered** (`alva notification-history`, status `sent`) —
  push → tap → matching card demonstrated, not assumed.
- Alert enabled; a real run wrote a fresh sidecar record (or a correct
  `<|SKIP_NOTIFICATION|>` on a quiet tick).
- Told the user, in their words: what it watches, when it will ping, what the next
  alert will say, and that quiet runs stay silent.

## Extensions (v2+)

Deep fundamental-level theses (need per-KPI data) · multi-portfolio comparison · Altra-backed
"what-if" · deeper on-chain / options microstructure.

*(Proxy/leverage, relative-performance, hedge, **and catalyst (via Polymarket)**
theses are v1 — see §Thesis-Linked Monitoring.)*

---

# Appendix A — Benchmark Routing

Assign each holding a market benchmark, sector benchmark, peer basket, and factor
proxy for the residual-move / sector-relative computations in Step 3–4.

| Area | Benchmarks | Area | Benchmarks |
|---|---|---|---|
| Broad equity | SPY, VTI | Energy E&P/integrated | XLE |
| Nasdaq/growth | QQQ | Oil services | OIH |
| Small-cap | IWM | Industrials | XLI |
| Technology | XLK, VGT | Materials | XLB |
| Semiconductors | SOXX, SMH | Utilities | XLU |
| Comm. services | XLC | Real estate / REITs | XLRE |
| Consumer disc. | XLY | Homebuilders | XHB, ITB |
| Consumer staples | XLP | Retail | XRT |
| Healthcare | XLV | Transportation | IYT |
| Biotech | XBI, IBB | Gold miners | GDX |
| Financials | XLF | Bitcoin/crypto | BTC, ETH, crypto-ETF flows |
| Regional banks | KRE | | |

When no clean ETF benchmark exists, use peer-basket relative performance. Use
rates, dollar, oil, credit spreads, BTC/ETH, or commodity proxies when they
explain the asset better than sector beta (e.g. a gold miner vs GDX + gold).

# Appendix B — Sector / Asset-Type Templates

Apply the matching template's KPIs so the event/info layers read a move against
the right fundamentals. Mark the primary driver if a name spans several.

| Template | Key indicators |
|---|---|
| Software/SaaS | ARR, growth, NRR, churn, RPO, billings, gross margin, sales efficiency, FCF margin, AI monetization |
| Internet/ads/platforms | DAU/MAU, engagement, ad pricing/load, take rate, GMV, regulatory risk |
| Semiconductors | Revenue guidance, gross margin, inventory days, backlog, book-to-bill, foundry capacity, capex cycle, AI/data-center demand, export controls |
| Hardware/consumer electronics | Units, ASP, channel inventory, supply chain, services mix, product cycle, China exposure |
| Banks | NIM, deposit beta, deposit outflows, loan growth, charge-offs, reserve build, CET1, CRE exposure, AOCI |
| Brokers/exchanges/asset mgrs | AUM, net flows, trading volumes, margin balances, fee rate, regulatory capital |
| Insurance | Combined ratio, catastrophe losses, reserve development, investment yield, pricing |
| Fintech/payments | TPV, take rate, loss/delinquency rate, funding cost, transaction margin, network/regulatory risk |
| Biotech | Trial readouts, endpoints, adverse events, FDA/PDUFA, patent life, cash runway, dilution risk |
| Pharma/medtech/providers | Pipeline, approvals, reimbursement, procedure volumes, recalls, patent cliff, utilization, MLR |
| Energy E&P/integrated | WTI/Brent, natural gas, production, realized price, hedge book, lifting cost, reserves, OPEC |
| Refiners/oil services | Crack spreads, utilization, backlog, rig count, service pricing, capex cycle |
| Utilities | Allowed ROE, rate cases, load growth, fuel cost, debt cost, weather, grid capex |
| REITs | Occupancy, same-store NOI, AFFO, cap rates, leasing spreads, tenant concentration, debt maturity, rates |
| Retail/restaurants/staples | Same-store sales, traffic, ticket, inventory, markdowns, input/labor cost, price/mix, FX |
| Autos/EV | Deliveries, ASP, gross margin, inventory, incentives, recalls, battery cost, autonomy milestones |
| Airlines/travel/transport | Load factor, RASM, CASM, fuel, bookings, capacity, freight rates, labor/weather disruption |
| Telecom/media | Subscribers, ARPU, churn, capex, spectrum cost, content cost, ad revenue |
| Industrials/aerospace/defense | Orders, backlog, book-to-bill, supply chain, program delays, government budget |
| Materials/miners/chemicals | Commodity prices, spreads, inventory, China demand, energy input cost, capacity |
| Homebuilders/housing | Mortgage rates, orders, cancellations, backlog, incentives, community count, input costs |
| SPAC/de-SPAC/high dilution | Cash runway, warrants, earn-outs, lockups, PIPE unlocks, redemption risk, going-concern |
| ETF/ETP/CEF | Underlying index, NAV, premium/discount, flows, creation/redemption, expense ratio, leverage |
| ADR | Local-market price, FX, home-country regulation, liquidity, geopolitics, depositary events |

# Appendix C — Crypto & Crypto-Linked Template

For BTC, ETH, SOL, other crypto, crypto ETFs, and crypto-linked equities.

Track: spot price, realized vol, relative strength vs BTC/ETH, perpetual funding,
futures basis, open interest, liquidation volume, exchange inflow/outflow, ETF
flows, stablecoin supply and peg, on-chain fees, active addresses, TVL, DEX
volume, staking ratio, validator health, token unlocks, foundation/whale wallet
moves, governance votes, protocol upgrades, listings/delistings, withdrawal
freezes, hacks, bridge exploits.

Flag when: price is confirmed by OI expansion + liquidations; funding/basis hits
extreme percentiles; large exchange inflows suggest sell pressure; ETF flows
diverge from price; stablecoin peg breaks; liquidity deteriorates; an exploit or
governance attack occurs; or major unlocks approach.

**Crypto gate (stricter tiering).** Crypto and crypto-linked names are small-sample
and high-variance — the backtest confirms wider tails and thinner history — so they
carry a **higher bar and a confirmation requirement**, not the equity defaults:
- **Thresholds ×1.25.** kSurface/kPush/kForce are inflated 25% for crypto assets, on
  top of the usual t-quantile / cold-start inflation.
- **Confirmation to page.** An unconfirmed crypto price move (no volume ≥2× and no
  OI/funding corroboration) is **demoted one tier** — it can surface in the interface
  but won't page as P0/P1 on magnitude alone.
- **Thesis is exempt.** A broken price/proxy or catalyst thesis is high-conviction and
  still escalates straight to P0 (e.g. MSTR decoupling from BTC), regardless of the gate.
This is implemented in the feed (`asset_class`, `crypto_gated` on each signal) and
mirrored client-side so the interface's threshold sliders stay consistent.

Crypto noise: low-quality social rumors, wash-trading volume, moves isolated to
illiquid venues, whale transfers between known internal wallets, meme bursts
without liquidity confirmation.

For **crypto-linked equities**, connect the equity move to the crypto driver:
MSTR must show equity performance *and* BTC exposure; miners must show BTC price,
hashprice, energy cost, and fleet updates.
