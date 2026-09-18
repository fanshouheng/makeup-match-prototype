export type PaymentProvider = "stripe" | "zpay" | "manual";
export type PaymentProduct = "points";
export type PaymentStatus = "created" | "pending" | "paid" | "failed" | "refunded" | "cancelled";

export interface PaymentOrder {
  id: string;
  packageCode: string;
  points: number;
  provider: PaymentProvider;
  product: PaymentProduct;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  checkoutUrl?: string;
}

export interface PaymentProviderAdapter {
  readonly provider: PaymentProvider;
  createCheckout(input: {
    packageCode: string;
    idempotencyKey: string;
  }): Promise<PaymentOrder>;
}

export function unsupportedPaymentProvider(provider: PaymentProvider): Error {
  return new Error(`${provider} 支付尚未完成配置。`);
}

export function createPaymentAdapter(provider: PaymentProvider): PaymentProviderAdapter {
  return {
    provider,
    async createCheckout() {
      throw unsupportedPaymentProvider(provider);
    },
  };
}

export const ZPAY_SUBMIT_URL = "https://zpayz.cn/submit.php";

export function buildZpaySubmitParams(input: {
  name: string;
  money: string;
  type: string;
}): URLSearchParams {
  const params = new URLSearchParams();
  params.set("name", input.name);
  params.set("money", input.money);
  params.set("type", input.type);
  return params;
}

export function isFinalPaymentStatus(status: PaymentStatus): boolean {
  return status === "paid" || status === "failed" || status === "refunded" || status === "cancelled";
}

export function canGrantEntitlement(status: PaymentStatus): boolean {
  return status === "paid";
}

export function canRefundEntitlement(status: PaymentStatus): boolean {
  return status === "refunded";
}
