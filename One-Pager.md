# Portfolio Watch Skill — One-Pager / 一页纸思路

*Bilingual. English first, 中文在后.*

---

# EN

## The bet in one line

A good Portfolio Watch Skill doesn't ship "data + charts" — it ships a layer of
**judgment**: for a portfolio it has *never seen*, pull the real signal out of
market noise, and only interrupt the user when it's worth it. Every design
decision follows from that one sentence.

## How I framed the problem

The brief poses four questions — which dimensions, what's a real move, what's
noise, how to rank. But the **reusability** constraint (it must work on an unseen
portfolio) locks in the first principle:

> **Every threshold must be relative.** NVDA down 3% is a normal day; Coca-Cola
> down 3% is news. At setup the Skill auto-builds a per-holding profile
> (volatility, β, average volume, liquidity); every anomaly is judged against
> *that stock's own baseline*. This is the entire reusability engine — get it
> right and the rest follows.

![Relative rulers](assets/fig1-relative-rulers.png)

## Four questions, four non-obvious product calls

- **Which dimensions** — organized by *why an investor cares*, not by data
  source. Four layers: price action / events & filings / information & narrative
  / **portfolio**. The portfolio layer (drawdown, concentration drift,
  correlation convergence) sits on the first screen, because what the user
  actually cares about is "what happened to my money."

- **What's a real move** — a three-check gate (statistically significant →
  idiosyncratic → confirmed). The key correctness fix from my rigor pass: the
  denominator for "is this single-name news" is **not** total volatility but
  **residual volatility σ_ε** (variance decomposition σ²=β²σ_m²+σ_ε²) — strip out
  the market co-move first.

