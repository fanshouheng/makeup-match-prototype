import {
  ArrowRight,
  FileText,
  Palette,
  Search,
  Sparkles,
} from "lucide-react";

const PLUS_PRICE = 9.9;

export function PlusOffer() {
  return (
    <aside className="plus-spotlight" aria-labelledby="plus-offer-title">
      <div className="plus-spotlight-mark" aria-hidden="true">
        <Sparkles size={18} />
        PLUS
      </div>
      <div className="plus-spotlight-copy">
        <p className="eyebrow">限量付费内测</p>
        <h3 id="plus-offer-title">把面部分析，变成可执行的妆造方案</h3>
        <p>
          <span><FileText size={14} />详细面容报告</span>
          <span><Palette size={14} />3 套妆造方案</span>
          <span><Search size={14} />公开博主线索</span>
        </p>
      </div>
      <div className="plus-spotlight-action">
        <p className="plus-spotlight-price" aria-label={`${PLUS_PRICE} 元早期内测`}>
          <strong>¥{PLUS_PRICE}</strong><span>/ 早期内测</span>
        </p>
        <a className="button plus-spotlight-button" href="/plus">
          获取 Plus 报告
          <ArrowRight aria-hidden="true" size={15} />
        </a>
        <small>1 份正式报告 + 2 次内测重试</small>
      </div>
    </aside>
  );
}
