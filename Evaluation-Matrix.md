# Evaluation Matrix — what's proven, and how

An honest, single-glance status of every capability, so nothing reads as
oversold. Each row says **how far it's been taken** and **what backs it**.

**Legend**
- 🟢 **Live** — deployed and running on the Playbook right now
- 🔵 **Verified (runtime)** — proven on real Alva data via a run/module (not
  necessarily wired into the live demo)
- 📊 **Backtested** — validated on historical data (see `Backtest-Report.md`)
- 📝 **Specced** — designed in `SKILL.md`/docs, not yet built or wired
- ⚠️ **Known limitation** — works, but with a stated boundary

## Core detection, scoring & noise control

| Capability | Status | Evidence |
|---|---|---|
| Relative per-holding baseline (EWMA λ=0.94 + robust MAD) | 🟢 · 📊 | `pw-profile` feed; backtest calibration |
| Market-β + **residual vol σ_ε** as the z denominator | 🟢 · 📊 | `pw-watch`; ablation L1 (§8.5) |
| t-quantile thresholds (data-dependent bar) | 🟢 | `pw-watch` scoring |
| Benjamini–Hochberg FDR (q=0.10) across holdings | 🟢 | `pw-watch` |
| Hysteresis ratchet (z_on 2.5 / z_off 1.5) | 🟢 | `pw-watch` via `ctx.kv` |
| Bounded 0–100 score + impact gate + P0/P1/P2 tiers | 🟢 | `pw-watch` |
| **β roll-up** (10 correlated moves → 1 portfolio line) | 🟢 | `pw-watch` portfolio layer |
| **Volume confirmation** raises precision-per-alert | 📊 | ablation L2: −26% alert volume at equal precision |
| Cold-start (sector prior + HF bootstrap + shrinkage) | 🟢 · ⚠️ | coded in `pw-profile`; **not exercised** by the 5-name demo (all have history) |

## Signal sources (10)

| Source | Status | Evidence |
|---|---|---|
| Price anomaly (residual σ) | 🟢 · 📊 | MSTR −4.8σ → P0; ablation |
| Thesis — price/proxy (e.g. MSTR vs BTC) | 🟢 · 📊 | live P0; ablation thesis eval: 9/37 breaks are thesis-only |
| Thesis — catalyst (Polymarket event) | 🟢 · 🔵 | ITB, P(Fed cut) 83→60% → P1; `catalyst-thesis.js` on real data |
| Macro overlay (Polymarket) | 🟢 | `pw-watch` context row |
| Semiconductor cycle (DXI) | 🟢 | `pw-watch` context row |
| Smart money (insider/congress) | 🟢 · 🔵 | live rows; `smart-money.js` |
| Options-implied (IV/expected-move/skew) | 🟢 · 🔵 | live rows; `options-signal.js` |
| Crypto microstructure (perp funding/OI) | 🟢 · 🔵 | live rows; `crypto-micro.js` |
| FinTwit KOL sentiment | 🟢 · 🔵 | live rows; `fintwit-sentiment.js` |
| mNAV valuation (crypto-treasury) | 🟢 · 🔵 | live rows; `mnav-lens.js` (materiality gate) |
| Daily digest (deterministic narrative) | 🟢 | `pw-watch` digest |

> Sources marked 🔵 as well as 🟢 have a standalone verified module; several are
> **context overlays / enrichments** by design (they raise conviction, they don't
> open new per-stock alert streams). Their *marginal precision* contribution beyond
> price/volume/thesis is **not yet individually backtested** — that needs
> point-in-time histories some of these endpoints don't expose. See "next" below.

## Alerts, interface & intake

