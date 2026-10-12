import { ArrowRight, Check, CreditCard, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { onlineCheckoutEnabled } from "../config";
import {
  createMembershipCheckout,
  getCommercialCatalog,
  type CommercialPaymentProvider,
  type MembershipPlan,
} from "../services/commercialPayment";
import { recordProductEvent } from "../services/productMetrics";

const OFFERS = [
  { code: "pro_monthly", label: "月付", period: "月", description: "先用一个月，找到适合自己的妆容。",
    amounts: { zpay: 5900, stripe: 899 }, points: 1000 },
  { code: "pro_annual", label: "年付", period: "年", description: "适合长期使用，尝试更多场景与风格。",
    amounts: { zpay: 59900, stripe: 8999 }, points: 2000 },
] as const;

function money(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat(currency === "CNY" ? "zh-CN" : "en-US", {
    currency, style: "currency",
  }).format(amountMinor / 100);
}

function AlipayIcon() {
  return <img alt="" aria-hidden="true" className="alipay-icon" src="/alipay.svg" />;
}

function submitCheckoutForm(action: string, fields: Record<string, string>) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  form.style.display = "none";
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  HTMLFormElement.prototype.submit.call(form);
}

export function PaymentCheckout({ preview = false, authenticated = false }: { preview?: boolean; authenticated?: boolean }) {
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(onlineCheckoutEnabled && !preview);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const idempotencyKeys = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!onlineCheckoutEnabled || preview) return;
    let active = true;
    getCommercialCatalog()
      .then((catalog) => {
        if (!active) return;
        setPlans(catalog.membershipPlans);
      })
      .catch((nextError) => {
        if (active) setError(nextError instanceof Error ? nextError.message : "方案暂时无法读取。");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [preview]);

  async function start(code: string, provider: CommercialPaymentProvider) {
    const requestKey = `${provider}:${code}`;
    setError("");
    setBusy(requestKey);
    void recordProductEvent("membership_checkout_started");
    try {
      const idempotencyKey = idempotencyKeys.current[requestKey] ?? crypto.randomUUID();
      idempotencyKeys.current[requestKey] = idempotencyKey;
      const checkout = await createMembershipCheckout(provider, code, idempotencyKey);
      delete idempotencyKeys.current[requestKey];
      if (checkout.checkoutForm) {
        submitCheckoutForm(checkout.checkoutForm.action, checkout.checkoutForm.fields);
        return;
      }
      window.location.assign(checkout.checkoutUrl);
    } catch (nextError) {
      delete idempotencyKeys.current[requestKey];
      setError(nextError instanceof Error ? nextError.message : "支付暂时不可用。");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="payment-checkout" aria-label="购买方案">
      <div className="commercial-offer-grid">
        {OFFERS.map((offer) => {
          const annual = offer.code === "pro_annual";
          const cnyPlan = plans.find((plan) => plan.code === offer.code && plan.provider === "zpay");
          const usdPlan = plans.find((plan) => plan.code === offer.code && plan.provider === "stripe");
          const cnyAmount = cnyPlan?.amountMinor ?? offer.amounts.zpay;
          const usdAmount = usdPlan?.amountMinor ?? offer.amounts.stripe;
          const points = cnyPlan?.pointsPerGrant ?? usdPlan?.pointsPerGrant ?? offer.points;
          const dailyMatches = cnyPlan?.dailyMatchLimit ?? usdPlan?.dailyMatchLimit ?? 50;
          const monthlyAmount = plans.find((plan) => plan.code === "pro_monthly" && plan.provider === "zpay")?.amountMinor ?? OFFERS[0].amounts.zpay;
          const benefits = [
            { title: annual ? "普通匹配不限次数" : `每天 ${dailyMatches} 次普通匹配`, detail: annual ? "会员有效期内，随时寻找结构接近的授权美妆博主。" : "每天北京时间 0 点刷新；只计成功匹配，未用次数不结转。" },
            { title: `每月 ${points} 永久积分`, detail: annual ? "连续发放 12 个月，首月付款确认后到账，之后按月发放。" : "每个确认付款的月度账期发放一次。" },
            { title: `每月积分可生成 ${Math.floor(points / 100)} 份完整报告`, detail: "每份消耗 100 积分，包含面容结构说明、3 套妆造方案和公开博主线索。" },
            { title: "剩余积分永久有效", detail: "已到账积分可累积；会员到期或取消续费后，仍可用于报告。" },
            { title: "生成失败，积分退回", detail: "开始生成时预占 100 积分；生成失败或任务过期会退回。" },
            { title: "照片在本机分析", detail: "普通匹配不上传照片；报告在单独同意后只发送九项比例和场景、方向。" },
          ];
          return (
            <article className={`commercial-offer ${annual ? "is-featured" : ""}`} key={offer.code}>
              <div className="commercial-offer-heading">
                <span>MAKE UP Pro{annual ? " · 全年使用" : " · 按月使用"}</span>
                <h3>{offer.label}</h3>
                <p>{offer.description}</p>
              </div>
              <div className="commercial-plan-price">
                <p><strong>{money(cnyAmount, "CNY").replace(/\.00$/, "")}</strong><span>/ {offer.period}</span></p>
                <span>{money(usdAmount, "USD").replace("$", "US$")} / {offer.period} · 海外支付</span>
                <p className="commercial-billing-note">{annual
                  ? `一次支付全年费用，折合 ${money(cnyAmount / 12, "CNY")} / 月${monthlyAmount * 12 > cnyAmount ? `，比连续月付省 ${money(monthlyAmount * 12 - cnyAmount, "CNY").replace(/\.00$/, "")}` : ""}。`
                  : "按月支付，会员权益在当前有效账期内生效。"}</p>
              </div>
              <div className="commercial-offer-benefits">
                <p>包含以下权益</p>
                <ul>{benefits.map((benefit) => <li key={benefit.title}><Check size={17} /><div><strong>{benefit.title}</strong><p>{benefit.detail}</p></div></li>)}</ul>
              </div>
              <div className="commercial-offer-actions">
                {!onlineCheckoutEnabled && !preview ? (
                  <>
                    <a className={`button ${annual ? "button-primary" : "button-secondary"}`} href="#subscription-wechat-title">{annual ? "咨询年付方案" : "微信开通月付"}<ArrowRight size={16} /></a>
                    <p>{annual ? "年付在线购买暂未开放，可先咨询。" : "注册并确认邮箱后，通过微信人工开通。"}</p>
                  </>
                ) : (["zpay", "stripe"] as const).map((provider) => {
                  const item = plans.find((plan) => plan.code === offer.code && plan.provider === provider);
                  const requestKey = `${provider}:${offer.code}`;
                  const paymentIcon = provider === "stripe" ? <CreditCard size={15} /> : <AlipayIcon />;
                  const providerLabel = provider === "zpay" ? "支付宝" : "Stripe";
                  return !authenticated && !preview ? (
                    <a className="button button-secondary" href="/account?returnTo=/subscription" key={provider}>登录后用{providerLabel}订阅<ArrowRight size={16} /></a>
                  ) : item ? (
                    <button className="button button-secondary" disabled={Boolean(busy)} key={provider}
                      aria-label={`${providerLabel}订阅${offer.label} ${money(item.amountMinor, item.currency)} / ${offer.period}`}
                      onClick={() => void start(offer.code, provider)} type="button">
                      <span className="commercial-payment-provider">
                        {busy === requestKey ? <LoaderCircle className="spin" size={18} /> : paymentIcon}
                        <span>{providerLabel}</span>
                      </span>
                      <strong>{money(item.amountMinor, item.currency)} / {offer.period}</strong>
                    </button>
                  ) : (
                    <div aria-label={`${providerLabel}支付 ${money(offer.amounts[provider], provider === "zpay" ? "CNY" : "USD")} / ${offer.period}`} className="commercial-offer-price" key={provider}>
                      <span className="commercial-payment-provider">{paymentIcon}<span>{providerLabel}</span></span>
                      <strong>{money(offer.amounts[provider], provider === "zpay" ? "CNY" : "USD")} / {offer.period}</strong>
                      <span>{preview ? "仅供预览" : loading ? "正在读取" : "暂未开放"}</span>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
      {preview ? <p>本地临时预览不会创建订单或发放积分。</p>
        : null}
      {error && <p className="payment-checkout-error" role="alert">{error}</p>}
    </section>
  );
}
