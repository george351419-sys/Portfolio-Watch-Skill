# Portfolio Watch — 策略的数学分析与优化

> 本文档为 `portfolio-watch/SKILL.md` 的严谨化底稿：把"盯什么、什么算异动、什么是噪音、怎么排序"从启发式规则升级为可推导、可复现的数学模型，并补齐**冷启动（Cold Start）**与**延迟处理**两个工程盲区。
> 记号：$r_{i,t}$ 为标的 $i$ 在 $t$ 日的对数收益 $\ln(P_t/P_{t-1})$；$r_{m,t}$ 为基准（市场/行业）收益；$w_i$ 为持仓权重。

---

## 1. 自适应基线（Adaptive Baselines）

### 1.1 为什么不能用固定百分比，也不能用简单滚动 stdev

固定百分比忽略了个股波动率差异（NVDA 与 KO 的 3% 意义不同）。而简单等权滚动标准差有两个缺陷：(a) 对波动率的时变（volatility clustering）反应迟钝；(b) **要检测的异动本身会进入窗口、抬高 $\hat\sigma$，从而把自己掩盖掉**（masking）。故采用"指数加权 + 稳健"的双重基线。

### 1.2 EWMA 波动率（RiskMetrics）

$$
\hat\sigma^2_{i,t} = \lambda\,\hat\sigma^2_{i,t-1} + (1-\lambda)\,r_{i,t-1}^2,\qquad \lambda = 0.94
$$

$\lambda=0.94$ 是 RiskMetrics 日频标准值，等效记忆半衰期 $\tau_{1/2}=\ln 2/\ln(1/\lambda)\approx 11.2$ 个交易日。EWMA 让基线对最近的波动率变化更敏感，避免"用三个月前的平静期尺子量今天"。

### 1.3 稳健基线：中位数 / MAD

为抵抗离群点对基线的污染，并行维护一套稳健估计：

$$
\text{med}_i = \operatorname{median}(r_{i,t-1},\dots,r_{i,t-n}),\qquad
\text{MAD}_i = \operatorname{median}\big(|r_{i,s}-\text{med}_i|\big)
$$

$$
\hat\sigma^{\text{rob}}_i = 1.4826 \cdot \text{MAD}_i
$$

常数 $1.4826 = 1/\Phi^{-1}(0.75)$ 使 MAD 成为正态分布下 $\sigma$ 的**一致估计**。异动判定的分母取二者稳健组合 $\hat\sigma_i = \max(\hat\sigma^{\text{EWMA}}_i,\ \hat\sigma^{\text{rob}}_i)$，既跟随波动率上升、又不被单个尖峰灌水。窗口内计算 EWMA 前对历史收益做 winsorize（截尾在 $\pm 3\,\hat\sigma^{\text{rob}}$）以隔离污染。

### 1.4 系统性/特质分解（关键修正）

**旧版用总波动率当 z 分数分母是不严谨的**——市场共振也会放大总波动率。正确做法是先做单因子回归剥离市场：

$$
r_{i,t} = \alpha_i + \beta_i\, r_{m,t} + \varepsilon_{i,t},\qquad
\hat\beta_i = \frac{\widehat{\operatorname{Cov}}(r_i,r_m)}{\widehat{\operatorname{Var}}(r_m)}
$$

方差分解：$\ \sigma_i^2 = \beta_i^2\sigma_m^2 + \sigma_\varepsilon^2$。**特质波动率**

$$
\sigma_{\varepsilon,i} = \sqrt{\max\big(\sigma_i^2 - \beta_i^2\sigma_m^2,\ 0\big)}
$$

才是判断"个股新闻"的正确尺子。当日残差 $\hat\varepsilon_{i,t}=r_{i,t}-\hat\beta_i r_{m,t}$。

### 1.5 两个 z 分数

