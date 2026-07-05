# Portfolio Watch Skill

A **Portfolio Watch Skill** for Alva: load it, hand it any portfolio, and get a
Playbook with a live interface and quiet, ranked alerts — it decides which
dimensions to watch, what's a real move vs noise, and how to rank signals, so it
works on a portfolio it has never seen.

---

## ✨ Highlight — watch the *thesis*, not just the market

Most trackers tell you *"MSTR dropped 16%."* This one asks the more important
question: **"is the reason you bought it still true?"**

Tell the Skill *why* you hold something — *"I hold MSTR as a leveraged BTC
play"* — and it watches whether that reason still holds. On **2024-11-21**,
Bitcoin rose **+4.3%** so MSTR *should* have risen ~+6% — instead it **crashed
−16%**, a gap **4.8× bigger than normal**. The buy-thesis broke, so it fires a
**top-priority (P0) alert that names the broken logic, not just the price** — and
tapping it deep-links to this exact card.

![Thesis break — live on the Alva Playbook](assets/thesis-break-demo.png)

*Live Playbook · real MSTR/BTC data · web-push alert delivered. The clever part:
this reuses the same "ruler" the system already uses to spot unusual single-stock
moves — just pointed at Bitcoin instead of the market. Same thermometer, different
spot, completely different meaning. (Plain-language write-up in the
[One-Pager](One-Pager.md).)*

**How it scales:** you state the thesis or confirm a *proposed* one in one tap
(never interrogated per holding), and add more anytime. Most theses reduce to a
few reusable invariant shapes (relationship / ranking / correlation / level), so
new ones are added by parameters, not code — and a genuinely novel thesis is
compiled by the in-loop LLM into a monitorable proxy, honestly bounded by the data
that exists. See [`portfolio-watch/SKILL.md`](portfolio-watch/SKILL.md) §Thesis-Linked.

> **中文一句话**：一个可复用的 Portfolio Watch Skill——加载后对任意持仓生成"界面 + 智能告警"的 Playbook。亮点是**盯的不只是"市场发生了什么"，而是"你当初买入的理由还成立吗"**：把 MSTR 当"比特币放大版"持有，当比特币大涨而 MSTR 反而暴跌，说明买入逻辑破裂，直接越级 P0 告警。已在 Alva 上真 build、真推送、并用 5 年历史回测验证。

---

## The three required deliverables

| # | Deliverable | Where |
|---|---|---|
| 1 | **The Skill** (SKILL.md, single file) | [`portfolio-watch/SKILL.md`](portfolio-watch/SKILL.md) |
| 2 | **A Playbook built from it** (interface + alerts live) | https://alva.ai/u/george351419/playbooks/portfolio-watch |
| 3 | **One-pager** on the thinking (bilingual + figures) | [`One-Pager.md`](One-Pager.md) |

## Suggested reading order (≈10 min)

1. **[`One-Pager.md`](One-Pager.md)** — the thinking in one page (EN + 中文, with figures). Start here.
2. **[`portfolio-watch/SKILL.md`](portfolio-watch/SKILL.md)** — the actual Skill: intake → per-holding baseline → 4-layer monitoring → three-check gate → noise filters → 0–100 ranking → interface → alerts → cold-start & latency.
3. **The live Playbook** (link above) — interface + a real delivered alert deep-linking back to the matching card.
4. **[`Strategy-Analysis.md`](Strategy-Analysis.md)** — the math底稿: adaptive baselines (EWMA/MAD), residual-vol z, t-thresholds, FDR, hysteresis, the scoring algebra, cold-start, alert fusion, and thesis-linked escalation (§7b).
5. **[`Backtest-Report.md`](Backtest-Report.md)** — historical replay & precision-recall calibration on 29 symbols (Mag7 + 20 untuned stocks + BTC/LTC), 37,837 days. Proves reusability and honestly bounds what "effective" means.

## Full file map

```
portfolio-watch/SKILL.md      Deliverable 1 — the Skill (single, pasteable file)
One-Pager.md                  Deliverable 3 — one-pager (bilingual, embeds assets/fig1-3)
Strategy-Analysis.md          Math appendix — rigorous derivations (§7 = alert fusion)
alert-fusion.js               Reference implementation of Narrative Fusing + Silent Update
                              (self-test verified on Alva runtime: 3-event incident → 1 card)
thesis-monitor.js             Thesis-linked monitoring — a broken buy-thesis escalates to P0
                              (verified on real MSTR/BTC data: 2024-11-21 −4.6σ leverage-thesis break)
Backtest-Report.md            Precision-recall report, 3 rounds, per-cohort reusability
backtest/                     Reproducibility: runtime script + raw result JSONs
  pw-backtest.js              Alva runtime backtest (seed 20260705)
  results-29symbols-400d.json / results-9symbols-400d.json
assets/                       Figures fig1–fig6 + thesis-break-demo.png (the hero shot)
notes/                        Working trail (not deliverables)
  Monitoring-Strategy.md      First strategy draft (from initial research)
  SKILL_codex.md              A peer's version — its domain depth was absorbed into SKILL.md
.agents/ , skills-lock.json   Alva's OFFICIAL skill, installed via `npx skills add` (tooling, not mine)
```

## What actually got built on Alva (deliverable 2)

- **Two feeds** — `pw-profile` (adaptive per-holding baseline: EWMA/MAD vol, OLS β, residual vol σ_ε; cold-start prior) → `pw-watch` (residual-vol z-scores, FDR, hysteresis, bounded 0–100 scoring, quiet-by-default `notify/message`).
- **Interface** — five live-read views (portfolio overview · ranked signals with `#sig-<id>` anchors · holdings grid with σ-bars · portfolio lens). Passes `alva lint`.
- **Alert** — web push delivered end-to-end (status = sent) with a deep link that lands on the matching card. Verified.
- **Demo pin** — the Playbook is pinned to the 2026-06-25 session (a real day AAPL fell −6.1%, a −4.1σ idiosyncratic P0) so the interface/alert show a populated, real state. To run live: redeploy `pw-watch` without the `asof` arg.

## Reproducing the backtest

```
alva run --local-file backtest/pw-backtest.js --timeout-ms 550000 --max-heap-size-mb 768
```
(Requires an authed Alva CLI — `@alva-ai/toolkit`. Seed is fixed; windows are listed in the report.)

## Honesty notes

- The Playbook demo is at **daily cadence**; intraday/pre-market tightening lives in the Skill spec. Options/short-interest confirmers and per-sector fundamental templates are Skill capabilities the 3-stock demo doesn't fully exercise.
- Telegram "Silent Update" (edit one card) needs a bot token (BYOD); the demo uses web push. The fusion **logic** is verified on the runtime; the editable-card **delivery** is documented and ready to wire.
- Backtest precision ≈ 0.33 at 2.5σ (lift ~1.3×) is a real but **modest** edge — forward continuation is a weak signal in efficient markets. The product's job is **noise suppression + attention routing**, not price prediction; the backtest quantifies exactly why the confirmation layers (volume/news) matter.
- All threshold parameters are **evidence-based starting points**, calibrated on historical replay and adjustable via the three sensitivity presets.