| Capability | Status | Evidence |
|---|---|---|
| Push delivery to **Discord + web** with deep link | 🟢 | `notification-history`: channel `discord`, status `sent` |
| Telegram/Slack (same fanout pipeline) | 📝 | identical `active_channel` path; not connected on demo |
| **Alert fusion** — Narrative Fusing + Silent Update | 🔵 · ⚠️ | logic in `alert-fusion.js` (3-event→1 card, buzz 3→2); **on-the-wire delivery now wired in the feed** (`deliverTelegram`: sendMessage first, editMessageText silent updates, re-send on escalation) — activates when the `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` secrets are set (BYOD). Not demoed end-to-end (no bot token). |
| Interface: Watch/Theory/Formulas, War-Room, sliders | 🟢 | live, passes `alva lint` |
| Search-add **any** ticker (UDF profiles it live) | 🟢 | `updateWatchlist` add path |
| **Demo/Live toggle** (instant, client-side) | 🟢 | dual-snapshot: each mode has its own bucket; the header switches buckets **instantly** for any viewer. The Live bucket refreshes on the scheduled feed run. |
| Watched set as user-owned config (chat + UI) | 🟢 | `holdings.json` + `updateWatchlist` |
| **Thesis onboarding** — auto-suggest a buy-thesis per holding, confirm in one tap | 🟢 | feed emits `sugg_*` per sector; UI "Arm a thesis" card → `updateWatchlist action:"thesis"` writes config |
| Thesis vs **any benchmark** (BTC, SMH, QQQ, SPY…), not just crypto | 🟢 | `refReturnMap` handles stock & crypto refs |
| **Portfolio auto-intake** from a linked account | 📝 · ⚠️ | designed (SKILL §Step 1, `alva portfolio summary`); **not live-demoed — demo account has no linked account** (`accounts → []`). Credible, unproven. |

## Asset coverage (tiered — no oversell)

| Tier | Asset classes | State |
|---|---|---|
| **Fully implemented** | US-listed equities (SPY/sector-ETF β, residual vol, volume) | main path; backtested on 27 stocks / 37,837 days |
| **Partially implemented** | Crypto & crypto-linked equities (BTC benchmark, perp funding/OI, mNAV) | works & demoed (MSTR/COIN/ITB), with a **crypto gate**: thresholds ×1.25 + volume-confirmation-to-page (unconfirmed moves demoted a tier; thesis breaks exempt) — implemented in feed + interface (`asset_class`/`crypto_gated`). Small samples remain a caveat. |
| | ETFs | own-bar fallback path; light demo |
| **Specced** | ADRs, REITs, closed-end funds, SPACs, preferreds, illiquid names | benchmark routing defined in SKILL Appendix A; not individually demoed |
| | Brand-new listings | cold-start path coded, ⚠️ not exercised |

> The UDF's built-in name/sector metadata (`KNOWN`) is a **small dictionary**; any
> other ticker is still added and **auto-profiled** (its σ/β/residual are computed
> live), but its display name/sector may be blank until enriched. So "works on any
> ticker" means *monitoring works*; *pretty metadata* is best-effort.

## Where this honestly falls short (and the next validation step)

1. **Event-level evaluation — partly done (📊).** An earnings-aligned study now exists
   (`backtest/pw-event-study.js`, Backtest-Report §8.6): on 125 real earnings events,
   an alert is **4.73× more likely** to sit on an earnings window than a random day
   (recall 0.48 — the other half are in-line non-events the product should stay quiet
   on). This is genuine event-level evidence that alerts track catalysts, not price
   noise. ⚠️ **Bounded to a recent ~24-month window** — historical earnings dates
   aren't broadly available (earnings-calendar returns only ~6 recent quarters;
   income-statements/dividends are gated), so a full multi-year, multi-event-type
   (news/filings) study remains specced.
2. **Per-source ablation** beyond price/volume/thesis (smart-money, options, mNAV,
   sentiment) needs point-in-time source histories to measure marginal precision.
3. **Auto-intake** and **Telegram silent-update** are designed and partly verified but
   need, respectively, a linked account and a BYOD bot token to demo end-to-end.

Nothing here is claimed as proven that isn't. See `Backtest-Report.md` for the
numbers and `AGENTS.md` for how each piece is built.
