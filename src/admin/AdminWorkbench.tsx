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
    actions: ["先收集 50 条有效负反馈", "按四类固定原因拆清问题", "样本达标后只处理最高频原因"],
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
    title: "维持合规供给",
    outcome: "处理已有申请和授权，不在原因未明时盲目扩库。",
    actions: ["继续处理主动入驻申请", "不把低符合率直接归因于库太小", "只有“博主不像”最高时才检查覆盖"],
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

  return (
    <section className="admin-workbench" aria-labelledby="admin-workbench-title">
      <div className="admin-workbench-focus">
        <div>
          <p className="admin-kicker">NOW / CORE VALUE</p>
          <h2 id="admin-workbench-title">先弄清用户为什么说“不符合”</h2>
          <p>在调算法、加收费 AI 或扩充博主库前，先分清是分析不对、博主不像、风格不适合，还是没有解决真实化妆问题。</p>
          <button className="admin-secondary-button" type="button" onClick={() => onNavigate("metrics")}>
            <BarChart3 size={16} />查看当前数据<ArrowRight size={15} />
          </button>
        </div>
        <div className="admin-workbench-exit">
          <span>本轮退出条件</span>
          <strong>收集 50 条有效负反馈</strong>
          <ul>
            <li><CheckCircle2 size={15} />每条至少选择一个固定原因</li>
            <li><CheckCircle2 size={15} />只比较四类原因的选择次数</li>
            <li><CheckCircle2 size={15} />只处理达到样本线后的最高频问题</li>
          </ul>
        </div>
      </div>

      <div className="admin-workbench-section-heading">
        <div><p className="admin-kicker">NEXT ACTIONS</p><h3>今天先做</h3></div>
        <span>按顺序推进，不并行开新实验</span>
      </div>
      <ol className="admin-workbench-actions">
        <li><span>01</span><div><strong>检查结构化负反馈是否正常入库</strong><p>确认原因完整、没有照片和面部数据，并观察距离 50 条还差多少。</p></div><button className="admin-secondary-button" type="button" onClick={() => onNavigate("metrics")}><BarChart3 size={15} />看原因分布</button></li>
        <li><span>02</span><div><strong>让目标用户完成一次结果反馈</strong><p>只要求真实使用后选择符合或不符合；不符合时至少选择一个原因。</p></div><em>核心证据</em></li>
        <li><span>03</span><div><strong>只维护已有授权与主动申请</strong><p>先暂停主动扩库，不把尚未定位的问题解释成创作者数量不足。</p></div><button className="admin-secondary-button" type="button" onClick={() => onNavigate("pending")}><MessageCircle size={15} />看待审申请</button></li>
        <li><span>04</span><div><strong>暂停收费 AI 功能开发</strong><p>只修主流程故障，直到 50 条有效负反馈给出明确的最高频问题。</p></div><em>不并行开发</em></li>
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
            <div><dt>唯一动作</dt><dd>完成匹配后选择“符合”或“不符合”</dd></div>
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
        <div><CircleDot size={18} /><span>有效负反馈</span><strong>{metrics.negative_feedback.valid_responses} / 50</strong><p>满 50 条前不根据原因分布改产品</p></div>
      </div>

      <div className="admin-workbench-section-heading">
        <div><p className="admin-kicker">NOT NOW</p><h3>暂缓事项</h3></div>
        <span>出现新证据后再重排</span>
      </div>
      <div className="admin-workbench-paused">
        <p><Ban size={16} /><span><strong>暂停收费 AI 功能开发</strong>现有入口只保持稳定，不继续扩展能力。</span></p>
        <p><Ban size={16} /><span><strong>暂停凭低符合率直接调权重</strong>当前反馈仍混合了匹配、内容价值和理解偏差。</span></p>
        <p><Ban size={16} /><span><strong>暂停扩展自动收费与付费排名</strong>当前只运行 ¥9.9 邀请制人工内测，付款不会改变免费匹配排名。</span></p>
        <p><Ban size={16} /><span><strong>暂停盲目扩充博主库</strong>继续处理主动授权申请；只有“博主不像”最多时才检查覆盖和排序。</span></p>
      </div>
    </section>
  );
}
