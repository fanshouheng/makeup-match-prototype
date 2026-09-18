import {
  ArrowRight,
  FileText,
  Palette,
  Search,
  Sparkles,
} from "lucide-react";

export function PlusOffer() {
  return (
    <aside className="plus-spotlight" aria-labelledby="plus-offer-title">
      <div className="plus-spotlight-mark" aria-hidden="true">
        <Sparkles size={18} />
        POINTS
      </div>
      <div className="plus-spotlight-copy">
        <p className="eyebrow">按需生成</p>
        <h3 id="plus-offer-title">把面部分析，变成可执行的妆造方案</h3>
        <p>
          <span><FileText size={14} />详细面容报告</span>
          <span><Palette size={14} />3 套妆造方案</span>
          <span><Search size={14} />公开博主线索</span>
        </p>
      </div>
      <div className="plus-spotlight-action">
        <p className="plus-spotlight-price" aria-label="完整妆造报告每次 100 积分">
          <strong>100 积分</strong><span>/ 份报告</span>
        </p>
        <a className="button plus-spotlight-button" href="/plus.html">
          生成妆容报告
          <ArrowRight aria-hidden="true" size={15} />
        </a>
        <small>使用最近一次本机分析</small>
      </div>
    </aside>
  );
}
