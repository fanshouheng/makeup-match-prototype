import { CalendarPlus, CreditCard, LoaderCircle, Search, ShieldCheck, SquarePen, UserRound, WalletCards } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  cancelAdminMembership,
  getAdminMembershipCatalog,
  grantAdminMembershipMonth,
  lookupAdminMembership,
  updateAdminMembershipPlan,
  type AdminMembershipPlan,
  type AdminMembershipStatus,
} from "./adminApi";

function formatDate(value: string | null): string {
  return value ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(value)) : "未设置";
}

function statusLabel(status: AdminMembershipStatus["subscription"]): string {
  if (!status) return "尚未开通";
  return ({
    active: "有效",
    trialing: "试用中",
    past_due: "待补款",
    unpaid: "未付款",
    canceled: "已停止",
    incomplete: "未完成",
    incomplete_expired: "已失效",
  } as const)[status.status];
}

export function AdminMembershipPanel() {
  const [plans, setPlans] = useState<AdminMembershipPlan[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [membership, setMembership] = useState<AdminMembershipStatus | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<"grant" | "cancel" | "">("");
  const [cancelConfirmation, setCancelConfirmation] = useState("");
  const [planBusy, setPlanBusy] = useState(false);
  const [planName, setPlanName] = useState("MAKE UP Pro");
  const [monthlyPoints, setMonthlyPoints] = useState("1000");
  const [zpayPrice, setZpayPrice] = useState("59.00");
  const [stripePrice, setStripePrice] = useState("8.99");
  const [planActive, setPlanActive] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const actionKeys = useRef<Record<string, string>>({});

  function applyPlans(nextPlans: AdminMembershipPlan[]) {
    setPlans(nextPlans);
    const zpay = nextPlans.find((plan) => plan.provider === "zpay");
    const stripe = nextPlans.find((plan) => plan.provider === "stripe");
    const primary = zpay ?? stripe;
    if (primary) {
      setPlanName(primary.name);
      setMonthlyPoints(String(primary.monthlyPoints));
      setPlanActive(nextPlans.every((plan) => plan.isActive));
    }
    if (zpay) setZpayPrice((zpay.monthlyAmountMinor / 100).toFixed(2));
    if (stripe) setStripePrice((stripe.monthlyAmountMinor / 100).toFixed(2));
  }

  useEffect(() => {
    let active = true;
    getAdminMembershipCatalog()
      .then((nextPlans) => { if (active) applyPlans(nextPlans); })
      .catch((nextError) => { if (active) setError(nextError instanceof Error ? nextError.message : "套餐读取失败。"); })
      .finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, []);

  async function lookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLookupBusy(true);
    setMembership(null);
    setMessage("");
    setError("");
    setCancelConfirmation("");
    try {
      setMembership(await lookupAdminMembership(email));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "会员查询失败。");
    } finally {
      setLookupBusy(false);
    }
  }

  async function manage(action: "grant" | "cancel") {
    if (!membership) return;
    setActionBusy(action);
    setMessage("");
    setError("");
    const key = actionKeys.current[action] ?? crypto.randomUUID();
    actionKeys.current[action] = key;
    try {
      const next = action === "grant"
        ? await grantAdminMembershipMonth(membership.email, key)
        : await cancelAdminMembership(membership.email, key);
      setMembership(next);
      setMessage(action === "grant"
        ? `已延长 1 个月并发放套餐积分，当前余额 ${next.points} 积分。`
        : "会员已停止，已发放积分保持不变。");
      delete actionKeys.current[action];
      setCancelConfirmation("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "会员操作失败。");
    } finally {
      setActionBusy("");
    }
  }

  async function savePlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPlanBusy(true);
    setMessage("");
    setError("");
    const key = actionKeys.current.plan ?? crypto.randomUUID();
    actionKeys.current.plan = key;
    try {
      const nextPlans = await updateAdminMembershipPlan({
        name: planName,
        monthlyPoints: Number(monthlyPoints),
        zpayAmountMinor: Math.round(Number(zpayPrice) * 100),
        stripeAmountMinor: Math.round(Number(stripePrice) * 100),
        isActive: planActive,
      }, key);
      applyPlans(nextPlans);
      delete actionKeys.current.plan;
      setMessage("套餐设置已保存，前端目录将在下次读取时使用新配置。");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "套餐保存失败。");
    } finally {
      setPlanBusy(false);
    }
  }

  const currentPlanPoints = plans.find((plan) => plan.provider === "zpay")?.monthlyPoints ?? (Number(monthlyPoints) || 0);
  const hasOpenMembership = Boolean(membership?.subscription && ["active", "trialing", "past_due", "unpaid", "incomplete"].includes(membership.subscription.status));

  return (
    <section className="admin-membership" aria-labelledby="admin-membership-title">
      <header className="admin-membership-heading">
        <div><p className="admin-kicker">MEMBERSHIP / CATALOG</p><h2 id="admin-membership-title">会员与套餐</h2><p>人工会员操作和套餐变更都会写入审计记录。不要在这里保存付款凭证或聊天内容。</p></div>
        <div className="admin-data-badge"><ShieldCheck size={18} /><span>月卡人工管理<br /><small>MAKE UP Pro</small></span></div>
      </header>

      <div className="admin-membership-layout">
        <section className="admin-membership-tool" aria-labelledby="manual-membership-title">
          <div><p className="admin-kicker">MANUAL MEMBERSHIP</p><h3 id="manual-membership-title"><UserRound size={20} />手动管理会员</h3><p>按已确认邮箱查询。每次人工开通只增加一个月并发放当期套餐积分。</p></div>
          <form className="admin-membership-search" onSubmit={lookup}>
            <label htmlFor="membership-email">用户账号邮箱</label>
            <div><input id="membership-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /><button className="admin-primary-button" disabled={lookupBusy} type="submit">{lookupBusy ? <LoaderCircle className="admin-spin" size={16} /> : <Search size={16} />}查询</button></div>
          </form>

          {membership && (
            <div className="admin-membership-result">
              <dl>
                <div><dt>账号</dt><dd>{membership.email}</dd></div>
                <div><dt>积分余额</dt><dd>{membership.points}</dd></div>
                <div><dt>会员状态</dt><dd>{statusLabel(membership.subscription)}</dd></div>
                <div><dt>有效期至</dt><dd>{formatDate(membership.subscription?.currentPeriodEnd ?? null)}</dd></div>
                <div><dt>开通来源</dt><dd>{membership.subscription ? membership.subscription.managementSource === "admin" ? "管理员手动" : membership.subscription.provider === "stripe" ? "Stripe" : "支付宝" : "无"}</dd></div>
              </dl>
              <div className="admin-membership-actions">
                <button className="admin-primary-button" disabled={Boolean(actionBusy)} onClick={() => void manage("grant")} type="button">{actionBusy === "grant" ? <LoaderCircle className="admin-spin" size={16} /> : <CalendarPlus size={16} />}开通 / 延长 1 个月并发 {currentPlanPoints} 积分</button>
                <label htmlFor="membership-stop-confirmation">输入 STOP 停止当前会员<input id="membership-stop-confirmation" value={cancelConfirmation} onChange={(event) => setCancelConfirmation(event.target.value.toUpperCase())} /></label>
                <button className="admin-danger-button" disabled={Boolean(actionBusy) || cancelConfirmation !== "STOP" || !hasOpenMembership} onClick={() => void manage("cancel")} type="button">{actionBusy === "cancel" ? <LoaderCircle className="admin-spin" size={16} /> : null}停止会员</button>
              </div>
            </div>
          )}
        </section>

        <section className="admin-membership-tool" aria-labelledby="membership-plan-title">
          <div><p className="admin-kicker">PLAN SETTINGS</p><h3 id="membership-plan-title"><SquarePen size={20} />设置月卡套餐</h3><p>保存时只更新支付宝与 Stripe 的月卡目录；年卡仍使用已审核的固定价格和权益。</p></div>
          {catalogLoading ? <p className="admin-membership-loading"><LoaderCircle className="admin-spin" size={17} />正在读取套餐…</p> : (
            <form className="admin-membership-plan-form" onSubmit={savePlan}>
              <label>套餐名称<input maxLength={80} minLength={2} required value={planName} onChange={(event) => setPlanName(event.target.value)} /></label>
              <label>每月积分<input min="1" max="100000" step="1" required type="number" value={monthlyPoints} onChange={(event) => setMonthlyPoints(event.target.value)} /></label>
              <label><span><WalletCards size={15} />支付宝月费（人民币元）</span><input min="0.01" step="0.01" required type="number" value={zpayPrice} onChange={(event) => setZpayPrice(event.target.value)} /></label>
              <label><span><CreditCard size={15} />Stripe 月费（美元）</span><input min="0.01" step="0.01" required type="number" value={stripePrice} onChange={(event) => setStripePrice(event.target.value)} /></label>
              <label className="admin-membership-toggle"><input checked={planActive} type="checkbox" onChange={(event) => setPlanActive(event.target.checked)} /><span>开放套餐目录</span></label>
              <button className="admin-primary-button" disabled={planBusy} type="submit">{planBusy ? <LoaderCircle className="admin-spin" size={16} /> : <SquarePen size={16} />}保存套餐</button>
              <p>关闭目录只会阻止新支付，不会取消现有订阅，也不会回收已经发放的积分。</p>
            </form>
          )}
        </section>
      </div>

      {message && <div className="admin-membership-message" role="status">{message}</div>}
      {error && <div className="admin-alert" role="alert">{error}</div>}
    </section>
  );
}
