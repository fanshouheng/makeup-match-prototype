import {
  ArrowRight,
  Ban,
  BarChart3,
  CheckCircle2,
  CircleDot,
  FileText,
  Megaphone,
  MessageCircle,
  Share2,
  ShieldCheck,
  Target,
  UsersRound,
} from "lucide-react";
import type { AdminOutreach, AdminProductMetrics } from "./adminApi";

export type AdminWorkbenchTarget = "metrics" | "outreach" | "pending";

interface AdminWorkbenchProps {
  metrics: AdminProductMetrics;
  outreach: AdminOutreach[];
  pendingCount: number;
  activeCreatorCount: number;
  dateRangeLabel: string;
  onNavigate: (target: AdminWorkbenchTarget) => void;
}

function formatRate(numerator: number, denominator: number): string {
  if (denominator <= 0) return "--";
  return `${(numerator / denominator * 100).toFixed(1)}%`;
}

const DIRECTIONS = [
  {
    index: "01",
    priority: "P0",
    title: "证明用户价值",
    outcome: "用户能从结果里找到真正值得参考的人或内容。",
    actions: ["观察并访谈 15 位目标用户", "拆清“不符合”的具体原因", "3 个独立样本指向同一问题后再改产品"],
  },
  {
    index: "02",
    priority: "P1",
    title: "宣传并找到目标用户",
    outcome: "通过宣传知道哪些女性受众渠道带来了有效使用，而不只是访问量。",
    actions: ["一次只跑 1 个渠道、1 个内容、1 个 CTA", "内容围绕用户问题、实际结果和隐私机制", "每 200 次目标渠道访问只检查最大阻塞点"],
  },
  {
    index: "03",
    priority: "P1",
    title: "验证创作者供给",
    outcome: "创作者愿意回复、提交授权资料并正式上线。",
    actions: ["完成 20 位有效邀约", "目标至少 8 位回复、5 位上线", "入库授权与营销合作授权分开确认"],
  },
  {
    index: "04",
    priority: "持续",
    title: "守住产品底盘",
    outcome: "主流程稳定、隐私边界清楚、每次发布可验证。",
    actions: ["关注分析失败和移动端主流程", "只修证据明确的最大故障", "照片、比例、排名继续默认留在浏览器"],
  },
] as const;

