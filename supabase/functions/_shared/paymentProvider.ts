export interface StripeOrderDetails {
  orderId: string;
  providerOrderId: string;
}

export interface StripePaymentDetails extends StripeOrderDetails {
  amountMinor: number;
  currency: string;
  paid: boolean;
}

export interface StripeRefundDetails {
  amountMinor: number;
  currency?: string;
  orderId?: string;
  providerPaymentId?: string;
  refundId: string;
  status?: string;
}

function eventObject(event: Record<string, unknown>): Record<string, unknown> | undefined {
  const data = event.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return undefined;
  const object = (data as Record<string, unknown>).object;
  if (typeof object !== "object" || object === null || Array.isArray(object)) return undefined;
  return object as Record<string, unknown>;
}

export function parseZpayAmountMinor(value: string): number | undefined {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return undefined;
  const cents = (match[2] ?? "").padEnd(2, "0");
  const amount = Number(`${match[1]}${cents}`);
  return Number.isSafeInteger(amount) ? amount : undefined;
}

export function stripeOrderDetails(event: Record<string, unknown>): StripeOrderDetails | undefined {
  const value = eventObject(event);
  if (!value) return undefined;
  const metadata = value.metadata;
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return undefined;
  const orderId = (metadata as Record<string, unknown>).order_id;
  const providerOrderId = typeof value.payment_intent === "string" ? value.payment_intent : value.id;
  return typeof orderId === "string" && typeof providerOrderId === "string"
    ? { orderId, providerOrderId }
    : undefined;
}

export function stripePaymentDetails(event: Record<string, unknown>): StripePaymentDetails | undefined {
  const value = eventObject(event);
  const order = stripeOrderDetails(event);
  if (!value || !order) return undefined;
  const amountMinor = typeof value.amount_total === "number" ? value.amount_total : value.amount_received;
  const currency = typeof value.currency === "string" ? value.currency.toUpperCase() : undefined;
  if (typeof amountMinor !== "number" || !Number.isSafeInteger(amountMinor) || amountMinor <= 0 ||
    !currency || !/^[A-Z]{3}$/.test(currency)) return undefined;
  const paid = typeof value.payment_status === "string"
    ? value.payment_status === "paid"
    : value.status === "succeeded";
  return { ...order, amountMinor, currency, paid };
}

export function stripeRefundDetails(event: Record<string, unknown>): StripeRefundDetails | undefined {
  const value = eventObject(event);
  if (!value || typeof value.id !== "string") return undefined;
  const metadata = value.metadata;
  const orderId = typeof metadata === "object" && metadata !== null && !Array.isArray(metadata) &&
      typeof (metadata as Record<string, unknown>).order_id === "string"
    ? (metadata as Record<string, string>).order_id
    : undefined;
  const amountMinor = typeof value.amount_refunded === "number" ? value.amount_refunded : value.amount;
  if (typeof amountMinor !== "number" || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) return undefined;
  return {
    amountMinor,
    currency: typeof value.currency === "string" ? value.currency.toUpperCase() : undefined,
    orderId,
    providerPaymentId: typeof value.payment_intent === "string" ? value.payment_intent : undefined,
    refundId: value.id,
    status: typeof value.status === "string" ? value.status : undefined,
  };
}
