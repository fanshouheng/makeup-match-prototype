import { useState } from "react";
import { CheckCircle2, Search } from "lucide-react";

const EXAMPLE_OBSERVATIONS = [
  {
    label: "轮廓比例",
    text: "面部纵向比例略显修长，整体妆面适合增加眼颊的横向层次，避免纵向线条叠加过多。",
  },
  {
    label: "下颌过渡",
    text: "下颌相对颧部更收窄，修容宜轻，腮红可以向外平拉，让外轮廓保持轻盈。",
  },
  {
    label: "下庭与唇部",
    text: "下庭比例接近均衡，唇色可以承担适度重点，并与腮红保持同一色彩家族。",
  },
] as const;

const EXAMPLE_PLANS = [
  {
    label: "日间稳妥版",
    title: "清透仪式妆",
    meta: "约 15 分钟 · 室内外光线",
    goal: "近看干净、日光下不过度反光，穿毕业袍时仍保留自然气色。",
    steps: [
      ["底妆", "薄涂半哑光底妆，只在鼻翼与眼下局部叠加，T 区轻定妆。"],
      ["眉部", "用柔和灰棕填补空隙，眉峰保持平缓，眉尾不过度下压。"],
      ["眼部", "奶咖色铺底，浅棕横向晕染眼尾，使用细内眼线和根根分明的睫毛。"],
      ["修容", "低饱和灰棕轻扫颧骨外侧与下颌转折处，不强化纵向鼻影。"],
      ["腮红", "柔雾玫瑰色从眼下外侧向太阳穴平拉，范围轻、边缘散。"],
      ["唇部", "玫瑰茶色缎光唇，先薄涂再在唇中叠加一层，方便仪式中补妆。"],
    ],
  },
  {
    label: "合影表达版",
    title: "清晰上镜妆",
    meta: "约 25 分钟 · 合影与晚间聚餐",
    goal: "在镜头中保留轮廓和五官层次，色彩比日间版更明确，但不过度厚重。",
    steps: [
      ["底妆", "选择中等遮盖的柔雾底妆，分区定妆，颧骨高点保留少量自然光泽。"],
      ["眉部", "灰棕眉色加深半级，眉尾边界稍清晰，让合影中的上半脸更完整。"],
      ["眼部", "中性棕加深眼尾后三分之一，眼线平拉 2 至 3 毫米，睫毛重点放在眼尾。"],
      ["修容", "在颧骨外侧与下颌转折处少量叠加，鼻侧只做轻微明暗过渡。"],
      ["腮红", "低饱和莓果玫瑰色向外上方晕染，比日间版提高一档饱和度。"],
      ["唇部", "莓果玫瑰半哑光唇，先勾勒自然唇线，再用纸巾轻压提高持妆。"],
    ],
  },
] as const;

interface PlusExampleDeliverableProps {
  onEdit: () => void;
  selectionSummary: string[];
}

export function PlusExampleDeliverable({
  onEdit,
  selectionSummary,
}: PlusExampleDeliverableProps) {
  const [activePlan, setActivePlan] = useState(0);
  const plan = EXAMPLE_PLANS[activePlan];

  return (
    <section className="plus-example" aria-labelledby="plus-example-title">
      <div className="plus-example-heading">
        <div>
          <p className="eyebrow">EXAMPLE / 示例交付</p>
          <h4 id="plus-example-title">毕业典礼 · 清透自然</h4>
          <p>以下展示正式版准备提供的内容深度，方便你判断它是否真的有用。</p>
        </div>
        <span>示例，不基于你的照片</span>
      </div>

      <div className="plus-selection-summary">
        <CheckCircle2 aria-hidden="true" size={18} />
        <div>
          <small>你刚刚配置的需求</small>
          <p>{selectionSummary.join(" · ")}</p>
        </div>
        <button onClick={onEdit} type="button">修改配置</button>
      </div>

      <div className="plus-example-layout">
        <section className="plus-example-report" aria-labelledby="plus-example-report-title">
          <p className="eyebrow">01 / 面部结构报告</p>
          <h5 id="plus-example-report-title">可解释的结构观察</h5>
          <ul>
            {EXAMPLE_OBSERVATIONS.map((observation, index) => (
              <li key={observation.label}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{observation.label}</strong>
                  <p>{observation.text}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="plus-example-caveat">
            示例置信度：中等。正式版会说明拍摄角度、表情和光线造成的不确定性。
          </p>
        </section>

        <section className="plus-example-plan" aria-labelledby="plus-example-plan-title">
          <p className="eyebrow">02 / 两套妆容方案</p>
          <div className="plus-example-plan-heading">
            <h5 id="plus-example-plan-title">同一场景的两种表达</h5>
            <div className="plus-example-tabs" role="tablist" aria-label="示例妆容方案">
              {EXAMPLE_PLANS.map((option, index) => (
                <button
                  aria-selected={activePlan === index}
                  key={option.label}
                  onClick={() => setActivePlan(index)}
                  role="tab"
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="plus-example-plan-intro">
            <div>
              <strong>{plan.title}</strong>
              <small>{plan.meta}</small>
            </div>
            <p>{plan.goal}</p>
          </div>
          <dl>
            {plan.steps.map(([area, detail]) => (
              <div key={area}>
                <dt>{area}</dt>
                <dd>{detail}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section className="plus-example-search" aria-labelledby="plus-example-search-title">
        <Search aria-hidden="true" size={18} />
        <div>
          <p className="eyebrow">03 / 博主搜索简报</p>
          <h5 id="plus-example-search-title">按内容能力找参考，不按长相找人</h5>
          <div className="plus-example-keywords" aria-label="示例搜索关键词">
            <span>毕业典礼妆容</span>
            <span>清透合影妆</span>
            <span>自然放大眼妆</span>
            <span>毕业照持妆</span>
          </div>
          <p>正式版会据此查找有完整步骤、适应室内外光线且不依赖具体品牌的公开内容；博主名字仍会标注为未核验线索。</p>
        </div>
      </section>
    </section>
  );
}
