import { ArrowRight, BadgeDollarSign, CalendarClock, ReceiptText, UserPlus, UsersRound } from "lucide-react";
import type { AdminCommerceOverview } from "./adminApi";

interface AdminCommercePanelProps {
  data: AdminCommerceOverview;
  onAddMembership: () => void;
}

const ORDER_STATUS: Record<string, string> = {
  created: "已创建",
  pending: "待支付",
  paid: "已支付",
  failed: "支付失败",
  refunded: "已退款",
  cancelled: "已取消",
};

const MEMBERSHIP_STATUS: Record<string, string> = {
  active: "有效",
  trialing: "试用中",
  past_due: "逾期",
  unpaid: "未付款",
  canceled: "已停止",
  incomplete: "未完成",
  incomplete_expired: "未完成并过期",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat(currency === "CNY" ? "zh-CN" : "en-US", {
    style: "currency", currency,
  }).format(amountMinor / 100);
}

function providerLabel(provider: string): string {
  if (provider === "zpay") return "支付宝";
  if (provider === "stripe") return "Stripe";
  return "人工记录";
}

function planLabel(planCode: string | null): string {
  if (planCode === "pro_monthly") return "月卡";
  if (planCode === "pro_annual") return "年卡";
  if (planCode === "report_single") return "单次报告";
  return planCode ?? "积分购买";
}

export function AdminCommercePanel({ data, onAddMembership }: AdminCommercePanelProps) {
  if (!data.available) {
    return (
      <section className="admin-commerce">
        <div className="admin-empty"><ReceiptText size={28} /><h3>经营数据接口尚未部署</h3><p>部署最新数据库迁移和管理函数后，这里会显示注册、订单和会员名单。</p></div>
      </section>
    );
  }

  const registrations = data.registrations ?? { total: 0, confirmed: 0, last30Days: 0 };
  const payments = data.payments ?? { total: 0, paid: 0, pending: 0, refunded: 0, paidCnyMinor: 0, paidUsdMinor: 0 };
  const memberships = data.memberships ?? { total: 0, active: 0, expiring7Days: 0 };
  const users = data.users ?? [];
  const orders = data.orders ?? [];
  const members = data.members ?? [];

  return (
    <section className="admin-commerce" aria-labelledby="admin-commerce-title">
      <header className="admin-commerce-heading">
        <div><p className="admin-kicker">BUSINESS OVERVIEW</p><h2 id="admin-commerce-title">用户、支付与会员</h2><p>这里只显示经营所需的账号、订单和会员状态，不读取用户照片、面部数据或报告内容。</p></div>
        <button className="admin-primary-button" type="button" onClick={onAddMembership}><UserPlus size={16} />增加会员</button>
      </header>

      <div className="admin-commerce-summary">
        <article><UsersRound size={18} /><span>注册用户</span><strong>{registrations.total}</strong><p>已确认邮箱 {registrations.confirmed} · 近 30 天新增 {registrations.last30Days}</p></article>
        <article><BadgeDollarSign size={18} /><span>已支付订单</span><strong>{payments.paid}</strong><p>总订单 {payments.total} · 待支付 {payments.pending} · 已退款 {payments.refunded}</p></article>
        <article><ReceiptText size={18} /><span>实收金额</span><strong>{formatMoney(payments.paidCnyMinor, "CNY")}</strong><p>{formatMoney(payments.paidUsdMinor, "USD")} · 不含已退款订单</p></article>
        <article><CalendarClock size={18} /><span>有效会员</span><strong>{memberships.active}</strong><p>有过会员 {memberships.total} · 7 天内到期 {memberships.expiring7Days}</p></article>
      </div>

      <section className="admin-commerce-section">
        <header><div><p className="admin-kicker">REGISTRATIONS</p><h3>最近注册</h3></div><span>最近 {users.length} 个账号</span></header>
        <div className="admin-commerce-table-wrap">
          <table className="admin-commerce-table">
            <thead><tr><th>账号</th><th>邮箱状态</th><th>注册时间</th><th>最近登录</th></tr></thead>
            <tbody>{users.length ? users.map((user) => (
              <tr key={`${user.email}-${user.createdAt}`}><td data-label="账号">{user.email ?? "无邮箱"}</td><td data-label="邮箱状态"><span className={`admin-status ${user.confirmedAt ? "admin-status-ok" : "admin-status-pending"}`}>{user.confirmedAt ? "已确认" : "待确认"}</span></td><td data-label="注册时间">{formatDate(user.createdAt)}</td><td data-label="最近登录">{formatDate(user.lastSignInAt)}</td></tr>
            )) : <tr><td colSpan={4}>暂无注册账号</td></tr>}</tbody>
          </table>
        </div>
      </section>

      <section className="admin-commerce-section">
        <header><div><p className="admin-kicker">PAYMENTS</p><h3>最近订单</h3></div><span>最近 {orders.length} 笔</span></header>
        <div className="admin-commerce-table-wrap">
          <table className="admin-commerce-table">
            <thead><tr><th>账号 / 订单</th><th>购买内容</th><th>支付方式</th><th>金额</th><th>状态</th><th>创建时间</th></tr></thead>
            <tbody>{orders.length ? orders.map((order) => (
              <tr key={order.id}><td data-label="账号 / 订单"><strong>{order.email ?? "未知账号"}</strong><small title={order.id}>{order.id.slice(0, 8)}</small></td><td data-label="购买内容">{planLabel(order.planCode ?? order.productCode)}</td><td data-label="支付方式">{providerLabel(order.provider)}</td><td data-label="金额">{formatMoney(order.amountMinor, order.currency)}</td><td data-label="状态"><span className={`admin-status ${order.status === "paid" ? "admin-status-ok" : order.status === "refunded" || order.status === "failed" ? "admin-status-error" : "admin-status-muted"}`}>{ORDER_STATUS[order.status] ?? order.status}</span></td><td data-label="创建时间">{formatDate(order.createdAt)}</td></tr>
            )) : <tr><td colSpan={6}>暂无订单</td></tr>}</tbody>
          </table>
        </div>
      </section>

      <section className="admin-commerce-section">
        <header><div><p className="admin-kicker">MEMBERSHIPS</p><h3>会员名单</h3></div><button className="admin-secondary-button" type="button" onClick={onAddMembership}>管理会员<ArrowRight size={15} /></button></header>
        <div className="admin-commerce-table-wrap">
          <table className="admin-commerce-table">
            <thead><tr><th>账号</th><th>套餐</th><th>来源</th><th>状态</th><th>到期时间</th><th>续费</th></tr></thead>
            <tbody>{members.length ? members.map((member) => (
              <tr key={`${member.email}-${member.createdAt}`}><td data-label="账号">{member.email ?? "未知账号"}</td><td data-label="套餐">{planLabel(member.planCode)}</td><td data-label="来源">{member.managementSource === "admin" ? "管理员开通" : providerLabel(member.provider)}</td><td data-label="状态"><span className={`admin-status ${member.status === "active" ? "admin-status-ok" : "admin-status-muted"}`}>{MEMBERSHIP_STATUS[member.status] ?? member.status}</span></td><td data-label="到期时间">{formatDate(member.currentPeriodEnd)}</td><td data-label="续费">{member.cancelAtPeriodEnd ? "到期停止" : member.provider === "stripe" ? "自动续费" : "手动续费"}</td></tr>
            )) : <tr><td colSpan={6}>暂无会员</td></tr>}</tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