$$
z^{\text{tot}}_{i,t} = \frac{r_{i,t}}{\hat\sigma_i}\quad(\text{进界面/展示}),\qquad
\boxed{\,z^{\text{idio}}_{i,t} = \frac{\hat\varepsilon_{i,t}}{\hat\sigma_{\varepsilon,i}}\,}\quad(\text{是否个股异动})
$$

只有 $z^{\text{idio}}$ 越过门槛才算"真异动"；$z^{\text{tot}}$ 大而 $z^{\text{idio}}$ 小 = 市场驱动 → 上卷（见 §3）。

### 1.6 成交量与跳空的同构处理

RVOL 用对数成交量的 EWMA 基线（成交量右偏，取 $\ln V$ 更接近正态），并按时段（time-of-day）归一化：

$$
\text{RVOL}_{i,t} = \frac{V_{i,t}}{\bar V_i(\text{同时段})},\qquad
z^{\text{vol}}_{i,t} = \frac{\ln V_{i,t} - \mu_{\ln V,i}}{\sigma_{\ln V,i}}
$$

跳空 $g_{i,t}=(O_{i,t}-C_{i,t-1})/C_{i,t-1}$，$z^{\text{gap}}=g/\hat\sigma_i$。

---

## 2. 估计误差 → t 阈值（把不确定性写进门槛）

$\hat\sigma_i$ 是**估计量**，样本量 $n$ 有限时，标准化收益 $z=r/\hat\sigma$ 不服从正态，而近似服从自由度 $\nu=n-1$ 的 **Student-t**。因此显著性门槛应取 t 分位而非固定 2.0：

$$
k(\nu,\alpha) = t_{\nu,\,1-\alpha/2}
$$

- 大样本（$n\ge 60$）：$t\to z$，$k\approx 2.0/2.5/3.5$ 与旧版一致。
- 小样本（冷启动，$n=20$）：$t_{19,0.975}=2.09$，$t_{19,0.995}=2.86$ —— 门槛**自动变宽**，这就是"数据越少、证据要求越高"的严格来源，无需拍脑袋加 buffer。

等价地，可对 $\hat\sigma$ 的标准误 $\operatorname{SE}(\hat\sigma)\approx \hat\sigma/\sqrt{2n}$ 做门槛膨胀：$k_{\text{eff}} = k\sqrt{1+\tfrac{1}{2n}}$。

---

## 3. 噪音过滤（Noise Filtering）

### 3.1 市场解释度（连续判据，替代硬开关）

单次移动被市场解释的比例：

$$
\phi_{i,t} = \frac{\hat\beta_i\, r_{m,t}}{r_{i,t}}\in(-\infty,\infty),\qquad
\text{market-driven} \iff |z^{\text{idio}}_{i,t}| < 2 \ \wedge\ \phi_{i,t} > 0.5
$$

即"个股残差不显著"且"市场解释了过半"。这类移动不单独告警，聚合为一条组合级 β 上卷：

$$
r^{\text{port}}_t=\sum_i w_i r_{i,t},\quad
r^{\text{exp}}_t=\Big(\sum_i w_i\hat\beta_i\Big) r_{m,t},\quad
\text{surprise}=r^{\text{port}}_t-r^{\text{exp}}_t
$$

仅当 $|\text{surprise}|$ 超过组合特质波动带才升级为组合级信号。

### 3.2 多重检验校正（FDR / Benjamini–Hochberg）

同时监控 $N$ 只标的 $\times$ $M$ 个维度 $=$ $K$ 次假设检验。若各自用 $\alpha=0.05$，期望假阳性 $=0.05K$——盯 10 只 × 6 维 = 60 次，平均每天冒出 3 条假信号，正是告警疲劳之源。

把每个 $z^{\text{idio}}$ 转为双尾 p 值 $p_k = 2\big(1-\Phi(|z_k|)\big)$，升序排列 $p_{(1)}\le\dots\le p_{(K)}$，取满足

$$
p_{(j)} \le \frac{j}{K}\,q
$$

