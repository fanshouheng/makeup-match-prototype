import { Check, CreditCard, LoaderCircle, WalletCards } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { onlineCheckoutEnabled } from "../config";
import {
  createCommercialCheckout,
  createMembershipCheckout,
  getCommercialCatalog,
  type CommercialPaymentProvider,
  type MembershipPlan,
  type PointPackage,
} from "../services/commercialPayment";
import { recordProductEvent } from "../services/productMetrics";

const OFFERS = [
  { code: "report_single", kind: "points" as const, label: "单次报告", eyebrow: "一次购买",
    prices: { zpay: "¥19.9", stripe: "US$2.99" },
    benefits: ["100 永久积分", "刚好生成 1 份完整报告", "不自动续费"] },
  { code: "pro_monthly", kind: "membership" as const, label: "月卡", eyebrow: "按月使用",
    prices: { zpay: "¥59 / 月", stripe: "US$8.99 / 月" },
    benefits: ["每个付费账期发 1000 永久积分", "每天 50 次普通匹配", "每日次数不结转"] },
  { code: "pro_annual", kind: "membership" as const, label: "年卡", eyebrow: "全年使用",
    prices: { zpay: "¥599 / 年", stripe: "US$89.99 / 年" },
    benefits: ["连续 12 个月每月发 2000 永久积分", "有效期内普通匹配不限次数", "积分按月发放，不一次性预发"] },
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

export function PaymentCheckout({ preview = false }: { preview?: boolean }) {
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [packages, setPackages] = useState<PointPackage[]>([]);
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
        setPackages(catalog.packages);
      })
      .catch((nextError) => {
        if (active) setError(nextError instanceof Error ? nextError.message : "方案暂时无法读取。");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [preview]);

  async function start(kind: "points" | "membership", code: string, provider: CommercialPaymentProvider) {
    const requestKey = `${kind}:${provider}:${code}`;
    setError("");
    setBusy(requestKey);
    void recordProductEvent(kind === "membership" ? "membership_checkout_started" : "points_checkout_started");
    try {
      const idempotencyKey = idempotencyKeys.current[requestKey] ?? crypto.randomUUID();
      idempotencyKeys.current[requestKey] = idempotencyKey;
      const checkout = kind === "membership"
        ? await createMembershipCheckout(provider, code, idempotencyKey)
        : await createCommercialCheckout(provider, code, idempotencyKey);
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
      <div className="payment-checkout-copy">
        <div><WalletCards size={18} /><strong>选择适合你的使用方式</strong></div>
        <p>报告每份消耗 100 积分；所有已到账积分永久有效。支持支付宝人民币支付和 Stripe 海外支付。</p>
      </div>
      <div className="commercial-offer-grid">
        {OFFERS.map((offer) => (
          <article className={`commercial-offer ${offer.code === "pro_annual" ? "is-featured" : ""}`} key={offer.code}>
            <div className="commercial-offer-heading"><span>{offer.eyebrow}</span><h3>{offer.label}</h3></div>
            <ul>{offer.benefits.map((benefit) => <li key={benefit}><Check size={14} />{benefit}</li>)}</ul>
            <div className="commercial-offer-actions">
              {(["zpay", "stripe"] as const).map((provider) => {
                const item = offer.kind === "membership"
                  ? plans.find((plan) => plan.code === offer.code && plan.provider === provider)
                  : packages.find((entry) => entry.code === offer.code && entry.provider === provider);
                const requestKey = `${offer.kind}:${provider}:${offer.code}`;
                const paymentIcon = provider === "stripe" ? <CreditCard size={15} /> : <AlipayIcon />;
                const providerLabel = provider === "zpay" ? "支付宝" : "Stripe";
                return item ? (
                  <button className="button button-secondary" disabled={Boolean(busy)} key={provider}
                    aria-label={`${providerLabel}支付 ${money("amountMinor" in item ? item.amountMinor : 0, item.currency)}`}
                    onClick={() => void start(offer.kind, offer.code, provider)} type="button">
                    <span className="commercial-payment-provider">
                      {busy === requestKey ? <LoaderCircle className="spin" size={18} /> : paymentIcon}
                      <span>{providerLabel}</span>
                    </span>
                    <strong>{money("amountMinor" in item ? item.amountMinor : 0, item.currency)}</strong>
                  </button>
                ) : (
                  <div aria-label={`${providerLabel}支付 ${offer.prices[provider]}`} className="commercial-offer-price" key={provider}>
                    <span className="commercial-payment-provider">{paymentIcon}<span>{providerLabel}</span></span>
                    <strong>{offer.prices[provider]}</strong>
                    <span>{preview ? "仅供预览" : loading ? "正在读取" : "暂未开放"}</span>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
      {preview ? <p>本地临时预览不会创建订单或发放积分。</p>
        : !onlineCheckoutEnabled ? <p>线上支付将在安全验收通过后开放。</p> : null}
      {error && <p className="payment-checkout-error" role="alert">{error}</p>}
    </section>
  );
}
