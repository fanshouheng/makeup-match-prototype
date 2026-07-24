import { useEffect, useState } from "react";
import {
  ArrowDown,
  CheckCircle2,
  ChevronDown,
  FileText,
  Palette,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  getPlusOfferVariant,
  PLUS_OFFER_PRICES,
  recordPlusOfferEvent,
  type PlusOfferEventName,
} from "../services/productMetrics";

const SCENES = [
  { value: "commute", label: "通勤" },
  { value: "date", label: "约会" },
  { value: "camera", label: "上镜" },
  { value: "party", label: "聚会" },
] as const;

const STYLES = [
  { value: "clean", label: "清透自然" },
  { value: "atmosphere", label: "氛围感" },
  { value: "sweet_cool", label: "甜酷" },
  { value: "retro", label: "复古" },
] as const;

type IntentResponse = "yes" | "price_high" | "not_needed";

const PLUS_OFFER_ID = "look-ai-plus-offer";

const RESPONSE_EVENT: Record<IntentResponse, PlusOfferEventName> = {
  yes: "plus_intent_yes",
  price_high: "plus_intent_price_high",
  not_needed: "plus_intent_not_needed",
};

const RESPONSE_MESSAGE: Record<IntentResponse, string> = {
  yes: "已记录：愿意按当前价格购买",
  price_high: "已记录：当前价格偏高",
  not_needed: "已记录：暂时不需要",
};

export function PlusPaidIntentSpotlight() {
  const [variant] = useState(getPlusOfferVariant);
  const price = PLUS_OFFER_PRICES[variant];

  const showFullOffer = () => {
    document.getElementById(PLUS_OFFER_ID)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <aside className="plus-spotlight" aria-labelledby="plus-spotlight-title">
      <div className="plus-spotlight-mark" aria-hidden="true">
        <Sparkles size={18} />
        PLUS
      </div>
      <div className="plus-spotlight-copy">
        <p className="eyebrow">付费功能测试</p>
        <h3 id="plus-spotlight-title">把面部分析，变成可执行的妆造方案</h3>
        <p>详细面部报告 · 多场景妆容方案 · 按方案发现博主</p>
      </div>
      <div className="plus-spotlight-action">
        <p className="plus-spotlight-price" aria-label={`${price} 元每次`}>
          <strong>¥{price}</strong><span>/ 次</span>
        </p>
        <button className="button plus-spotlight-button" onClick={showFullOffer} type="button">
          查看 Plus 方案
          <ArrowDown aria-hidden="true" size={15} />
        </button>
        <small>仅测试意向，不会扣款</small>
      </div>
    </aside>
  );
}

export function PlusPaidIntentExperiment() {
  const [variant] = useState(getPlusOfferVariant);
  const [expanded, setExpanded] = useState(false);
  const [scenes, setScenes] = useState<string[]>([]);
  const [style, setStyle] = useState("");
  const [configured, setConfigured] = useState(false);
  const [response, setResponse] = useState<IntentResponse>();
  const price = PLUS_OFFER_PRICES[variant];

  useEffect(() => {
    void recordPlusOfferEvent("plus_offer_viewed", variant);
  }, [variant]);

  const toggleExpanded = () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (nextExpanded) void recordPlusOfferEvent("plus_offer_opened", variant);
  };

  const toggleScene = (scene: string) => {
    if (configured) return;
    setScenes((current) => current.includes(scene)
      ? current.filter((value) => value !== scene)
      : current.length < 3
        ? [...current, scene]
        : current);
  };

  const confirmConfiguration = () => {
    if (scenes.length === 0 || !style || configured) return;
    setConfigured(true);
    void recordPlusOfferEvent("plus_offer_configured", variant);
  };

  const submitResponse = (nextResponse: IntentResponse) => {
    if (response) return;
    setResponse(nextResponse);
    void recordPlusOfferEvent(RESPONSE_EVENT[nextResponse], variant);
  };

  return (
    <section className="plus-offer" id={PLUS_OFFER_ID} aria-labelledby="plus-offer-title">
      <div className="plus-offer-heading">
        <div>
          <p className="eyebrow">PLUS / 付费功能测试</p>
          <h3 id="plus-offer-title">从面部结构到妆容方案，再找到参考博主</h3>
          <p>完整面部报告、多个场景方案和按方案联网发现博主。</p>
        </div>
        <div className="plus-offer-price" aria-label={`${price} 元每次`}>
          <strong>¥{price}</strong>
          <span>/ 次</span>
        </div>
      </div>

      <div className="plus-offer-features" aria-label="LOOK AI Plus 内容">
        <div><FileText size={18} /><span>详细面部结构报告</span></div>
        <div><Palette size={18} /><span>多场景妆容方案</span></div>
        <div><Search size={18} /><span>按方案发现博主</span></div>
      </div>

      <div className="plus-offer-notice">
        <ShieldCheck size={16} />
        <span>当前仅测试购买意向，不会扣款，也不收集支付信息。</span>
      </div>

      <button
        aria-expanded={expanded}
        className="button button-primary plus-offer-toggle"
        onClick={toggleExpanded}
        type="button"
      >
        {expanded ? "收起配置" : "配置我的 Plus"}
        <ChevronDown aria-hidden="true" className={expanded ? "is-expanded" : ""} size={16} />
      </button>

      {expanded && (
        <div className="plus-configurator">
          <fieldset disabled={configured}>
            <legend>选择场景 <small>可选 1 至 3 个</small></legend>
            <div className="plus-option-grid">
              {SCENES.map((scene) => (
                <label key={scene.value}>
                  <input
                    checked={scenes.includes(scene.value)}
                    disabled={configured || (!scenes.includes(scene.value) && scenes.length >= 3)}
                    onChange={() => toggleScene(scene.value)}
                    type="checkbox"
                  />
                  <span>{scene.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset disabled={configured}>
            <legend>选择妆造方向</legend>
            <div className="plus-option-grid">
              {STYLES.map((option) => (
                <label key={option.value}>
                  <input
                    checked={style === option.value}
                    name="plus-style"
                    onChange={() => setStyle(option.value)}
                    type="radio"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {!configured ? (
            <button
              className="button button-secondary plus-configure-submit"
              disabled={scenes.length === 0 || !style}
              onClick={confirmConfiguration}
              type="button"
            >
              确认我的 Plus 方案
            </button>
          ) : (
            <div className="plus-intent-question">
              <div>
                <CheckCircle2 size={20} />
                <p>如果现在可以生成这套完整方案，你会按 ¥{price} 购买吗？</p>
              </div>
              <div className="plus-intent-actions">
                <button
                  aria-pressed={response === "yes"}
                  data-selected={response === "yes"}
                  disabled={Boolean(response)}
                  onClick={() => submitResponse("yes")}
                  type="button"
                >
                  愿意购买
                </button>
                <button
                  aria-pressed={response === "price_high"}
                  data-selected={response === "price_high"}
                  disabled={Boolean(response)}
                  onClick={() => submitResponse("price_high")}
                  type="button"
                >
                  价格偏高
                </button>
                <button
                  aria-pressed={response === "not_needed"}
                  data-selected={response === "not_needed"}
                  disabled={Boolean(response)}
                  onClick={() => submitResponse("not_needed")}
                  type="button"
                >
                  暂时不需要
                </button>
              </div>
              <p className="plus-intent-status" role="status">
                {response ? `${RESPONSE_MESSAGE[response]}。本次不会扣款。` : ""}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