的最大 $j$（$q$ 为目标假发现率，如 $q=0.10$），只保留前 $j$ 个为"真异动候选"。这把"控制单次错误率"升级为"控制**一批告警里假货的比例**"，与产品目标（推送信任）直接对齐。

### 3.3 迟滞/棘轮（Hysteresis / Schmitt trigger）

防止 z 在门槛附近抖动造成反复告警。设进入/退出双门槛 $z_{\text{on}}>z_{\text{off}}$：

$$
S_{i,t}=\begin{cases}1 & |z_{i,t}|\ge z_{\text{on}}\ (=2.5)\\[2pt] 0 & |z_{i,t}|\le z_{\text{off}}\ (=1.5)\\[2pt] S_{i,t-1} & \text{otherwise}\end{cases}
$$

只有 $S$ 由 0→1 或严重度跨越更高档位时才推送（棘轮：只升级不重复）。冷却期用指数抑制权重 $u=1-e^{-\Delta t/T_{\text{cool}}}$，$T_{\text{cool}}=4\text{h}$。

### 3.4 其余显式噪音（乘性惩罚）

低流动性假动作（$\text{RVOL}$ 无确认、盘前薄量）、机械性公司行为（拆股/分红/ETF rebalance/期权 pinning）、单条分析师微调、已报行情延续——各自贡献 $\text{noise\_penalty}\in[0,5]$，进入 §4 评分。

---

## 4. 信号排序：0–100 评分公式

### 4.1 分量（各自有界映射到 $[0,1]$）

| 分量 | 定义 | 严格映射 |
|---|---|---|
| 严重度 $S$ | 特质显著性 | $S=1-e^{-\lvert z^{\text{idio}}\rvert/\tau_s},\ \tau_s=1.5$（饱和，避免极端值线性爆表） |
| 组合影响 $I$ | 对钱包的冲击 | $I=\min\!\big(\lvert r_i\rvert\, w_i / \kappa,\ 1\big),\ \kappa=0.01$（1% 加权贡献即满分） |
| 置信度 $C$ | 数据/确认质量 | $C=c_{\text{data}}\cdot\tfrac12\big(1+\min(\text{RVOL}/3,1)\big)$，冷启动 $c_{\text{data}}\le0.5$ |
| 新颖度 $\eta$ | 是否新信息 | 新事件 $1$；已知事件后续 $0.5$；已报延续 $e^{-\Delta t/T_\eta}\to0$ |
| 汇合度 $F$ | 独立确认数 | $F=1-\prod_{j}(1-f_j)$，$f_j$ 为各独立证据强度（价/量/新闻/板块相对） |
| 噪音 $P$ | 噪音解释强度 | $P=\text{noise\_penalty}/5\in[0,1]$ |

### 4.2 合成分数与"影响闸门"

加权线性合成（各权重之和为 100），再减噪音：

$$
\text{score} = \Big\lfloor 100\cdot\operatorname{clip}_{[0,1]}\big(0.30 S + 0.25 I + 0.15 C + 0.10\,\eta + 0.20 F - 0.40 P\big)\Big\rfloor
$$

**影响闸门（乘性覆盖）**：纯加法会让"微仓位上的大新闻"越级。加一条硬约束——非 hard-event 情况下，若 $w_i<w_{\min}$（如 2%）则 $\text{score}\leftarrow\min(\text{score}, 59)$（封顶在 P2）。数学上等价于对小仓位信号乘一个 $I$ 相关的门控因子。这样既保留加法的细腻度，又堵住"响新闻越级"。

**概率解释**：score 单调于"现在通知用户的期望效用" $\mathbb{E}[U]\propto P(\text{material}\mid\text{evidence})\times \text{impact}$，其中 $P(\text{material}\mid\cdot)$ 由 $S,C,F$ 经 logistic 近似给出，impact 即 $I$。评分不是拍的权重，而是期望效用的可操作代理。

### 4.3 档位与推送预算（背包最优）

