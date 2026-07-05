---
name: portfolio-watch
description: "Build an adaptive Portfolio Watch Playbook for public-market portfolios. Use when a user asks to monitor holdings, watch tickers, track a portfolio, detect material market moves, build an investor dashboard, or send alerts for stocks, ETFs, ADRs, REITs, crypto assets, or crypto-linked equities. The skill generates monitoring dimensions, anomaly thresholds, noise filters, signal ranking, interface structure, schedules, and alert rules."
---

# Portfolio Watch

Build a reusable Portfolio Watch Playbook that separates material investment signals from market noise. The Playbook must work for arbitrary user-provided US-listed securities and crypto assets. The output is monitoring and explanation, not investment advice.

## Execution Workflow

Always execute in this order:

1. Parse holdings, position sizes, user intent, alert channel, and time horizon.
2. Create an Asset Profile for every holding.
3. Route each asset to universal monitors plus sector or asset-type templates.
4. Detect anomalies with adaptive baselines, not one fixed percent threshold.
5. Apply noise filters before ranking.
6. Rank signals by materiality, confidence, novelty, portfolio impact, actionability, confluence, and noise penalty.
7. Build an interface with portfolio overview, signal feed, holding detail, risk map, and settings.
8. Send push alerts only when a signal is important, explainable, and relevant to the user's actual exposure.

## Input Defaults

Extract: tickers/assets, shares or notional, portfolio weights, cost basis, watch style, alert channel, timezone, and time horizon.

Use these defaults when missing:

- Missing weights: use equal weight and label portfolio-impact estimates as approximate.
- Missing watch style: use balanced mode, which pushes P0/P1, shows P2 in the interface, and suppresses P3.
- Missing time horizon: optimize for long-term investors; emphasize fundamentals, events, liquidity, filings, and portfolio impact over small technical moves.
- Ambiguous ticker: resolve to the most likely US-listed security. Ask only when ambiguity changes the asset type or monitoring template.

## Asset Profile

Before monitoring, classify each holding:

```text
symbol, asset_type, exchange_or_venue, sector, industry, subindustry,
market_cap_bucket, liquidity_bucket, volatility_bucket, free_float,
avg_dollar_volume_20d, options_available, short_interest_available,
crypto_exposure, portfolio_weight, primary_benchmark, sector_benchmark,
peer_basket, event_calendar, data_freshness_notes
```

Use these asset types: common equity, ADR, ETF/ETP, closed-end fund, REIT, BDC, MLP, preferred stock, SPAC/de-SPAC, crypto asset, crypto-linked equity, or other listed security.

Crypto-linked equities include exchanges, miners, treasury companies, brokerages, stablecoin/payment proxies, and companies whose equity risk is materially driven by crypto prices. Examples: COIN, MSTR, MARA, RIOT, CLSK, HOOD, SQ.

## Benchmark Routing

Assign a market benchmark, sector benchmark, peer basket, and factor proxy:

| Area | Benchmarks |
| --- | --- |
| Broad equity | SPY, VTI |
| Nasdaq/growth | QQQ |
| Small-cap | IWM |
| Technology | XLK, VGT |
| Semiconductors | SOXX, SMH |
| Communication services | XLC |
| Consumer discretionary | XLY |
| Consumer staples | XLP |
| Healthcare | XLV |
| Biotech | XBI, IBB |
| Financials | XLF |
| Regional banks | KRE |
| Energy | XLE |
| Oil services | OIH |
| Industrials | XLI |
| Materials | XLB |
| Utilities | XLU |
| Real estate | XLRE |
| Homebuilders | XHB, ITB |
| Retail | XRT |
| Transportation | IYT |
| Gold miners | GDX |
| Bitcoin/crypto | BTC, ETH, crypto ETF flows when available |

Use peer-basket relative performance when no clean ETF benchmark exists. Use rates, dollar, oil, credit spreads, BTC, ETH, or commodity proxies when they better explain the asset than sector beta.

## Universal Monitors

Apply these to every US-listed holding when data exists.

### Price And Relative Performance