- **What's noise** — the sharpest product move is the **beta roll-up**: on a broad
  down day, don't fire 10 per-stock alerts; fuse them into one portfolio line
  ("market −2.8%; your β-weighted book expected −3.1%, actual −3.0%, no
  single-name anomaly"). Ten noise alerts become one informative signal. At the
  batch level, **Benjamini–Hochberg FDR** controls the false-positive rate.

- **How to rank** — by **impact on the user's money** (move × weight), not by how
  loud the news is. Core intuition: *a 5σ move in a 1% position can matter less
  than a 2.5σ move in a 40% position.* Three tiers P0/P1/P2 + **quiet-by-default
  + a daily P0 budget ≤ 4**. The product judgment behind it: **rather miss one
  medium signal than have the user mute notifications — alert trust is this
  product's core asset.**

## From "reasonable" to "rigorous"

Right rules aren't enough; I made them derivable and reproducible: an
**adaptive baseline** of EWMA(λ=0.94) + a robust MAD floor (so the very move
being detected can't inflate the baseline and mask itself); because σ is an
*estimate*, the threshold is a **t-quantile, not a fixed 2.0** — which derives
"less data ⇒ higher evidence bar" mathematically; a **hysteresis ratchet** stops
threshold-flapping. (Full derivations in `Strategy-Analysis.md`.)

## Two engineering blind spots I closed on my own

- **Cold start** — a freshly-IPO'd stock or a token just bridged from another
  chain has < 20 days of history. Three steps: seed from the **sector
  benchmark's median risk metrics** as a prior; **bootstrap** daily σ from
  intraday realized variance in days, not weeks (one day of 5-min bars ≈ dozens
  of daily observations); then a **linear shrinkage** w(n)=clip(n/20,0,1) ramps
  prior → own baseline within a week. During cold start the threshold auto-widens
  (t-quantile), confidence is capped, and the UI labels "converging, day n/5."

- **IM-side noise control** — an incident unfolds over time (NVDA sells off →
  unusual short volume → guidance-cut headline): three correct signals, three
  phone buzzes. The fix is **Narrative Fusing + Silent Update** — by causal
  precedence the earnings event takes the headline while earlier price/volume
  moves become its evidence trail; the first alert buzzes once, and within a
  10-min window related changes *edit the same card* (Telegram `editMessageText`
  is inherently silent). Buzzes scale with the number of **distinct incidents**
  (1 + escalations), not the number of facts.

![Narrative Fusing + Silent Update](assets/fig3-fusion-silent-update.png)

## I built it to prove it's real

![Residual-vol fix reclassifies AAPL P1 to P0](assets/fig2-residual-vol-fix.png)

Not just docs — I actually built a live Playbook on Alva (NVDA/TSLA/AAPL), with
interface and alerts both running:
- **The rigor changed the conclusion, correctly**: switching to the residual-vol
  denominator lifted AAPL's idiosyncratic z on 2026-06-25 from −2.6σ (old,
  understated) to **−4.1σ**, and the tier from P1 to **P0**.
- **Alert verified end-to-end**: web push, status = sent, with a deep link that
  lands on the matching interface card.
- **Fusion engine verified on the runtime**: an NVDA 3-event timeline collapses
  to one evolving card, buzzes 3 → 2.

## Honest limits & next steps

The demo runs at daily cadence (intraday/pre-market tightening lives in the Skill
spec); options/short-interest confirmers and per-sector fundamental templates are
Skill capabilities the 3-stock demo doesn't fully exercise; Telegram silent-update
needs a bot token (the demo uses web push). All threshold parameters are
**evidence-based starting points** and should be calibrated on historical replay
(precision-recall). Sensitivity has three presets the user switches in plain
language ("too noisy" → step down).

*Deliverables: `portfolio-watch/SKILL.md` (single-file skill) · Playbook share
link · `Strategy-Analysis.md` (math appendix) · `alert-fusion.js` (fusion-engine
reference implementation).*

---

# 中文

## 一句话赌注

一个好的 Portfolio Watch Skill，交付的不是"数据 + 图表"，而是一层**判断力**：对一个**从没见过的持仓**，把真信号从市场噪音里择出来，并且只在值得的时候打扰用户。所有设计都从这一句推导。

## 我怎么拆这道题

题目给了四个问题——盯哪些维度、什么算异动、什么是噪音、多信号怎么排序。但"可复用"这个约束（要对没见过的持仓生效）反过来锁死了第一性原理：

> **所有阈值必须是相对的。** NVDA 跌 3% 是日常，可口可乐跌 3% 是新闻。Skill 在 Setup 阶段为每只持仓自动建"个股画像"（波动率、β、均量、流动性），一切异动都以**该股票自己的统计基线**为尺子。这是整个可复用性的引擎——它对了，其余自然成立。

![相对尺子](assets/fig1-relative-rulers.png)

## 四个问题，四个非显然的产品判断

- **盯哪些维度**：按"投资者为什么关心"组织，而非按数据源。四层——价格行为 / 事件与披露 / 信息与叙事 / **组合层**。组合层（回撤、集中度漂移、相关性收敛）放界面首屏，因为用户真正关心的是"我的钱怎么了"。

- **什么算异动**：三重检验（统计显著 → 特质独立 → 确认归因）。这里有个我在严谨化时修正的关键错误——判断"个股新闻"的分母不该是总波动率，而是**残差波动率 σ_ε**（方差分解 σ²=β²σ_m²+σ_ε²），先把市场共振剥掉。

- **什么是噪音**：最关键的产品动作是 **β 上卷**——大盘普跌时不发 10 条个股警报，而是合并成一条组合级消息（"市场跌 2.8%，你的组合按 β 预期跌 3.1%、实际 3.0%，无个股异常"）。把 10 条噪音变成 1 条有信息量的信号。批量层面再用 **Benjamini-Hochberg FDR** 控制假阳性比例。

- **怎么排序**：按**对用户钱包的影响**排（移动 × 权重），不按新闻的响度。核心直觉——*1% 仓位的 5σ 异动，可能不如 40% 仓位的 2.5σ 异动重要*。三档 P0/P1/P2 + **静默默认 + 每日 P0 预算 ≤4 条**。背后一句产品判断：**宁可漏一条中等信号，也不能让用户把通知调成静音——alert 的信任是这个产品的核心资产。**

## 从"合理"推到"严谨"

规则对了还不够，我把它们做成可推导、可复现的数学：EWMA(λ=0.94) + 稳健 MAD 的**自适应基线**（防止要检测的异动本身污染基线）；因为 σ 是估计量，门槛取 **t 分位而非固定 2.0**——这恰好把"数据越少、证据要求越高"数学地推出来；**迟滞棘轮**防止阈值抖动反复告警。（全部推导见 `Strategy-Analysis.md`。）

## 两个我主动补的工程盲区

- **冷启动（Cold Start）**：刚 IPO 的股票 / 跨链新代币，历史不足 20 天怎么办？三步——挂靠**所属行业 benchmark 的中位数风险指标**做先验；用日内**已实现波动率**（realized variance）在数天内 bootstrap（一天 78 根 5min bar ≈ 数十个日频观测）；再用**线性收缩** w(n)=clip(n/20,0,1) 在一周内平滑修正到自有基线。冷启动期门槛自动变宽、置信度封顶，界面标注"converging day n/5"。

- **IM 投递侧降噪**：一个事件在时间轴上展开（NVDA 大跌 → 大单做空 → 财报利空），三条正确信号炸用户三次震动。解法是 **主权合并 + 静默覆盖**——按因果优先级让财报事件夺取头条、前面降为证据链；首条推送震一次，10 分钟窗口内的关联变化用 `editMessageText`（Telegram 编辑天然不响铃）改同一张卡。手机震动次数 = **不同事件数**（1+升级次数），而非**事实条数**。

![主权合并 + 静默覆盖](assets/fig3-fusion-silent-update.png)

## 我做出来证明它是真的

![残差波动率修正：AAPL P1→P0](assets/fig2-residual-vol-fix.png)

不止是文档。我在 Alva 上真 build 了一个 live Playbook（NVDA/TSLA/AAPL），界面和告警都在跑：
- **严谨化改变了结论且更正确**：换用残差波动率分母后，AAPL 6/25 那天的 idiosyncratic z 从 -2.6σ（旧版低估）跳到 **-4.1σ**，定级从 P1 升为 **P0**。
- **告警端到端投递验证**：web 推送 status=sent，含 deep link，点开落到界面对应卡片。
- **融合引擎逻辑已在 runtime 验证**：NVDA 三事件时间线 → 一张演进卡片、震动 3→2。

## 诚实的边界与下一步

演示为 daily cadence（盘中/盘前收紧在 skill spec 里）；期权/做空确认器、分行业基本面模板是 skill 能力但 3 股 demo 未全用；Telegram 静默覆盖需接 bot token（当前纯网页推送）。所有阈值参数是**有依据的起点**，需在真实 Playbook 上用历史回放做 precision-recall 校准。灵敏度三档支持用户用自然语言切换（"太吵了"→降档）。

---
*交付物：`portfolio-watch/SKILL.md`（单文件 skill）· Playbook 分享链接 · `Strategy-Analysis.md`（数学底稿）· `alert-fusion.js`（融合引擎参考实现）*
