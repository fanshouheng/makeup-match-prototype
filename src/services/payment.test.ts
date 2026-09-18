import { describe, expect, it } from "vitest";
import { buildZpaySubmitParams, canGrantEntitlement, canRefundEntitlement, createPaymentAdapter, isFinalPaymentStatus, ZPAY_SUBMIT_URL } from "./payment";

describe("payment state rules", () => {
  it("grants entitlement only after a paid state", () => {
    expect(canGrantEntitlement("pending")).toBe(false);
    expect(canGrantEntitlement("paid")).toBe(true);
  });

  it("marks terminal states and refunds separately", () => {
    expect(isFinalPaymentStatus("pending")).toBe(false);
    expect(isFinalPaymentStatus("failed")).toBe(true);
    expect(canRefundEntitlement("refunded")).toBe(true);
    expect(canRefundEntitlement("paid")).toBe(false);
  });

  it("never simulates a checkout for an unconfigured provider", async () => {
    await expect(createPaymentAdapter("zpay").createCheckout({
      packageCode: "light",
      idempotencyKey: "test",
    })).rejects.toThrow("zpay 支付尚未完成配置");
  });

  it("builds the documented ZPAY submit fields", () => {
    expect(ZPAY_SUBMIT_URL).toBe("https://zpayz.cn/submit.php");
    expect(Object.fromEntries(buildZpaySubmitParams({ name: "Plus", money: "9.9", type: "alipay" }))).toEqual({ name: "Plus", money: "9.9", type: "alipay" });
  });
});
