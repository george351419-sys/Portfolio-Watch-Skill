import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

NAVY="#1f2937"; GREY="#6b7280"; BLUE="#2563eb"; PURPLE="#6d28d9"; RED="#dc2626"; LINE="#e5e7eb"
fig=plt.figure(figsize=(10.6,6.7),dpi=110); fig.patch.set_facecolor("white")
ax=fig.add_axes([0,0,1,1]); ax.set_xlim(0,100); ax.set_ylim(0,100); ax.axis("off")

ax.text(6,93,"Event-Aligned Evaluation",fontsize=25,fontweight="bold",color=NAVY)
ax.text(6,87.5,"When a real event happens, does it become a useful alert - earlier, with less noise, correctly ranked?",fontsize=11,color=GREY)

ax.text(6,79,"111 real events  -  last ~24 months  -  point-in-time, programmatically built (no cherry-picking)",fontsize=10.5,color=NAVY,fontweight="bold")
total=111; x0=6; w=88; y=71; h=5.5
segs=[("Earnings",42,BLUE),("Insider / Form 4",62,PURPLE),("Thesis break",7,RED)]
cx=x0
for name,n,c in segs:
    ww=w*n/total
    ax.add_patch(plt.Rectangle((cx,y),ww,h,facecolor=c,edgecolor="white",linewidth=1.5))
    ax.text(cx+ww/2,y+h/2,str(n),ha="center",va="center",color="white",fontsize=12,fontweight="bold")
    ax.text(cx+ww/2,y-2.4,name,ha="center",va="center",color=GREY,fontsize=9)
    cx+=ww

# lead metric = concentration (the strongest, most independent number); coverage is neutral-framed
tiles=[
 ("4.73x","earnings alert concentration","alerts land on earnings vs a random day",RED),
 ("66","non-price events surfaced","by thesis + smart-money; price-only can't represent",PURPLE),
 ("52%","earnings produced an alert","rest are in-line non-events (correct silence)",BLUE),
 ("~6% / +1d","duplicates / median timing","fusion collapses repeats; fires promptly",NAVY),
]
tx=6; tw=21.4; gap=1.9; ty=40; th=17
for i,(big,lab,sub,c) in enumerate(tiles):
    xx=tx+i*(tw+gap)
    box=FancyBboxPatch((xx,ty),tw,th,boxstyle="round,pad=0.4,rounding_size=1.4",
        facecolor="#f9fafb",edgecolor=LINE,linewidth=1); ax.add_patch(box)
    ax.add_patch(plt.Rectangle((xx,ty),0.8,th,facecolor=c,edgecolor="none"))
    ax.text(xx+tw/2,ty+11.4,big,ha="center",va="center",fontsize=18,fontweight="bold",color=c)
    ax.text(xx+tw/2,ty+6.6,lab,ha="center",va="center",fontsize=9.0,color=NAVY,fontweight="bold")
    ax.text(xx+tw/2,ty+2.9,sub,ha="center",va="center",fontsize=6.9,color=GREY)

ax.add_line(plt.Line2D([6,94],[16,16],color=LINE,lw=1))
ax.text(6,12,"Event types: earnings (earnings-calendar) - insider/Form 4 (>=2 discretionary open-market buys, or a single >=$10M Form 4) - price/proxy thesis (MSTR-COIN vs BTC).",fontsize=7.6,color=GREY)
ax.text(6,8.4,"Honest scope: recent ~24-month window; only sourceable event types (news / M&A / litigation / guidance unavailable). Insider is coverage-by-construction; P0/P1 precision is a lower bound.",fontsize=7.1,color=GREY)
ax.text(6,3.6,"Backtest-Report 8.6 - Event-Aligned-Evaluation.md - backtest/pw-event-aligned.js",fontsize=7.6,color=PURPLE,style="italic")

fig.savefig("assets/fig7-event-aligned.png",facecolor="white",bbox_inches="tight",pad_inches=0.15)
print("saved assets/fig7-event-aligned.png")