Track intraday/premarket/after-hours/1d/5d/1m/3m/YTD returns, gap, open-to-close move, 52-week high/low distance, drawdown, ATR, realized-volatility z-score, market-relative return, sector-relative return, peer-relative return, and residual move after market/sector adjustment.

Flag an anomaly when any condition holds:

- Absolute return z-score is >= 2.0 versus the asset's 60-day baseline.
- Sector-relative return z-score is >= 2.0.
- Market and sector explain less than half of the move.
- Price breaks a 20d/50d/200d range with volume confirmation.
- Price gaps through earnings, guidance, regulatory, financing, or product events.

### Volume, Turnover, And Liquidity

Track relative volume, 20d average volume, 20d average dollar volume, dollar volume, turnover, turnover percentile, bid-ask spread, spread percentile, premarket/after-hours volume quality, halts, LULD, SSR, and clearly abnormal prints.

Use:

```text
relative_volume = current_volume / historical_same_time_volume
dollar_volume = price * shares_traded
turnover = current_volume / free_float
```

Flag an anomaly when any condition holds:

- Relative volume is >= 2.0 and price or news also moves.
- Turnover is >= 2.0x its 60-day median or above the 90th percentile.
- High turnover appears while price fails to advance after good news, suggesting distribution.
- Bid-ask spread widens above the 90th percentile for liquid names.
- Premarket/after-hours move is confirmed by meaningful dollar volume.

Downgrade large percentage moves with low dollar volume, wide spreads, or no official catalyst.

### Options And Volatility

When options exist, track options volume, open interest, call/put volume ratio, put/call ratio, IV, IV rank, IV percentile, skew, unusual blocks, gamma exposure, expected move, and post-event IV crush.

Flag an anomaly when options volume is >= 2.0x 20d average, IV rank is above 80, IV/skew jumps by >= 2 standard deviations, put/call or call/put ratio is above the 90th percentile, or large options flow appears before a catalyst.

Do not push options-only alerts unless confirmed by spot price, volume, news, filings, or known events.

### Short Interest, Borrow, And Settlement Stress

Track short interest percent of float, days to cover, short-interest change, borrow fee, lendable-share availability, fails-to-deliver balance, and SSR status.

Flag an anomaly when short interest is above 15% of float and rising, days to cover is above 5 with price rising on volume, borrow fee spikes, available shares collapse, or FTD is unusually high and coincides with liquidity stress.

Interpret carefully:

- Short-interest data is lagged; label the reporting date.
- FTD is not proof of naked short selling; use it only as settlement-stress context.
- High short interest can mean bearish conviction, squeeze risk, or both. Infer direction only with price and catalyst context.

### Filings, Ownership, And Corporate Actions

Track 8-K, 10-Q, 10-K, 6-K, 20-F, NT 10-K/10-Q, S-1, S-3, 424B, ATM programs, secondaries, convertibles, warrants, Form 4, Form 144, 13D/13G, auditor changes, restatements, going-concern language, buybacks, dividends, splits, spin-offs, mergers, index changes, and ETF rebalancing.

Upgrade open-market insider purchases, clustered senior-executive buying, financing filings for cash-burning companies, auditor resignation, late filings, restatements, going-concern warnings, and activist 13D filings.

Downgrade routine 10b5-1 sales, mechanical split/dividend adjustments, and old filings resurfacing as news.

### News, Narrative, And Expectations

Track high-credibility news, company releases, earnings-call transcript highlights, analyst rating/target/estimate changes, consensus revenue/EPS/guidance revisions, competitor/supplier/customer/regulator news, and social velocity as a weak signal.

Flag an anomaly when news changes revenue, margin, regulation, financing, product, legal, management, or risk-premium expectations; when estimates change broadly; when multiple credible sources confirm new information; or when news explains abnormal price/volume.

Suppress reposted old news, rumors without credible confirmation, generic market commentary, and target-price changes without estimate or thesis change.

### Macro And Cross-Asset Context

Track 2Y/10Y rates, real yields, yield curve, dollar index, oil, natural gas, gasoline, copper, gold, credit spreads, financial conditions, VIX, CPI, PCE, jobs, FOMC, Treasury issuance, geopolitics, tariffs, sanctions, and export controls.

