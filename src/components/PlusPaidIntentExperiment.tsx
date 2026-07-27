import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FileText,
  Palette,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { PlusExampleDeliverable } from "./PlusExampleDeliverable";

const SCENES = [
  { value: "commute", label: "日常通勤" },
  { value: "date", label: "约会见面" },
  { value: "camera", label: "拍照上镜" },
  { value: "party", label: "聚会派对" },
  { value: "wedding_guest", label: "婚礼宾客" },
  { value: "graduation", label: "毕业典礼" },
  { value: "presentation", label: "面试汇报" },
  { value: "travel", label: "旅行出游" },
] as const;

const STYLES = [
  { value: "clean", label: "清透自然" },
  { value: "soft", label: "温柔氛围" },
  { value: "sweet_cool", label: "甜酷利落" },
  { value: "retro", label: "复古港风" },
  { value: "camera_ready", label: "明艳上镜" },
  { value: "auto", label: "让 AI 建议" },
] as const;

const PLUS_OFFER_ID = "make-up-plus-offer";
const PLUS_PRICE = 9.9;

export function PlusPaidIntentSpotlight() {
  return (
    <aside className="plus-spotlight" aria-labelledby="plus-spotlight-title">
      <div className="plus-spotlight-mark" aria-hidden="true">
        <Sparkles size={18} />
        PLUS
      </div>
      <div className="plus-spotlight-copy">
        <p className="eyebrow">限量付费内测</p>
        <h3 id="plus-spotlight-title">把面部分析，变成可执行的妆造方案</h3>
        <p>详细面部报告 · 多场景妆容方案 · 按方案发现博主</p>
      </div>
      <div className="plus-spotlight-action">
        <p className="plus-spotlight-price" aria-label={`${PLUS_PRICE} 元每次`}>
          <strong>¥{PLUS_PRICE}</strong><span>/ 次</span>
        </p>
        <a className="button plus-spotlight-button" href="/plus">
          了解 Plus 内测
          <ArrowRight aria-hidden="true" size={15} />
        </a>
        <small>微信确认 · 邀请码激活</small>
      </div>
    </aside>
  );
}

export function PlusPaidIntentExperiment() {
  const [expanded, setExpanded] = useState(false);
  const [scenes, setScenes] = useState<string[]>([]);
  const [customScene, setCustomScene] = useState("");
  const [style, setStyle] = useState("");
  const [configured, setConfigured] = useState(false);
  const customSceneText = customScene.trim();
  const selectedSceneCount = scenes.length + (customSceneText ? 1 : 0);
  const selectedSceneLabels = SCENES
    .filter((scene) => scenes.includes(scene.value))
    .map((scene) => scene.label);
  const selectedStyleLabel = STYLES.find((option) => option.value === style)?.label;
  const selectionSummary = [
    ...selectedSceneLabels,
    ...(customSceneText ? [`自定义：${customSceneText}`] : []),
    ...(selectedStyleLabel ? [`妆造：${selectedStyleLabel}`] : []),
  ];

  const toggleExpanded = () => {
    setExpanded((current) => !current);
  };

  const toggleScene = (scene: string) => {
    if (configured) return;
    setScenes((current) => current.includes(scene)
      ? current.filter((value) => value !== scene)
      : selectedSceneCount < 3
        ? [...current, scene]
        : current);
  };

  const confirmConfiguration = () => {
    if (selectedSceneCount === 0 || !style || configured) return;
    setConfigured(true);
  };

  const editConfiguration = () => {
    setConfigured(false);
  };

  return (
    <section className="plus-offer" id={PLUS_OFFER_ID} aria-labelledby="plus-offer-title">
      <div className="plus-offer-heading">
        <div>
          <p className="eyebrow">PLUS / 限量付费内测</p>
          <h3 id="plus-offer-title">从面部结构到妆容方案，再找到参考博主</h3>
          <p>完整面部报告、多个场景方案和按方案联网发现博主。</p>
        </div>
        <div className="plus-offer-price" aria-label={`${PLUS_PRICE} 元每次`}>
          <strong>¥{PLUS_PRICE}</strong>
          <span>/ 次</span>
        </div>
      </div>

      <div className="plus-offer-features" aria-label="MAKE UP Plus 内容">
        <div><FileText size={18} /><span>详细面部结构报告</span></div>
        <div><Palette size={18} /><span>多场景妆容方案</span></div>
        <div><Search size={18} /><span>按方案发现博主</span></div>
      </div>

      <div className="plus-offer-notice">
        <ShieldCheck size={16} />
        <span>本站不展示收款码。请先进入 Plus 页面添加微信，确认名额、交付内容、时间和退款方式后再付款。</span>
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
            <legend>你准备去哪里？ <small>已选 {selectedSceneCount} / 3</small></legend>
            <p className="plus-field-help">先选常用场景，也可以在下方直接描述更具体的安排。</p>
            <div className="plus-option-grid plus-option-grid--scenes">
              {SCENES.map((scene) => (
                <label key={scene.value}>
                  <input
                    checked={scenes.includes(scene.value)}
                    disabled={configured || (!scenes.includes(scene.value) && selectedSceneCount >= 3)}
                    onChange={() => toggleScene(scene.value)}
                    type="checkbox"
                  />
                  <span>{scene.label}</span>
                </label>
              ))}
            </div>
            <label className="plus-custom-scene">
              <span>没有合适的？直接描述</span>
              <textarea
                disabled={configured || (!customSceneText && scenes.length >= 3)}
                maxLength={80}
                onChange={(event) => setCustomScene(event.target.value)}
                placeholder="例如：我要参加毕业典礼，希望白天仪式和晚间聚餐都能用"
                rows={2}
                value={customScene}
              />
              <small>最多 80 字，只保留在当前页面，不会发送到统计服务。</small>
            </label>
          </fieldset>

          <fieldset disabled={configured}>
            <legend>选择妆造方向</legend>
            <p className="plus-field-help">不确定也没关系，可以让 AI 根据场景和结构报告给出方向。</p>
            <div className="plus-option-grid plus-option-grid--styles">
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
              disabled={selectedSceneCount === 0 || !style}
              onClick={confirmConfiguration}
              type="button"
            >
              查看示例交付
            </button>
          ) : (
            <>
              <PlusExampleDeliverable
                onEdit={editConfiguration}
                selectionSummary={selectionSummary}
              />
              <div className="plus-early-access-cta">
                <div>
                  <CheckCircle2 size={20} />
                  <div>
                    <small>限量付费内测</small>
                    <p>想生成你的专属方案？进入 Plus 页面后，先添加微信确认本期名额和交付安排。</p>
                  </div>
                </div>
                <p className="plus-early-access-note">
                  ¥{PLUS_PRICE} / 次。人工确认付款后会收到一次性邀请码，用邮箱和密码注册即可直接登录。免费匹配不受影响。
                </p>
                <a className="button button-primary plus-early-access-link" href="/plus">
                  前往 Plus 购买与激活
                  <ArrowRight aria-hidden="true" size={16} />
                </a>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
