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
import type { AdminPaymentSummary, AdminProductMetrics } from "./adminApi";

export type AdminWorkbenchTarget = "metrics" | "outreach" | "pending" | "plus";

interface AdminWorkbenchProps {
  metrics: AdminProductMetrics;
  dateRangeLabel: string;
  paymentSummary: AdminPaymentSummary;
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
    title: "跑通会员与账期",
    outcome: "Stripe 与支付宝付款后每月积分准确到账，重复通知不重复发分，退款不破坏余额。",
    actions: ["先完成两家供应商真实小额订单", "验证重复回调与全额退款", "支付验收前保持线上开关关闭"],
  },
  {
    index: "02",
    priority: "P1",
    title: "验证报告付费价值",
    outcome: "购买的积分在 7 天内用于完整报告，并成功保存到用户本机。",
    actions: ["观察报告创建到本机保存", "核对失败退分和人工支持成本", "至少 20 笔支付或 4 周后判断套餐"],
  },
  {
    index: "03",
    priority: "P1",
    title: "验证邀请增长",
    outcome: "免费次数用完后，用户愿意完成有效邀请并继续使用普通匹配。",
    actions: ["观察邀请发出到有效完成", "核对双方权益到账", "不把链接点击当作有效邀请"],
  },
] as const;

export function AdminWorkbench({
  metrics,
  dateRangeLabel,
  paymentSummary,
  onNavigate,
}: AdminWorkbenchProps) {
  return (
    <section className="admin-workbench" aria-labelledby="admin-workbench-title">
      <div className="admin-workbench-focus">
        <div>
          <p className="admin-kicker">NOW / CORE VALUE</p>
          <h2 id="admin-workbench-title">先把会员、账期、消费和交付跑成一条线</h2>
          <p>默认看会员结算、真实订单、报告交付和邀请增长；主动反馈只用于定位具体故障，不外推整体满意度。</p>
          <button className="admin-secondary-button" type="button" onClick={() => onNavigate("metrics")}>
            <BarChart3 size={16} />查看当前数据<ArrowRight size={15} />
          </button>
        </div>
        <div className="admin-workbench-exit">
          <span>本轮退出条件</span>
          <strong>完成一条可核对的会员商业化证据链</strong>
          <ul>
            <li><CheckCircle2 size={15} />支付成功与积分到账一致</li>
            <li><CheckCircle2 size={15} />报告消费可聚合核对</li>
            <li><CheckCircle2 size={15} />失败退分与退款结果可验证</li>
          </ul>
        </div>
      </div>

      <div className="admin-workbench-section-heading">
        <div><p className="admin-kicker">NEXT ACTIONS</p><h3>今天先做</h3></div>
        <span>按顺序推进，不并行开新实验</span>
      </div>
      <ol className="admin-workbench-actions">
        <li><span>01</span><div><strong>部署前修复迁移历史</strong><p>只对齐远程与本地迁移版本，不强推未知迁移，也不提前打开支付入口。</p></div><em>上线阻塞</em></li>
        <li><span>02</span><div><strong>验收 Stripe 与支付宝</strong><p>分别完成首期会员、账期回调、重复通知、积分到账和退款测试。</p></div><button className="admin-secondary-button" type="button" onClick={() => onNavigate("metrics")}><BarChart3 size={15} />看支付聚合</button></li>
        <li><span>03</span><div><strong>检查积分消费闭环</strong><p>完整报告消耗 10 分；成功确认消费，失败或过期只退一次。</p></div><button className="admin-secondary-button" type="button" onClick={() => onNavigate("plus")}><Target size={15} />管理积分</button></li>
        <li><span>04</span><div><strong>开始首轮套餐验证</strong><p>至少 20 笔真实支付或 4 周，按较晚到达者复核套餐选择、7 日内使用和退款。</p></div><em>首轮证据</em></li>
      </ol>

      <div className="admin-workbench-section-heading">
        <div><p className="admin-kicker">CURRENT LOOPS</p><h3>三个商业化闭环</h3></div>
        <span>支付、报告和邀请分别统计</span>
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
        <div><p className="admin-kicker">ACQUISITION</p><h3>获客内容约束</h3></div>
        <span>获客服务于真实闭环，不只追播放量</span>
      </div>
      <div className="admin-promotion">
        <article className="admin-promotion-plan">
          <div className="admin-promotion-label"><Megaphone size={17} /><span>当前内容边界</span><em>女性妆容用户</em></div>
          <h4>一次只验证一个真实问题</h4>
          <blockquote>“根据部分面部结构，缩小值得参考的妆容方向。”</blockquote>
          <dl>
            <div><dt>对象</dt><dd>正在找妆容参考的女性用户</dd></div>
            <div><dt>唯一动作</dt><dd>完成匹配并提交真实反馈</dd></div>
            <div><dt>可用素材</dt><dd>自有、生成或已明确授权的演示素材</dd></div>
            <div><dt>复盘触发</dt><dd>发布前明确样本窗口和停止规则</dd></div>
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
        <div><Target size={18} /><span>积分结算入口</span><strong>{metrics.points_checkout_started ?? 0}</strong><p>{metrics.points_page_viewed ?? 0} 次积分页访问</p></div>
        <div><UsersRound size={18} /><span>真实支付订单</span><strong>{paymentSummary.order_count ?? 0}</strong><p>已支付 {paymentSummary.by_status?.paid ?? 0} · 已退款 {paymentSummary.by_status?.refunded ?? 0}</p></div>
        <div><MessageCircle size={18} /><span>报告本机保存</span><strong>{metrics.plus_report_saved_local ?? 0}</strong><p>报告成功 {metrics.plus_job_succeeded ?? 0} · 失败 {metrics.plus_job_failed ?? 0}</p></div>
        <div><ShieldCheck size={18} /><span>历史独立推荐点击</span><strong>{metrics.ai_creator_name_clicked ?? 0}</strong><p>退役前成功 {metrics.ai_discovery_succeeded ?? 0}</p></div>
        <div><BarChart3 size={18} /><span>分析完成率</span><strong>{formatRate(metrics.analysis_succeeded, metrics.photo_selected)}</strong><p>低于 70% 时优先处理主流程</p></div>
        <div><CircleDot size={18} /><span>创作者点击率</span><strong>{formatRate(metrics.creator_link_clicked, metrics.match_result_view)}</strong><p>点击代表继续找参考，不等于认可匹配</p></div>
      </div>

      <div className="admin-workbench-section-heading">
        <div><p className="admin-kicker">NOT NOW</p><h3>暂缓事项</h3></div>
        <span>出现新证据后再重排</span>
      </div>
      <div className="admin-workbench-paused">
        <p><Ban size={16} /><span><strong>暂停新增积分玩法</strong>首版不做签到、等级、积分商城、转赠或有效期。</span></p>
        <p><Ban size={16} /><span><strong>暂停凭低符合率直接调权重</strong>当前反馈仍混合了匹配、内容价值和理解偏差。</span></p>
        <p><Ban size={16} /><span><strong>暂停付费排名</strong>会员只改变积分额度和账期权益，付款不会改变普通匹配排序。</span></p>
        <p><Ban size={16} /><span><strong>暂停盲目扩充博主库</strong>继续处理主动授权申请；只有“博主不像”最多时才检查覆盖和排序。</span></p>
      </div>
    </section>
  );
}