export function AdminWorkbench({
  metrics,
  outreach,
  pendingCount,
  activeCreatorCount,
  dateRangeLabel,
  onNavigate,
}: AdminWorkbenchProps) {
  const feedbackTotal = metrics.feedback_yes + metrics.feedback_no;
  const minimumPlusExposure = Math.min(
    ...Object.values(metrics.plus_by_variant).map((variant) => variant.plus_offer_viewed),
  );

  return (
    <section className="admin-workbench" aria-labelledby="admin-workbench-title">
      <div className="admin-workbench-focus">
        <div>
          <p className="admin-kicker">NOW / CORE VALUE</p>
          <h2 id="admin-workbench-title">先弄清用户为什么说“不符合”</h2>
          <p>在调算法、加功能或继续放大流量前，先把问题分清：轮廓、五官比例、照片姿态、结果解释，还是用户根本不需要这种参考方式。</p>
          <button className="admin-secondary-button" type="button" onClick={() => onNavigate("metrics")}>
            <BarChart3 size={16} />查看当前数据<ArrowRight size={15} />
          </button>
        </div>
        <div className="admin-workbench-exit">
          <span>本轮退出条件</span>
          <strong>8 月 21 日前拿到可复核证据</strong>
          <ul>
            <li><CheckCircle2 size={15} />15 位目标用户完成观察与访谈</li>
            <li><CheckCircle2 size={15} />同一问题至少有 3 个独立样本</li>
            <li><CheckCircle2 size={15} />据此决定继续、转向或停止</li>
          </ul>
        </div>
      </div>

      <div className="admin-workbench-section-heading">
        <div><p className="admin-kicker">NEXT ACTIONS</p><h3>今天先做</h3></div>
        <span>按顺序推进，不并行开新实验</span>
      </div>
      <ol className="admin-workbench-actions">
        <li><span>01</span><div><strong>约并观察 1 至 3 位目标用户</strong><p>先看她实际选图、看结果和点内容，再问哪里犹豫，不先解释产品。</p></div><em>手工执行</em></li>
        <li><span>02</span><div><strong>把“不符合”追问成固定原因</strong><p>记录为轮廓、五官比例、姿态影响、结果不清楚或需求本身不成立。</p></div><em>核心证据</em></li>
        <li><span>03</span><div><strong>联系今天的 4 至 5 位合规创作者</strong><p>只说明免费现状、照片用途、授权范围和撤回方式；三天后最多跟进一次。</p></div><button className="admin-secondary-button" type="button" onClick={() => onNavigate("outreach")}><MessageCircle size={15} />去跟进</button></li>
        <li><span>04</span><div><strong>起草 1 条目标用户宣传内容</strong><p>只讲一个问题、一个使用结果和一个动作，不把开发过程当作女性用户获客内容。</p></div><em>xhs_01</em></li>
      </ol>

      <div className="admin-workbench-section-heading">
        <div><p className="admin-kicker">DIRECTIONS</p><h3>四条大方向</h3></div>
        <span>小任务必须服务于其中一条</span>
      </div>
      <div className="admin-direction-grid">
        {DIRECTIONS.map((direction) => (
          <article className="admin-direction" key={direction.index}>
            <div className="admin-direction-heading"><span>{direction.index}</span><em>{direction.priority}</em></div>
            <h4>{direction.title}</h4>
            <p>{direction.outcome}</p>
            <ul>{direction.actions.map((action) => <li key={action}><CircleDot size={13} />{action}</li>)}</ul>
          </article>
        ))}
      </div>

      <div className="admin-workbench-section-heading">
        <div><p className="admin-kicker">PROMOTION</p><h3>宣传与增长</h3></div>
        <span>宣传是验证，不是只追播放量</span>
      </div>
      <div className="admin-promotion">
        <article className="admin-promotion-plan">
          <div className="admin-promotion-label"><Megaphone size={17} /><span>本周主宣传实验</span><em>女性妆容用户</em></div>
          <h4>小红书只测试一个用户问题</h4>
          <blockquote>“不知道自己该照着谁学妆？先按脸部结构筛一轮参考。”</blockquote>
          <dl>
            <div><dt>渠道</dt><dd>小红书 · xhs_01</dd></div>
            <div><dt>唯一动作</dt><dd>完成匹配后选择“符合”或“不太符合”</dd></div>
            <div><dt>可用素材</dt><dd>自有、生成或已明确授权的演示素材</dd></div>
            <div><dt>复盘触发</dt><dd>200 次目标渠道访问或 7 天，以先到为准</dd></div>
          </dl>
          <button className="admin-secondary-button" type="button" onClick={() => onNavigate("metrics")}><BarChart3 size={15} />查看宣传后的漏斗</button>
        </article>
        <div className="admin-promotion-tracks">
          <article><FileText size={17} /><div><span>用户宣传</span><strong>写用户问题、实际结果、隐私机制</strong><p>内容面向正在找妆容参考的女生，只要求完成一次匹配并反馈。</p></div></article>
          <article><Share2 size={17} /><div><span>创作者传播</span><strong>邀请已授权创作者联合发布或转发</strong><p>入库授权不等于宣传授权；发布前单独确认，合作关系要清楚标注。</p></div></article>
          <article><Megaphone size={17} /><div><span>品牌与开源</span><strong>开发复盘、Vibe Coding、开源进展单独记录</strong><p>这类内容可以积累品牌声誉，但不能算作女性目标用户需求证据。</p></div></article>
        </div>
      </div>

      <div className="admin-workbench-section-heading">
        <div><p className="admin-kicker">CURRENT EVIDENCE</p><h3>当前证据</h3></div>
        <span>{dateRangeLabel}</span>
      </div>
      <div className="admin-evidence-grid">
        <div><Target size={18} /><span>反馈者符合率</span><strong>{formatRate(metrics.feedback_yes, feedbackTotal)}</strong><p>{feedbackTotal} 份主动反馈，只代表反馈者</p></div>
        <div><UsersRound size={18} /><span>创作者点击率</span><strong>{formatRate(metrics.creator_link_clicked, metrics.match_result_view)}</strong><p>点击代表继续找参考，不等于认可匹配</p></div>
        <div><MessageCircle size={18} /><span>博主有效触达</span><strong>{outreach.length} / 20</strong><p>当前私有跟进台账</p></div>
        <div><ShieldCheck size={18} /><span>在线创作者</span><strong>{activeCreatorCount}</strong><p>{pendingCount} 条申请等待处理</p></div>
        <div><BarChart3 size={18} /><span>分析完成率</span><strong>{formatRate(metrics.analysis_succeeded, metrics.photo_selected)}</strong><p>低于 70% 时优先处理主流程</p></div>
        <div><CircleDot size={18} /><span>Plus 最低档曝光</span><strong>{minimumPlusExposure} / 300</strong><p>三档都满 300 前不开发真实 Plus</p></div>
      </div>

      <div className="admin-workbench-section-heading">
        <div><p className="admin-kicker">NOT NOW</p><h3>暂缓事项</h3></div>
        <span>出现新证据后再重排</span>
      </div>
      <div className="admin-workbench-paused">
        <p><Ban size={16} /><span><strong>暂停继续堆新功能</strong>男生报告和 AI 入口先保持稳定，只修故障与回归。</span></p>
        <p><Ban size={16} /><span><strong>暂停凭低符合率直接调权重</strong>当前反馈仍混合了匹配、内容价值和理解偏差。</span></p>
        <p><Ban size={16} /><span><strong>暂停真实收费与付费排名</strong>Plus 未达到每档 300 次曝光的进入条件。</span></p>
        <p><Ban size={16} /><span><strong>不做未授权扩库</strong>不抓取、不下载、不分析未获许可的创作者照片。</span></p>
      </div>
    </section>
  );
}
