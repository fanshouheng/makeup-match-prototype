import { plusClient } from "../plus/plusClient";

export interface CommercialPaymentStatus {
  id: string;
  product: "points" | "membership";
  packageCode: string;
  points: number;
  status: "created" | "pending" | "paid" | "failed" | "refunded" | "cancelled";
  amountMinor: number;
  currency: string;
  paidAt: string | null;
}

export interface CommercialSubscriptionStatus {
  id: string;
  provider: "stripe" | "zpay";
  planCode: string;
  status: "active" | "trialing" | "past_due" | "unpaid" | "canceled" | "incomplete" | "incomplete_expired";
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  endedAt: string | null;
}

function statusError(code: string | undefined): Error {
  if (code === "payment_not_found") return new Error("找不到这笔支付订单。");
  if (code === "payment_not_ready") return new Error("支付状态服务尚未完成部署。");
  return new Error("支付状态暂时无法读取，请稍后刷新。");
}

export async function getCommercialPaymentStatus(
  lookup: string | { provider: "zpay"; providerOrderId: string },
): Promise<CommercialPaymentStatus> {
  const body = typeof lookup === "string" ? { orderId: lookup } : lookup;
  const { data, error } = await plusClient.functions.invoke("payment-status", { body });
  if (!error) return (data as { order: CommercialPaymentStatus }).order;
  let code: string | undefined;
  if ("context" in error && error.context instanceof Response) {
    const payload = await error.context.clone().json().catch(() => undefined) as { code?: string } | undefined;
    code = payload?.code;
  }
  throw statusError(code);
}

export async function getCommercialSubscriptionStatus(): Promise<CommercialSubscriptionStatus | null> {
  const { data, error } = await plusClient.functions.invoke("payment-status", { body: { subscription: true } });
  if (!error) return (data as { subscription: CommercialSubscriptionStatus | null }).subscription;
  let code: string | undefined;
  if ("context" in error && error.context instanceof Response) {
    const payload = await error.context.clone().json().catch(() => undefined) as { code?: string } | undefined;
    code = payload?.code;
  }
  throw statusError(code);
}