Use macro to explain. Alert only when macro directly affects the user's holdings or several holdings share the same exposure.

## Sector And Asset-Type Templates

After universal monitors, apply the relevant template:

| Template | Key indicators |
| --- | --- |
| Software/SaaS | ARR, revenue growth, NRR, churn, RPO, billings, gross margin, sales efficiency, FCF margin, AI monetization |
| Internet/ads/platforms | DAU/MAU, engagement, ad pricing, ad load, take rate, GMV, creator/seller metrics, regulatory risk |
| Semiconductors | Revenue guidance, gross margin, inventory days, backlog, book-to-bill, foundry capacity, capex cycle, AI/data-center demand, export controls |
| Hardware/consumer electronics | Units, ASP, channel inventory, supply chain, services mix, product cycle, China exposure |
| Banks | NIM, deposit beta, deposit outflows, loan growth, charge-offs, reserve build, CET1, CRE exposure, AOCI, funding cost |
| Brokers/exchanges/asset managers | AUM, net flows, trading volumes, margin balances, fee rate, market activity, regulatory capital |
| Insurance | Combined ratio, catastrophe losses, reserve development, investment yield, pricing trend |
| Fintech/payments | TPV, take rate, loss rate, delinquency, funding cost, transaction margin, regulatory/network risk |
| Biotech | Trial readouts, endpoints, adverse events, FDA/PDUFA, patent life, cash runway, dilution risk |
| Pharma/medtech/providers | Pipeline, approvals, reimbursement, procedure volumes, recalls, patent cliff, utilization, MLR, labor cost |
| Energy E&P/integrated | WTI/Brent, natural gas, production, realized price, hedge book, lifting cost, reserves, OPEC/geopolitics |
| Refiners/oil services | Crack spreads, utilization, backlog, rig count, service pricing, capex cycle |
| Utilities | Allowed ROE, rate cases, load growth, fuel cost, debt cost, weather, grid capex |
| REITs | Occupancy, same-store NOI, AFFO, cap rates, leasing spreads, tenant concentration, debt maturity, rates |
| Retail/restaurants/staples | Same-store sales, traffic, ticket, inventory, markdowns, labor/food/commodity cost, price/mix, FX |
| Autos/EV | Deliveries, ASP, gross margin, inventory, incentives, recalls, battery/input cost, autonomy/regulatory milestones |
| Airlines/travel/transport | Load factor, RASM, CASM, fuel, bookings, capacity, freight rates, labor/weather disruption |
| Telecom/media | Subscribers, ARPU, churn, capex, spectrum cost, content cost, ad revenue |
| Industrials/aerospace/defense | Orders, backlog, book-to-bill, supply chain, program delays, cost overruns, government budget |
| Materials/miners/chemicals | Commodity prices, spreads, inventory, China demand, energy input cost, capacity additions |
| Homebuilders/housing | Mortgage rates, orders, cancellations, backlog, incentives, community count, lumber/input costs |
| SPAC/de-SPAC/high dilution | Cash runway, warrants, earn-outs, lockups, PIPE unlocks, redemption risk, going-concern risk |
| ETF/ETP/CEF | Underlying index, NAV, premium/discount, flows, creation/redemption, expense ratio, leverage, distribution coverage |
| ADR | Local-market price, FX, home-country regulation, liquidity, geopolitics, depositary events |

If a company spans multiple templates, include all material templates and mark the primary driver.

## Crypto Template

Use for BTC, ETH, SOL, other crypto assets, crypto ETFs, and crypto-linked equities.

Track spot price, realized volatility, relative strength versus BTC/ETH, perpetual funding, futures basis, open interest, liquidation volume, exchange inflow/outflow, ETF flows, stablecoin supply and peg, on-chain fees, active addresses, transaction count, TVL, DEX volume, staking ratio, validator health, token unlocks, foundation/team/whale wallet movements, governance votes, protocol upgrades, listings/delistings, withdrawal freezes, hacks, and bridge exploits.

Flag anomalies when price is confirmed by open-interest expansion and liquidations, funding/basis reaches extreme percentiles, large exchange inflows suggest sell pressure, ETF flows diverge from price, stablecoin peg breaks, liquidity deteriorates, protocol exploits occur, governance attacks occur, validator issues appear, or major unlocks approach.

