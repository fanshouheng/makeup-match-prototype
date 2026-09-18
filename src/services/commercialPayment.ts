import { plusClient } from "../plus/plusClient";

export type CommercialPaymentProvider = "stripe" | "zpay";

export interface PointPackage {
  amountMinor: number;
  code: string;
  currency: string;
  name: string;
  points: number;
  provider: CommercialPaymentProvider;
}

export interface MembershipPlan {
  amountMinor: number;
  billingInterval: "month" | "year";
  code: string;
  currency: string;
  dailyMatchLimit: number | null;
  matchAccess: "daily" | "unlimited";
  name: string;
  pointsPerGrant: number;
  provider: CommercialPaymentProvider;
  stripePriceIdConfigured?: boolean;
}

export interface CommercialCatalog {
  packages: PointPackage[];
  membershipPlans: MembershipPlan[];
}

export interface CommercialCheckoutForm {
  action: string;
  fields: Record<string, string>;
}

export interface CheckoutResponse {
  orderId: string;
  provider: CommercialPaymentProvider;
  packageCode: string;
  points: number;
  status: "pending";
  checkoutUrl: string;
  checkoutForm?: CommercialCheckoutForm;
}

function errorForCode(code: string | undefined): Error {
  if (code === "auth_required") return new Error("请先登录并完成邮箱确认。");
  if (code === "email_not_confirmed") return new Error("请先完成邮箱确认，再开始支付。");
  if (code === "stripe_not_configured") return new Error("Stripe 尚未完成服务器配置，暂时请使用人工确认方式。");
  if (code === "zpay_not_configured") return new Error("支付宝支付尚未完成服务器配置，暂时请使用其他支付方式。");
  if (code === "payment_catalog_not_configured") return new Error("当前支付金额尚未完成服务器配置。");
  if (code === "package_not_found") return new Error("这个积分套餐当前不可购买，请刷新后重试。");
  if (code === "membership_plan_not_found") return new Error("这个会员方案当前不可购买，请刷新后重试。");
  if (code === "subscription_already_active") return new Error("当前账号已有 Stripe 会员，请在本期结束后再选择新方案。");
  if (code === "membership_not_ready") return new Error("会员方案服务尚未完成部署。");
  if (code === "payment_not_ready") return new Error("支付订单服务尚未完成部署。");
  if (code === "checkout_create_failed") return new Error("支付页面创建失败，请稍后重试。");
  if (code === "idempotency_key_reused") return new Error("支付请求已被其他订单占用，请重新开始。");
  if (code === "payment_order_pending") return new Error("已有支付请求正在处理中，请稍后刷新。");
  if (code === "payment_order_not_payable") return new Error("这笔支付订单已经结束，请重新开始。");
  return new Error("支付服务暂时不可用，请稍后重试。");
}

export async function createCommercialCheckout(
  provider: CommercialPaymentProvider,
  packageCode: string,
  idempotencyKey: string = crypto.randomUUID(),
): Promise<CheckoutResponse> {
  const { data, error } = await plusClient.functions.invoke("create-payment-checkout", {
    body: { provider, packageCode, idempotencyKey },
  });
  if (!error) return data as CheckoutResponse;

  let code: string | undefined;
  if ("context" in error && error.context instanceof Response) {
    const payload = await error.context.clone().json().catch(() => undefined) as { code?: string } | undefined;
    code = payload?.code;
  }
  throw errorForCode(code);
}

export async function getPointPackages(): Promise<PointPackage[]> {
  const catalog = await getCommercialCatalog();
  return catalog.packages;
}

export async function getCommercialCatalog(): Promise<CommercialCatalog> {
  const { data, error } = await plusClient.functions.invoke("create-payment-checkout", {
    method: "GET",
  });
  if (!error) {
    const payload = data as { packages?: PointPackage[]; membershipPlans?: MembershipPlan[] };
    return { packages: payload.packages ?? [], membershipPlans: payload.membershipPlans ?? [] };
  }
  let code: string | undefined;
  if ("context" in error && error.context instanceof Response) {
    const payload = await error.context.clone().json().catch(() => undefined) as { code?: string } | undefined;
    code = payload?.code;
  }
  throw errorForCode(code);
}

export async function createMembershipCheckout(
  provider: CommercialPaymentProvider,
  planCode: string,
  idempotencyKey: string = crypto.randomUUID(),
): Promise<CheckoutResponse> {
  const { data, error } = await plusClient.functions.invoke("create-payment-checkout", {
    body: { product: "membership", provider, planCode, idempotencyKey },
  });
  if (!error) return data as CheckoutResponse;
  let code: string | undefined;
  if ("context" in error && error.context instanceof Response) {
    const payload = await error.context.clone().json().catch(() => undefined) as { code?: string } | undefined;
    code = payload?.code;
  }
  throw errorForCode(code);
}