档位：$\text{P0}\ge 80$ 或 hard-event；$\text{P1}\in[60,79]$；$\text{P2}\in[40,59]$；$\text{P3}<40$。

每日推送预算 $B$（默认 P0 $\le 4$）是一个 0/1 背包：在 $\sum x_k \le B$ 下最大化 $\sum x_k\cdot\text{score}_k$。单位成本下**按分数贪心即为最优解**，落选者降级进 digest。这给了"宁可漏一条中等信号，也不轰炸用户"一个最优性保证。

---

## 5. 冷启动（Cold Start）：历史不足 20 天怎么办

新上市股票（刚 IPO）或跨链新代币，$n_{\text{obs}} < n_{\min}=20$，直接算 $\hat\sigma$ 会极不稳定（$\operatorname{SE}(\hat\sigma)/\sigma\approx 1/\sqrt{2n}$，$n=5$ 时相对误差 ~32%）。方案三步走：

### 5.1 先验：挂靠行业 Benchmark 的中位数风险指标

在自有历史足够前，用所属行业/板块 benchmark 的**横截面中位数**作为先验：

$$
\hat\sigma_i^{(0)} = m_{\text{sector}}\cdot \operatorname{median}_{j\in\text{sector}}\big(\hat\sigma_{\varepsilon,j}\big)
\quad\text{或}\quad
\hat\sigma_i^{(0)} = m\cdot \sigma_{\text{bench}}
$$

其中 $m$ 是"单名相对基准的离散度乘子"（经验上个股特质波动约为板块 ETF 波动的 $1.5\text{–}2.5\times$，取板块历史中位数标定）。$\hat\beta_i^{(0)}$ 取板块中位 β（IPO 常先用 1.0–板块中位）。跨链代币：优先挂靠**原链/其他交易所的已有历史**或同类资产篮子（如 L1 代币）中位数，再退化到板块先验。

### 5.2 高频窗口 bootstrap：用日内已实现波动率快速收敛

不必枯等 20 个日频 bar。用日内 $M$ 根高频 bar 的**已实现方差**（realized variance）在**数天内**估出日波动率：

$$
\text{RV}_d = \sum_{j=1}^{M} r_{d,j}^2,\qquad \hat\sigma^{\text{HF}}_{d} = \sqrt{\text{RV}_d}
$$

估计量方差 $\operatorname{Var}(\text{RV})\approx \tfrac{2}{M}\sigma^4$：一天 5 分钟 bar（RTH $M\approx 78$）的信息量 $\approx$ 数十个日频观测，故**一周内**即可把 $\hat\sigma$ 的相对误差从 ~32% 压到 ~10% 量级。对跳空/隔夜段单独用隔夜收益方差补偿（RV 默认只覆盖日内）。

### 5.3 线性收缩修正：先验 → 样本的一周斜坡

随观测累积，用收缩权重把先验与样本估计线性混合（Bayesian shrinkage / James–Stein 精神）：

$$
\boxed{\ \hat\sigma_i(n) = w(n)\,\hat\sigma^{\text{sample+HF}}_i + \big(1-w(n)\big)\,\hat\sigma_i^{(0)}\ },\qquad
w(n)=\operatorname{clip}\!\Big(\frac{n}{n_{\min}},0,1\Big)
$$

$n$ 按**高频折算的等效日数**计（一天日内数据 $\approx$ 若干等效日），故 $w$ 通常在 5 个交易日内爬到 1，实现"一周内线性修正"。$n\ge n_{\min}$ 后完全切换到自有基线，先验退出。

### 5.4 冷启动期的三条护栏

1. **门槛用 t 分位**（§2）：$n$ 小 → $k$ 自动变宽。
2. **置信度封顶** $C\le 0.5$：冷启动信号不能仅凭统计进 P0；hard-event（IPO 锁定解禁、招股书风险、代币合约漏洞/解锁）仍可越级。
3. **界面显式标注** "baseline: sector prior, converging (day $n$/5)"，把不确定性交给用户，不伪装成成熟信号。

