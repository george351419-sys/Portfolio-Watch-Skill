import base64, os
def b64(p):
    with open(p,"rb") as f: return "data:image/png;base64,"+base64.b64encode(f.read()).decode()
IMG = {k: b64("assets/"+v) for k,v in {
  "thesis":"thesis-break-demo.png","event":"fig7-event-aligned.png",
  "rulers":"fig1-relative-rulers.png","iface":"interface-tabs-search.png",
  "fusion":"fig3-fusion-silent-update.png","pr":"fig4-precision-recall.png",
}.items()}

HTML = f"""<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Portfolio Watch Skill — 项目介绍</title>
<style>
 :root{{--navy:#111827;--ink:#1f2937;--grey:#6b7280;--line:#e5e7eb;--bg:#ffffff;--soft:#f9fafb;
   --blue:#2563eb;--purple:#6d28d9;--red:#dc2626;--green:#16a34a;--amber:#b45309;}}
 *{{box-sizing:border-box;}}
 html{{scroll-behavior:smooth;}}
 body{{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
   color:var(--ink);background:var(--bg);line-height:1.65;-webkit-font-smoothing:antialiased;}}
 .wrap{{max-width:960px;margin:0 auto;padding:0 24px;}}
 nav{{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.92);backdrop-filter:blur(8px);
   border-bottom:1px solid var(--line);}}
 nav .wrap{{display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:10px 24px;font-size:13px;}}
 nav a{{color:var(--grey);text-decoration:none;padding:4px 9px;border-radius:999px;}}
 nav a:hover{{background:var(--soft);color:var(--navy);}}
 nav .brand{{font-weight:700;color:var(--navy);margin-right:8px;}}
 header.hero{{padding:56px 0 30px;border-bottom:1px solid var(--line);}}
 .tag{{display:inline-block;font-size:12px;font-weight:600;color:var(--purple);background:#f3e8ff;
   padding:3px 11px;border-radius:999px;letter-spacing:.03em;}}
 h1{{font-size:40px;line-height:1.15;margin:14px 0 8px;color:var(--navy);letter-spacing:-.01em;}}
 .lede{{font-size:18px;color:var(--grey);max-width:720px;}}
 section{{padding:40px 0;border-bottom:1px solid var(--line);}}
 h2{{font-size:25px;color:var(--navy);margin:0 0 6px;letter-spacing:-.01em;}}
 h2 .n{{color:var(--purple);font-weight:700;margin-right:8px;}}
 .sub{{color:var(--grey);margin:0 0 20px;font-size:15px;}}
 h3{{font-size:16px;color:var(--navy);margin:22px 0 6px;}}
 p{{margin:10px 0;}}
 img{{max-width:100%;border:1px solid var(--line);border-radius:12px;display:block;margin:16px 0;}}
 .cap{{font-size:12.5px;color:var(--grey);margin:-6px 0 16px;}}
 .grid{{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));margin:16px 0;}}
 .card{{border:1px solid var(--line);border-radius:12px;padding:16px 18px;background:var(--soft);}}
 .card .big{{font-size:26px;font-weight:800;color:var(--navy);line-height:1.1;}}
 .card .lab{{font-size:13px;font-weight:600;color:var(--ink);margin-top:4px;}}
 .card .sub{{font-size:12px;color:var(--grey);margin:4px 0 0;}}
 .card.b{{border-left:4px solid var(--blue);}} .card.p{{border-left:4px solid var(--purple);}}
 .card.r{{border-left:4px solid var(--red);}} .card.g{{border-left:4px solid var(--green);}}
 table{{width:100%;border-collapse:collapse;margin:14px 0;font-size:14px;}}
 th,td{{text-align:left;padding:9px 11px;border-bottom:1px solid var(--line);vertical-align:top;}}
 th{{color:var(--grey);font-weight:600;font-size:12.5px;text-transform:uppercase;letter-spacing:.03em;}}
 tr:hover td{{background:var(--soft);}}
 .pill{{display:inline-block;font-size:11px;font-weight:600;padding:1px 8px;border-radius:999px;}}
 .pl-live{{background:#dcfce7;color:#166534;}} .pl-test{{background:#e0e7ff;color:#3730a3;}}
 .pl-spec{{background:#f3f4f6;color:#6b7280;}} .pl-warn{{background:#fef3c7;color:#92400e;}}
 blockquote{{margin:16px 0;padding:12px 18px;border-left:3px solid var(--purple);background:#faf5ff;
   border-radius:0 8px 8px 0;color:var(--ink);}}
 ul{{margin:10px 0;padding-left:22px;}} li{{margin:6px 0;}}
 .two{{display:grid;grid-template-columns:1fr 1fr;gap:24px;}}
 @media(max-width:760px){{.two{{grid-template-columns:1fr;}} h1{{font-size:32px;}}}}
 .timeline{{border-left:2px solid var(--line);margin:16px 0;padding-left:20px;}}
 .tl{{position:relative;margin-bottom:16px;}}
 .tl::before{{content:"";position:absolute;left:-27px;top:5px;width:11px;height:11px;border-radius:999px;
   background:var(--purple);border:2px solid #fff;}}
 .tl .rd{{font-weight:700;color:var(--navy);}}
 .tl .ds{{font-size:14px;color:var(--grey);}}
 footer{{padding:34px 0 60px;color:var(--grey);font-size:13px;}}
 a.lnk{{color:var(--purple);}}
 .kbd{{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;background:var(--soft);
   border:1px solid var(--line);border-radius:5px;padding:1px 6px;}}
 @media print{{nav{{position:static;}} section{{page-break-inside:avoid;}}}}
</style></head><body>

<nav><div class="wrap">
 <span class="brand">Portfolio Watch</span>
 <a href="#what">概览</a><a href="#idea">核心思想</a><a href="#thesis">Thesis</a>
 <a href="#how">架构</a><a href="#model">模型</a><a href="#metrics">指标解读</a><a href="#signals">信号源</a>
 <a href="#ui">界面</a><a href="#valid">验证</a><a href="#limits">边界</a>
 <a href="#trace">迭代</a><a href="#deliv">交付</a>
</div></nav>

<header class="hero"><div class="wrap">
 <span class="tag">Alva · PM Take-Home · thesis-aware monitor</span>
 <h1>Portfolio Watch Skill</h1>
 <p class="lede">一个可复用的 Alva Skill：加载后对<b>任意、从未见过的</b>持仓，自动生成一个
 “界面 + 智能告警” 的 Playbook —— 它自己决定盯哪些维度、什么算异动、什么是噪音、多个信号同时出现怎么排序。
 核心不是“报告市场发生了什么”，而是<b>把用户的注意力路由到真正重要的地方</b>。</p>
 <div class="grid">
  <div class="card p"><div class="big">1 句话</div><div class="lab">即可上手</div><div class="sub">“watch my NVDA, TSLA, AAPL” 或 “watch my portfolio”</div></div>
  <div class="card b"><div class="big">10</div><div class="lab">交叉验证信号源</div><div class="sub">价格 · 事件 · 预测市场 · 内部人 · 期权 · 链上 · 情绪 …</div></div>
  <div class="card r"><div class="big">4.73×</div><div class="lab">告警集中在真实催化剂</div><div class="sub">财报窗口 vs 随机日（事件级验证）</div></div>
  <div class="card g"><div class="big">Live</div><div class="lab">Alva 上真 build</div><div class="sub">界面 + 告警投递到 Discord/web，均已验证</div></div>
 </div>
</div></header>

<section id="what"><div class="wrap">
 <h2><span class="n">01</span>它是什么</h2>
 <p class="sub">作业要求：做一个能装进 Alva Agent 的 Skill，让任何用户对自己的组合生成高质量的 Portfolio Watch。</p>
 <p>三个交付物都已完成并真实落地：</p>
 <table>
  <tr><th>#</th><th>交付物</th><th>形态</th></tr>
  <tr><td>1</td><td><b>The Skill</b></td><td>单文件 <span class="kbd">SKILL.md</span> + 代码包 <span class="kbd">portfolio-watch-skill-v2.1.0.zip</span></td></tr>
  <tr><td>2</td><td><b>Live Playbook</b></td><td>Alva 上真实运行的界面 + 告警（含 Demo/Live 切换）</td></tr>
  <tr><td>3</td><td><b>One-Pager</b></td><td>中英双语思路说明 + 配图</td></tr>
 </table>
 <p>此外还配了完整的<b>验证与文档体系</b>：回测报告、消融实验、事件对齐评估、能力诚实矩阵、架构指南、变更轨迹。</p>
</div></section>

<section id="idea"><div class="wrap">
 <h2><span class="n">02</span>核心思想：每一个阈值都是相对的</h2>
 <p class="sub">这是“能用在任意组合上”的唯一引擎。</p>
 <blockquote>NVDA 跌 3% 是平常一天；可口可乐跌 3% 是新闻。<br/>
 所以没有任何写死的百分比阈值 —— 每一次异动都对照<b>该标的自己的统计基线</b>、以及<b>当天市场和它所属板块的表现</b>来判断。</blockquote>
 <img src="{IMG['rulers']}" alt="相对尺子"/>
 <div class="cap">图：同样的 −3%，对不同波动率的标的意义完全不同 —— 用“σ（标准差）”而不是原始百分比来量。</div>
 <div class="two">
  <div><h3>三条底层信念</h3><ul>
   <li><b>范式转变</b>：杀死“固定 5% 就告警”—— 那是伪装成监控的噪音。</li>
   <li><b>信噪比才是产品本身</b>：稀缺的是用户的<b>注意力</b>，要守护它。</li>
   <li><b>Alva 原生、低成本</b>：全部由平台原语拼装，无新基建。</li>
  </ul></div>
  <div><h3>四个问题，四个非显然判断</h3><ul>
   <li><b>盯哪些维度</b> → 按“投资者为何在意”分层，不按数据源。</li>
   <li><b>什么算异动</b> → 残差波动率 σ_ε（剥离市场 β），不是总波动。</li>
   <li><b>什么是噪音</b> → β 上卷、FDR、滞回；十条相关告警合成一条。</li>
   <li><b>怎么排序</b> → 按<b>对你钱的影响</b>（幅度 × 权重），不按新闻响度。</li>
  </ul></div>
 </div>
</div></section>

<section id="thesis"><div class="wrap">
 <h2><span class="n">03</span>标志性能力：盯的是“假设”，不只是市场</h2>
 <p class="sub">最大的差异化亮点。</p>
 <p>最高价值的问题不是“市场在干嘛”，而是<b>“我当初买它的理由还成立吗”</b>。用户说“我把 MSTR 当比特币的杠杆版拿”，
 Skill 就捕获这个 thesis 并监控它的<b>不变量</b>（MSTR 应放大跟随 BTC）。当 BTC 大涨而 MSTR 反而暴跌 ——
 这不是市场噪音，是<b>买入逻辑破裂</b>，直接<b>越级 P0</b>，因为它挑战的是用户的<b>决策</b>。</p>
 <img src="{IMG['thesis']}" alt="thesis 破裂 demo"/>
 <div class="cap">真实数据：2024-11-21，BTC +4.3% 本应带动 MSTR ~+6%，实际暴跌 −16.2%，对杠杆假设 −4.8σ 破裂 → P0，点开直达对应卡片。</div>
 <p>优雅之处：它<b>复用了同一套残差波动率引擎</b>，只是把参照物从大盘换成 thesis 指定的资产（BTC / SMH / QQQ / SPY 均可）。
 捕获也低摩擦：用户直接说、或对系统<b>自动建议的 thesis 一键确认</b>（界面里的 “Arm a thesis” 卡片）。</p>
</div></section>

<section id="how"><div class="wrap">
 <h2><span class="n">04</span>怎么做的（架构）</h2>
 <p class="sub">全部由 Alva 平台原语拼装，无新基建。</p>
 <table>
  <tr><th>层</th><th>做什么</th><th>用到的原语</th></tr>
  <tr><td>配置</td><td>用户自有的观测集 + 运行模式（可 Agent 聊天或界面 UDF 增删）</td><td><span class="kbd">holdings.json</span> · <span class="kbd">mode.json</span></td></tr>
  <tr><td>Profile feed</td><td>每只标的的自适应基线：EWMA/MAD 波动、OLS β、残差波动 σ_ε、冷启动先验</td><td>@alva/feed · 定时任务</td></tr>
  <tr><td>Watch feed</td><td>核心引擎：残差 z、FDR、滞回、0–100 评分、10 信号源、thesis 检查、组合上卷、日报</td><td>@alva/feed · Arrays 数据 API</td></tr>
  <tr><td>界面</td><td>live-read HTML，4 个 tab，深链、War-Room、阈值滑块、搜索加任意标的</td><td>AlvaClient · UDF</td></tr>
  <tr><td>告警</td><td>安静优先的推送，深链回对应卡片</td><td>notify → active_channel（Discord/web）</td></tr>
 </table>
</div></section>

<section id="model"><div class="wrap">
 <h2><span class="n">05</span>监控模型：什么才算“真异动”</h2>
 <div class="two">
  <div><h3>三重闸门 + 严谨化</h3><ul>
   <li><b>自适应基线</b>：EWMA(λ=0.94) + 稳健 MAD 下限（正在检测的那一下不会污染基线）。</li>
   <li><b>残差检验</b>：分母是残差波动 σ_ε（σ²=β²σ_m²+σ_ε²），先剥离市场同涨同跌。</li>
   <li><b>t 分位阈值</b>（不是写死 2.0）：数据越少、门槛越高。</li>
   <li><b>BH-FDR</b>（q=0.10）控批量假阳；<b>滞回棘轮</b>防阈值抖动。</li>
   <li><b>冷启动</b>：板块先验 + 高频实现方差引导 + 线性收缩。</li>
  </ul></div>
  <div><h3>噪音控制 & 排序</h3><ul>
   <li><b>β 上卷</b>：大盘普跌，十条相关告警 → 一条组合级消息。</li>
   <li><b>叙事融合 + 静默覆盖</b>：一串事实合成一张演进卡，只响一次。</li>
   <li><b>安静优先</b> + 每日 P0 预算 ≤ 4；宁可漏一个中等信号，也不让用户静音。</li>
   <li><b>0–100 评分</b>：0.30·严重 + 0.25·<b>组合影响</b> + 0.15·置信 + 0.10·新颖 + 0.20·合流 − 0.40·噪音。</li>
   <li><b>Crypto 门</b>：加密/加密关联标的门槛 ×1.25 + 需成交量确认（thesis 破裂豁免）。</li>
  </ul></div>
 </div>
 <img src="{IMG['fusion']}" alt="叙事融合 + 静默覆盖"/>
 <div class="cap">图：同一事件的价格→异常量→标题三条事实，融合成一张“演进卡片”，手机震动从 3 次降到 2 次。</div>
</div></section>

<section id="metrics"><div class="wrap">
 <h2><span class="n">05.5</span>指标怎么读：这个值意味着什么、要注意什么</h2>
 <p class="sub">给没研究过理论的人——界面上每个数字的大白话解释。一句话：系统拿每一下和“这只票自己的正常”比，只有既罕见、又影响到你的钱时才喊。</p>
 <table>
  <tr><th>指标</th><th>这个值意味着什么</th><th>要注意的风险</th></tr>
  <tr><td><b>σ / z-score</b><br/>(如 −4.8σ)</td><td>今天这一下对<b>这只股票自己</b>有多罕见，以它自己的日常波动为单位。<b>±1σ</b>=平常 · <b>±2σ</b>≈20 天一遇 · <b>±3σ</b>≈300 天一遇 · <b>±4σ+</b>=极端，几乎必有真实事件。</td><td>σ 只说“多罕见”，<b>不说接下来涨还是跌</b>——它是“该关注”，不是买/卖信号。</td></tr>
  <tr><td><b>特质 σ</b><br/>(residual，剥离市场)</td><td>同上，但<b>剥掉了大盘的影响</b>。这才代表“是<b>这家公司自己</b>的事”。跟大盘一起跌不算新闻；大盘涨它却跌，才算。</td><td>分档就是基于这个数，不是原始涨跌幅。</td></tr>
  <tr><td><b>RVOL</b><br/>(如 3×)</td><td>今天成交量是平时的几倍。<b>1×</b>平常 · <b>2×</b>值得注意 · <b>3×</b>强 · <b>5×+</b>climactic（常是衰竭而非延续，要结合方向看）。</td><td>大波动但<b>低量</b>存疑——系统会等确认再喊。</td></tr>
  <tr><td><b>β (beta)</b><br/>(如 1.5)</td><td>放大市场的倍数。<b>1</b>=同步 · <b>1.5</b>=1.5 倍猛 · <b>&lt;1</b>=更稳。</td><td>高 β 名字的“大波动”可能只是 beta——所以我们先把市场剥掉。</td></tr>
  <tr><td><b>分档 P0/P1/P2</b></td><td><b>P0</b>=立刻停下手头事（推到手机）· <b>P1</b>=今天该知道（汇总）· <b>P2</b>=仅界面参考。安静优先，没告警是好事。</td><td>—</td></tr>
  <tr><td><b>评分 0–100</b></td><td>对<b>你的钱</b>的整体重要性（幅度 × 你持有多少 × 置信 − 噪音），越高越值得关注。</td><td>按<b>影响</b>排、不按新闻响度：1% 仓位的 5σ 可能排在 40% 仓位的 2.5σ 之后。</td></tr>
  <tr><td><b>Drawdown</b><br/>(如 −8%)</td><td>距近期高点回撤了多少。</td><td><b>大仓位</b>的深回撤，才是真正的组合风险。</td></tr>
  <tr><td><b>Thesis 状态</b><br/>intact/strained/BROKEN</td><td>你<b>当初买入的理由</b>还成不成立。<b>BROKEN</b>=你依赖的关系（如 MSTR 跟着 BTC）断了。</td><td>最严重的信号——它挑战你的<b>决策</b>，不只报告一次移动。</td></tr>
 </table>
 <p class="sub" style="margin-top:14px"><b>验证章节里的数字也顺带解释一下：</b></p>
 <table>
  <tr><th>验证指标</th><th>意味着什么</th><th>别过度解读</th></tr>
  <tr><td><b>4.73×</b> 集中度</td><td>告警落在真实财报窗口的概率，是随机某天的 4.73 倍 → 告警确实<b>扎堆在真实催化剂上</b>，不是瞎响。</td><td>它证明“命中催化剂”，<b>不等于预测涨跌</b>；越高越好但不是 100%。</td></tr>
  <tr><td><b>52%</b> 财报覆盖</td><td>约一半的财报触发了告警。</td><td><b>中性</b>数字、不是越高越好——另一半是预期内的非事件，本就该沉默。</td></tr>
  <tr><td><b>66</b> 非价格事件</td><td>66 个事件是纯看价格发现不了、由 thesis / 内部人等<b>非价格维度</b>呈现出来的。</td><td>是“多了这些维度”的价值，<b>不是</b>一个独立命中率；insider 属于 coverage-by-construction。</td></tr>
 </table>
 <div class="cap" style="margin-top:12px"><b>三条通用风险提醒：</b>① 先看<b>仓位权重</b>——小仓位的巨大 σ 对组合可能无所谓；② 这些数字是“<b>该关注</b>”而非“预测方向”，不构成买卖建议；③ 加密/加密关联的数字更吵，已自动上调门槛。<b>本产品是监控与解释，不是投资建议。</b></div>
</div></section>

<section id="signals"><div class="wrap">
 <h2><span class="n">06</span>十个交叉验证的信号源</h2>
 <p class="sub">治理铁律：新数据源必须接入<b>已有机制</b>（确认 / 背离 / thesis 参照 / 上下文叠加 / 富化），<b>绝不</b>新增每股噪音流。</p>
 <table>
  <tr><th>信号</th><th>来源</th><th>角色</th></tr>
  <tr><td>价格异动</td><td>K 线 · β · 残差 σ</td><td>核心</td></tr>
  <tr><td>Catalyst thesis</td><td>Polymarket 预测市场</td><td>thesis 参照</td></tr>
  <tr><td>宏观叠加</td><td>Polymarket</td><td>上下文</td></tr>
  <tr><td>半导体周期</td><td>DXI 存储指数</td><td>上下文</td></tr>
  <tr><td>Smart money</td><td>内部人 / 国会交易</td><td>确认 / 背离</td></tr>
  <tr><td>期权隐含</td><td>IV / 预期波幅 / 偏斜</td><td>富化</td></tr>
  <tr><td>加密微观结构</td><td>永续资金费 / 持仓量</td><td>富化</td></tr>
  <tr><td>KOL 情绪</td><td>Alva Fintwit Intelligence</td><td>上下文</td></tr>
  <tr><td>mNAV 估值</td><td>公司持币 vs 市值</td><td>富化</td></tr>
  <tr><td>每日 digest</td><td>以上编织成一段确定性叙事</td><td>主动</td></tr>
 </table>
</div></section>

<section id="ui"><div class="wrap">
 <h2><span class="n">07</span>界面：好用，不只是聪明</h2>
 <p class="sub">四个 tab —— 既看到预警，也看到原理，还看到公式；不是黑盒。</p>
 <img src="{IMG['iface']}" alt="界面 tabs"/>
 <ul>
  <li><b>Watch</b>：日报 → “Arm a thesis” 引导 → 宏观/内部人上下文 → 搜索加任意标的（即时算分）→ 阈值滑块 → 排序信号（深链）→ 持仓网格（点开 War-Room）→ 组合透视。</li>
  <li><b>Incident</b>：一个 P0 如何从 价格→量→期权→内部人→thesis 融合成一张演进卡（把告警融合可视化）。</li>
  <li><b>Theory</b>：完整方法论（分层模型、三重闸门、噪音规则、crypto 门、排序、thesis）。</li>
  <li><b>Formulas</b>：精确公式。</li>
 </ul>
 <p>还有 <b>📌 Demo · 🔴 Live 即时切换</b>（客户端瞬时，无需后端触发）：Demo 固定在 2024-11 的双 thesis 破裂场景，Live 看最近一次真实数据快照。</p>
</div></section>

<section id="valid"><div class="wrap">
 <h2><span class="n">08</span>验证：三层证据闭环</h2>
 <p class="sub">从“价格异常有信息量”一路推到“真实事件发生时，注意力有没有被路由对”。</p>
 <div class="grid">
  <div class="card b"><div class="big">37,837 天</div><div class="lab">P-R 回测</div><div class="sub">29 标的，point-in-time；未调参组 ≈ Mag7，复用性成立</div></div>
  <div class="card p"><div class="big">−26%</div><div class="lab">消融：成交量确认层</div><div class="sub">告警量降 26%、precision 不降；thesis 另加 ~24% 独有 P0</div></div>
  <div class="card r"><div class="big">4.73×</div><div class="lab">事件级：告警集中度</div><div class="sub">告警落在财报窗口 vs 随机日；111 个真实事件</div></div>
 </div>
 <h3>事件对齐评估（最贴近产品价值的一层）</h3>
 <img src="{IMG['event']}" alt="事件对齐评估"/>
 <p>把评估锚定在 <b>111 个真实事件</b>（42 财报 · 62 内部人/Form 4 · 7 thesis 破裂）上，程序化构建、不手挑。核心结论：</p>
 <ul>
  <li><b>4.73× 集中度</b> —— 一条价格告警落在财报窗口的概率是随机日的 4.7 倍（<b>告警命中真实催化剂，而非价格噪音</b>）。</li>
  <li><b>66 个非价格事件由非价格维度呈现</b>（7 个 thesis 破裂 + 59 个内部人背离）—— 价格-only 的追踪器根本没有维度去表示它们。</li>
  <li>52% 财报触发告警（<b>中性</b>数字：另一半是预期内非事件，本该沉默）；重复告警 ~6%；中位时效 +1 天。</li>
 </ul>
</div></section>

<section id="limits"><div class="wrap">
 <h2><span class="n">09</span>诚实的边界（不夸大）</h2>
 <p class="sub">专门维护了一份 <b>Evaluation Matrix</b>，逐能力标注 Live / Verified / Backtested / Specced / Known-limitation。</p>
 <table>
  <tr><th>能力</th><th>状态</th><th>说明</th></tr>
  <tr><td>核心检测 · 10 信号源 · 界面 · Discord/web 告警</td><td><span class="pill pl-live">Live</span></td><td>已部署、真实数据验证</td></tr>
  <tr><td>回测 / 消融 / 事件对齐</td><td><span class="pill pl-test">Backtested</span></td><td>数字均可复现（脚本 + 结果 JSON 在仓库）</td></tr>
  <tr><td>真实券商 auto-intake demo</td><td><span class="pill pl-warn">未演示</span></td><td>设计与代码就位；演示号无 linked 账户，连账号即可跑</td></tr>
  <tr><td>Telegram 静默覆盖端到端投递</td><td><span class="pill pl-warn">已 wired</span></td><td>代码 secret 门控就位；需 BYOD bot token 才能真投</td></tr>
  <tr><td>news / 8-K / M&A / 诉讼 事件对齐</td><td><span class="pill pl-spec">Specced</span></td><td>这些历史事件端点在当前 API tier 不可得</td></tr>
 </table>
 <p>这几项<b>不是没优化，而是缺账号/凭证/数据端点</b> —— 都如实标注了范围与下界（例如 insider 是 coverage-by-construction、P0/P1 precision 是下界）。</p>
</div></section>

<section id="trace"><div class="wrap">
 <h2><span class="n">10</span>迭代轨迹（多轮 review → 优化）</h2>
 <p class="sub">不是一次性交付，而是经过多轮评审反馈持续打磨。完整见 <span class="kbd">CHANGELOG.md</span>。</p>
 <div class="timeline">
  <div class="tl"><div class="rd">Round 0 · 核心构建</div><div class="ds">可复用 skill + live Playbook + 回测；thesis-linked 监控；动态观测集 + UDF；三 tab 界面。</div></div>
  <div class="tl"><div class="rd">Round 1 · 交叉验证信号源</div><div class="ds">宏观叠加、smart-money、期权、加密微观、半导体周期、Polymarket catalyst thesis；随后社区启发：FinTwit、mNAV、日报、War-Room。</div></div>
  <div class="tl"><div class="rd">Round 2 · 打包 · 诚实 · IM 投递</div><div class="ds">自包含 skill 包 + GitHub Release；AGENTS.md；Discord 端到端送达；组合 auto-intake；DELIVERABLES。</div></div>
  <div class="tl"><div class="rd">Round 3 · 评审催生的新能力</div><div class="ds">即时 Demo/Live、Incident tab、crypto 门、thesis onboarding、Telegram wiring。</div></div>
  <div class="tl"><div class="rd">Round 4 · 验证闭环 & 口径收紧</div><div class="ds">ablation、事件对齐评估（111 事件）、Evaluation Matrix；把每一处措辞都收紧到经得起细看。</div></div>
 </div>
</div></section>

<section id="deliv"><div class="wrap">
 <h2><span class="n">11</span>交付物与文档导航</h2>
 <table>
  <tr><th>类别</th><th>文件 / 链接</th></tr>
  <tr><td>Skill（交付 1）</td><td><span class="kbd">portfolio-watch/SKILL.md</span> · <span class="kbd">portfolio-watch-skill-v2.1.0.zip</span></td></tr>
  <tr><td>Live Playbook（交付 2）</td><td><a class="lnk" href="https://alva.ai/u/george351419/playbooks/portfolio-watch">alva.ai/u/george351419/playbooks/portfolio-watch</a></td></tr>
  <tr><td>One-Pager（交付 3）</td><td><span class="kbd">One-Pager.md</span>（中英双语）</td></tr>
  <tr><td>验证</td><td><span class="kbd">Backtest-Report.md</span> · <span class="kbd">Event-Aligned-Evaluation.md</span> · <span class="kbd">Evaluation-Matrix.md</span></td></tr>
  <tr><td>工程</td><td><span class="kbd">AGENTS.md</span>（架构/踩坑/扩展）· <span class="kbd">CHANGELOG.md</span>（迭代轨迹）</td></tr>
  <tr><td>仓库</td><td><a class="lnk" href="https://github.com/george351419-sys/Portfolio-Watch-Skill">github.com/george351419-sys/Portfolio-Watch-Skill</a>（Release v2.1.0）</td></tr>
 </table>
</div></section>

<footer><div class="wrap">
 Portfolio Watch Skill · 面向 Alva 的可复用组合监控 skill · 输出为监控与解释，非投资建议。<br/>
 本页为自包含汇报文档，可直接打开、投屏或“打印为 PDF”。
</div></footer>
</body></html>"""

open("project-report.html","w").write(HTML)
print("wrote project-report.html", round(os.path.getsize("project-report.html")/1024), "KB")
