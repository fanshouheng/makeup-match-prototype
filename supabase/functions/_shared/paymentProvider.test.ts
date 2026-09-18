import { describe, expect, it } from "vitest";
import { parseZpayAmountMinor, stripeOrderDetails, stripePaymentDetails, stripeRefundDetails } from "./paymentProvider";

describe("payment provider payload parsing", () => {
  it("parses ZPAY decimal amounts without floating-point rounding", () => {
    expect(parseZpayAmountMinor("9.90")).toBe(990);
    expect(parseZpayAmountMinor("9.9")).toBe(990);
    expect(parseZpayAmountMinor("9.999")).toBeUndefined();
  });

  it("maps a Checkout Session to its PaymentIntent", () => {
    expect(stripeOrderDetails({
      data: { object: { id: "cs_test", payment_intent: "pi_test", metadata: { order_id: "order-test" } } },
    })).toEqual({ orderId: "order-test", providerOrderId: "pi_test" });
  });

  it("extracts paid Stripe amounts and leaves unpaid sessions pending", () => {
    expect(stripePaymentDetails({
      data: {
        object: {
          id: "cs_test",
          payment_intent: "pi_test",
          metadata: { order_id: "order-test" },
          amount_total: 990,
          currency: "cny",
          payment_status: "paid",
        },
      },
    })).toEqual({
      orderId: "order-test",
      providerOrderId: "pi_test",
      amountMinor: 990,
      currency: "CNY",
      paid: true,
    });
    expect(stripePaymentDetails({
      data: {
        object: {
          id: "cs_delayed",
          metadata: { order_id: "order-delayed" },
          amount_total: 990,
          currency: "cny",
          payment_status: "unpaid",
        },
      },
    })?.paid).toBe(false);
  });

  it("extracts a succeeded PaymentIntent and rejects missing amount evidence", () => {
    expect(stripePaymentDetails({
      data: {
        object: {
          id: "pi_test",
          metadata: { order_id: "order-test" },
          amount_received: 990,
          currency: "cny",
          status: "succeeded",
        },
      },
    })).toEqual({
      orderId: "order-test",
      providerOrderId: "pi_test",
      amountMinor: 990,
      currency: "CNY",
      paid: true,
    });
    expect(stripePaymentDetails({
      data: { object: { id: "pi_test", metadata: { order_id: "order-test" }, status: "succeeded" } },
    })).toBeUndefined();
  });

  it("extracts full refund fields and rejects malformed amounts", () => {
    expect(stripeRefundDetails({
      data: { object: { id: "ch_test", payment_intent: "pi_test", amount_refunded: 990, currency: "cny", metadata: {} } },
    })).toEqual({
      amountMinor: 990,
      currency: "CNY",
      orderId: undefined,
      providerPaymentId: "pi_test",
      refundId: "ch_test",
      status: undefined,
    });
    expect(stripeRefundDetails({ data: { object: { id: "ch_test", amount_refunded: 9.9 } } })).toBeUndefined();
  });
});