---

## 6. 延迟与数据时效（Latency Handling）

### 6.1 时效感知的置信度衰减

每个指标带 as-of 时间戳，滞后 $\Delta t$ 超阈值时对置信度指数衰减：

$$
c_{\text{data}} \leftarrow c_{\text{data}}\cdot e^{-\Delta t/T_{\text{stale}}}
$$

$T_{\text{stale}}$ 按数据类型分档（实时价 分钟级、财报/披露 小时级、做空数据 日级，且标注 reporting lag）。滞后过大只降权、不伪造。

### 6.2 事件时间语义与迟到重算（stream-processing 范式）

按**事件时间**（bar 的 $t_{\text{close}}$）而非处理时间对齐；设水位线 watermark 与允许迟到窗口 $L$。迟到 bar 到达时**幂等重算**该时刻信号，借棘轮（§3.3）避免重复推送——只有当重算把严重度推到更高档才补发。这处理了盘前薄数据、数据源回补、跨时区结算等真实滞后。

### 6.3 盘前/低流动性时段

盘外时段展宽门槛并强制成交量确认：$k_{\text{ETH}} = k\cdot\gamma$（$\gamma>1$），$\text{RVOL}$ 未确认不即时推，等 RTH 开盘确认（对应噪音规则"低流动性假动作"）。

---

## 7. 告警投递侧：主权合并与静默覆盖（Narrative Fusing / Silent Update）

前面的降噪都在**检测侧**（β 上卷、FDR、迟滞）与**发送前**（同标的信号合并）。但真实事件在**时间轴上展开**：$t{=}0$ NVDA $-5\sigma$ → $t{+}2\text{min}$ 大单做空确认 → $t{+}4\text{min}$ 财报指引利空。三条**各自正确**的信号，若各发一条，就是"5 分钟三次震动"——碎片化正来自 IM 投递层。解法必须落在投递侧。

### 7.1 事件容器（Episode）

以（标的或相关簇）为键的合并容器 $E$，由首条信号开启，持有：

$$
E = \{\ \text{msg\_ref},\ t_{\text{open}},\ W,\ t_{\text{seal}}{=}t_{\text{open}}{+}W,\ \text{tier},\ \text{tier}_{\text{notified}},\ \text{evidence}[\,]\ \}
$$

$\text{msg\_ref}$ 为可编辑投递句柄（Telegram `chat_id`+`message_id`，或 webhook 消息 id）；合并窗 $W$ 默认 10min，硬上限 $W_{\max}=30$min。

### 7.2 合并规则（Coalescing）

同键新信号 $s$ 若 $t(s)<t_{\text{seal}}$ 则并入 $E$（追加证据、可小幅顺延 $t_{\text{seal}}$，不超 $W_{\max}$）；否则开新 $E$。相关簇的界定复用 §3.1 的市场/板块分解——同因（同板块驱动）的多标的移动并入同一 $E$。

### 7.3 主权合并：叙事融合 $f(E)\to \text{body}$

把证据链重组为**一条**连贯卡片，核心是**因果优先级**（sovereign merge）：

$$
\text{headline} = \arg\max_{a\in E}\ \big(\text{causal\_rank}(a),\ \text{severity}(a)\big)
$$

因果事件（财报/并购/指引/监管）的 $\text{causal\_rank}$ 高于价格/量能原子——**即使它最后到达，也夺取头条**；先到的"大跌""大单做空"降级为它的证据链（"$-5.2\sigma$ selloff 14:02 → short vol 3× 14:04 → **guidance cut** 14:06"）。融合后：一个 headline + 时间序证据 + 合并的 why/impact + **唯一** deep link。优先级 $\text{tier}(E)=\max_a \text{tier}(a)$，汇合度 $F$ 随独立原子增加而升，故 score 可**随证据累积棘轮上行**。

### 7.4 静默覆盖：投递决策

