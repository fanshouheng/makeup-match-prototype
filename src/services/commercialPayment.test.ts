import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../plus/plusClient", () => ({
  plusClient: { functions: { invoke: vi.fn() } },
}));

import { plusClient } from "../plus/plusClient";
import { createCommercialCheckout, createMembershipCheckout, getCommercialCatalog, getPointPackages } from "./commercialPayment";

const invoke = vi.mocked(plusClient.functions.invoke);

describe("commercial payment checkout", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("sends a stable idempotency key and preserves a ZPAY POST form", async () => {
    invoke.mockResolvedValueOnce({
      data: {
        orderId: "order-1",
        provider: "zpay",
        packageCode: "light",
        points: 30,
        status: "pending",
        checkoutUrl: "https://zpayz.cn/submit.php",
        checkoutForm: { action: "https://zpayz.cn/submit.php", fields: { pid: "123", sign: "hash" } },
      },
      error: null,
    });

    const result = await createCommercialCheckout("zpay", "light", "00000000-0000-4000-8000-000000000001");

    expect(invoke).toHaveBeenCalledWith("create-payment-checkout", {
      body: {
        provider: "zpay",
        packageCode: "light",
        idempotencyKey: "00000000-0000-4000-8000-000000000001",
      },
    });
    expect(result.checkoutForm?.action).toBe("https://zpayz.cn/submit.php");
    expect(result.checkoutForm?.fields.sign).toBe("hash");
  });

  it("explains that payment infrastructure is not deployed yet", async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(JSON.stringify({ code: "payment_not_ready" }), { status: 503 }),
      } as never,
    });

    await expect(createCommercialCheckout("stripe", "light")).rejects.toThrow("支付订单服务尚未完成部署");
  });

  it("loads the server-owned point package catalog", async () => {
    invoke.mockResolvedValueOnce({
      data: { packages: [{ code: "light", provider: "zpay", name: "轻量", points: 30, amountMinor: 990, currency: "CNY" }] },
      error: null,
    });
    await expect(getPointPackages()).resolves.toHaveLength(1);
    expect(invoke).toHaveBeenCalledWith("create-payment-checkout", { method: "GET" });
  });

  it("creates a membership checkout with the plan code and recurring product", async () => {
    invoke.mockResolvedValueOnce({
      data: {
        orderId: "order-membership-1",
        provider: "stripe",
        packageCode: "starter",
        points: 50,
        status: "pending",
        checkoutUrl: "https://checkout.stripe.com/session",
      },
      error: null,
    });

    await createMembershipCheckout("stripe", "starter", "00000000-0000-4000-8000-000000000002");
    expect(invoke).toHaveBeenCalledWith("create-payment-checkout", {
      body: {
        product: "membership",
        provider: "stripe",
        planCode: "starter",
        idempotencyKey: "00000000-0000-4000-8000-000000000002",
      },
    });
  });

  it("returns membership plans alongside legacy packages", async () => {
    invoke.mockResolvedValueOnce({
      data: {
        packages: [],
        membershipPlans: [{ code: "pro_monthly", provider: "zpay", name: "月卡", pointsPerGrant: 1000, amountMinor: 5900, billingInterval: "month", matchAccess: "daily", dailyMatchLimit: 50, currency: "CNY" }],
      },
      error: null,
    });
    await expect(getCommercialCatalog()).resolves.toMatchObject({ membershipPlans: [{ code: "pro_monthly", pointsPerGrant: 1000 }] });
  });
});