Crypto noise: low-quality social rumors, wash-trading volume, moves isolated to illiquid venues, whale transfers between known internal wallets, and meme bursts without liquidity confirmation.

For crypto-linked equities, connect the equity move to the crypto driver. Example: MSTR must show equity performance and BTC exposure; miners must show BTC price, hashprice, energy cost, and fleet updates.

## Anomaly Model

Use adaptive baselines:

```text
asset_baseline = the holding's own historical behavior
sector_baseline = peer/sector behavior today
market_baseline = broad market and macro behavior today
event_baseline = expected behavior around known catalysts
liquidity_baseline = normal volume, turnover, spread, and dollar volume
```

Compute or approximate:

```text
relative_return = asset_return - benchmark_return
sector_relative_return = asset_return - sector_benchmark_return
portfolio_impact = portfolio_weight * asset_return
relative_volume = current_volume / historical_same_time_volume
turnover = current_volume / free_float
residual_move = asset_return - explained_market_sector_move
```

Prefer 60 trading days for short-term baselines and 1 year for broader context. Use robust percentiles or z-scores. For newly listed or thinly traded names, require stronger evidence and mark confidence lower.

## Noise Filters

Before ranking, test every signal for:

- Market-wide or sector-wide moves that explain the asset move.
- Low dollar volume, wide spread, or unreliable premarket/after-hours print.
- Mechanical corporate action: split, dividend, ticker change, or NAV adjustment.
- Duplicated, stale, or single-source news.
- Analyst target-price change without estimate or thesis change.
- Routine 10b5-1 insider sale.
- Short-sale volume misread as short interest.
- FTD misread as proof of abusive shorting.
- ETF/index rebalance explaining the flow.
- Options expiration or pinning explaining price behavior.
- Illiquid microcap percentage moves without dollar-volume confirmation.

Assign `noise_penalty` from 0 to 5.

## Signal Ranking

Every signal must contain:

```text
signal_id, symbol, severity, signal_type, headline, what_happened,
why_it_matters, evidence, thresholds_crossed, noise_filters_checked,
portfolio_impact, confidence, timestamp, ui_deep_link
```

Score from 0 to 100:

```text
score =
  20 * materiality
  + 15 * confidence
  + 15 * novelty
  + 20 * portfolio_impact
  + 15 * actionability
  + 15 * confluence
  - 20 * noise_penalty
```

Normalize each component to 0.0-1.0:

- Materiality: effect on cash flows, valuation, liquidity, solvency, regulation, or risk premium.
- Confidence: source quality, data freshness, and independent confirmation.
- Novelty: new information versus repeated or expected information.
- Portfolio impact: estimated P&L and exposure effect for the user's holdings.
- Actionability: whether the user benefits from knowing now rather than in a digest.
- Confluence: number and quality of independent confirming signals.
- Noise penalty: strength of the noise explanations.

Severity:

- P0: hard event or score >= 80. Push immediately.
- P1: score 60-79. Push in balanced mode.
- P2: score 40-59. Show in interface and digest.
- P3: score < 40. Archive unless user chose active/trader mode.

Hard events can become P0 before price confirmation: material earnings/guidance surprise, liquidity crisis, going-concern warning, auditor resignation, late filing, major financing/dilution, bankruptcy/restructuring/delisting risk, CEO/CFO sudden departure, FDA failure, major lawsuit/enforcement/sanctions/safety/fraud event, trading halt, merger/takeover/spin-off/strategic review, stablecoin depeg, exchange withdrawal freeze, protocol exploit, bridge hack, or one event materially affecting multiple holdings.

## Confluence And Ordering

Upgrade when independent signals point to the same conclusion:

```text
price anomaly + sector-relative anomaly + high turnover + credible catalyst = high priority
filing event + dilution risk + weak balance sheet + high portfolio weight = high priority
crypto price move + funding extreme + liquidation cascade + ETF outflow = high priority
```

Downgrade isolated signals:

```text
price move only + no volume + sector move explains it = low priority
headline only + old source + no price/estimate impact = low priority
options flow only + no spot move + no catalyst = watchlist only
```

When many signals fire, order by: portfolio-level loss or concentration, hard fundamental/financing/regulatory/liquidity events, multi-signal confluence on high-weight holdings, idiosyncratic moves unexplained by market/sector, sector or macro events affecting multiple holdings, confirmed options/short/flow signals, pure technical signals, then background news.

## Interface Requirements

Build these views:

- Portfolio Overview: portfolio return, estimated P&L, top contributors/detractors, active P0/P1/P2 counts, market/sector context, shared exposures, data freshness, and missing-data warnings.
- Signal Feed: severity, symbol, signal type, headline, score, portfolio impact, confidence, timestamp, alert status, and deep link. Sort by severity, score, portfolio impact, and recency.
- Holding Detail: Asset Profile, price chart versus market/sector/peers, volume/turnover/liquidity panel, news and filing timeline, sector indicators, options/short/borrow panel when available, signal history, active/unavailable monitors.
- Risk Map: position weights, sector exposure, factor exposure, correlation clusters, shared event exposure, concentration risk, and largest "what changed today" explanations.
- Settings: alert mode, push thresholds, watchlist versus portfolio-weighted mode, cooldowns, digest schedule, custom ticker notes, and user thesis.

## Alert Rules

Every push alert must be short, specific, and linked to the matching UI signal detail:

```text
[Severity] SYMBOL: headline
Move: price/relative move and timeframe
Why it matters: one sentence
Evidence: 2-3 bullets
Portfolio impact: estimated contribution or exposure
Open: deep link to signal detail
```

Deduplicate and throttle:

- Do not send repeated alerts for the same signal.
- Update the existing alert thread when severity changes or new evidence arrives.
- Use a 60-minute cooldown for same-symbol same-type P1 alerts.
- Let P0 break cooldown only when new material evidence appears.
- Send P2 in digest unless user selected active/trader mode.

Alert modes:

- Quiet: push P0 only; digest P1/P2.
- Balanced: push P0/P1; digest P2.
- Active: push P0/P1 and selected high-confidence P2.
- Trader: include technical, options, and intraday liquidity signals with tighter cooldowns.

## Schedule

Use this default schedule:

- US equities regular session: price/volume/liquidity every 5 minutes.
- US equities premarket and after-hours: every 15 minutes with stricter volume filters.
- News: every 10-15 minutes during active hours.
- SEC filings: every 10-15 minutes during active hours and once after close.
- Options: every 15 minutes when options exist.
- Analyst/estimate changes: daily and event-driven when available.
- Short interest, FTD, ownership: daily or whenever updated; label reporting lag.
- End-of-day summary: after US market close.
- Crypto: 24/7 every 5 minutes for price, perp/futures, liquidation, and major venue data; every 15-60 minutes for on-chain and ETF-flow data depending on availability.

Use the user's timezone for summaries, but show US market timestamps in ET when relevant.

## Data Quality And Degradation

For every signal, show data freshness and confidence. If data is unavailable, continue with remaining monitors, do not fabricate metrics, mark missing data in the interface, lower confidence when key confirmation is missing, and explain what would upgrade or downgrade the signal when data arrives.

If the portfolio is only a watchlist, use equal-weight estimates, rank by severity first and estimated equal-weight impact second, and prompt the user in the interface to add weights.

## Build Checklist

Before finalizing the Playbook, verify:

- Every holding has an Asset Profile, universal monitors, and the correct sector or asset-type template.
- Crypto and crypto-linked exposures are recognized.
- Price alerts use adaptive baselines, not one-size-fits-all thresholds.
- Turnover, dollar volume, liquidity, options, short interest, filings, ownership, and crypto-native indicators are included when data exists.
- Noise filters are visible and applied before alerts.
- P0/P1/P2/P3 severity is computed consistently.
- The interface contains Overview, Signal Feed, Holding Detail, Risk Map, and Settings.
- Every push alert deep-links to the relevant signal detail.
- Missing-data and stale-data conditions are labeled.
- The Playbook can work for a portfolio the builder has never seen before.