Telegram `editMessageText` **天然不触发通知**——编辑即静默。故：

- **首条**（开启 $E$）：`sendMessage()` → 真实推送**震一次**，存 $\text{msg\_ref}$。
- **窗口内更新**：`editMessageText(msg\_ref, f(E))` 改同一条 → 手机一张卡、**不再震**。
- **升级例外**：

$$
\text{notify（再震一次）} \iff \text{tier}(E) > \text{tier}_{\text{notified}}\ \ (\text{或新增 hard event})
$$

档位跃升（P1→P0）或 hard event 才允许一次新 `sendMessage`（可删旧卡或线程续接），随后继续静默编辑。这条规则防止静默覆盖把**恶化**的事件藏起来。$E$ 于 $t_{\text{seal}}$（或档位跌破 $z_{\text{off}}$）封存，下一条信号开新卡。

### 7.5 震动预算的代数

一个事件在其生命周期发 $k$ 条关联原子、含 $e$ 次档位跃升：

$$
\text{震动}_{\text{naive}} = k,\qquad \boxed{\text{震动}_{\text{fused}} = 1 + e}\ \ (e\text{ 通常 }0\text{–}1)
$$

参考反面案例 $k{=}3,e{=}0$：$3\to 1$。全局 P0 震动预算仍 $\le 4/$天（§4.3 背包）。**手机震动次数从"事实条数"降到"不同事件数"。**

### 7.6 投递适配器与降级

- Web/基线走平台 `notify/message`（`feed_alert_ready`）。
- 单卡可编辑 UX 走 **Telegram Bot API 直连**（BYOD）：`sendMessage`→拿 `message_id`；`editMessageText` 做静默更新。Bot token 存 Secret Manager，绝不入代码/对话。
- **优雅降级**：只有平台推送、无 bot token 时，退化为"每事件一卡"的合并（按 episode 去重、窗口内不重发），仍消除碎片，只是失去"编辑同一条"的丝滑。

---

## 8. 一页速查（落地默认值）

| 环节 | 公式/规则 | 默认参数 |
|---|---|---|
| 波动率基线 | EWMA + $1.4826\,\text{MAD}$ 取大 | $\lambda=0.94$ |
| 异动尺子 | $z^{\text{idio}}=\hat\varepsilon/\hat\sigma_\varepsilon$ | — |
| 显著门槛 | t 分位 $t_{\nu,1-\alpha/2}$ | 界面 2.0 / 推送 2.5 / 强推 3.5（大样本） |
| 市场噪音 | $\lvert z^{\text{idio}}\rvert<2 \wedge \phi>0.5$ → 上卷 | — |
| 批量假阳性 | Benjamini–Hochberg | $q=0.10$ |
| 抖动 | 双门槛迟滞 + 指数冷却 | $z_{\text{on}}2.5/z_{\text{off}}1.5$，$T_{\text{cool}}4\text{h}$ |
| 评分 | $0.30S{+}0.25I{+}0.15C{+}0.10\eta{+}0.20F{-}0.40P$ | 影响闸门 $w_{\min}=2\%$ |
| 推送预算 | 分数贪心背包 | P0 $\le4/$天 |
| 冷启动先验 | 板块中位 $\hat\sigma_\varepsilon$ × 乘子 | $n_{\min}=20$ |
| 冷启动 bootstrap | 已实现方差 $\sqrt{\sum r_{d,j}^2}$ | 5min bar |
| 冷启动收缩 | $w(n)=\operatorname{clip}(n/n_{\min},0,1)$ | 一周斜坡 |
| 时效 | 置信度 $e^{-\Delta t/T_{\text{stale}}}$ + 事件时间重算 | 分/时/日分档 |

> 所有参数是有依据的起点，非定论；应在真实 Playbook 上用历史回放校准（信号命中率 vs 误报率的 ROC / precision-recall），并按用户"太吵/太静"反馈在灵敏度三档间移动门槛。
