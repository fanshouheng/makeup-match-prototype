import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminCommercePanel } from "./AdminCommercePanel";

describe("AdminCommercePanel", () => {
  it("shows registration, payment, membership, and manual membership entry points", () => {
    const html = renderToStaticMarkup(<AdminCommercePanel data={{
      available: true,
      registrations: { total: 12, confirmed: 10, last30Days: 4 },
      payments: { total: 5, paid: 3, pending: 1, refunded: 1, paidCnyMinor: 13700, paidUsdMinor: 899 },
      memberships: { total: 4, active: 3, expiring7Days: 1 },
      users: [{ email: "user@example.com", createdAt: "2026-09-18T00:00:00Z", confirmedAt: "2026-09-18T00:05:00Z", lastSignInAt: null }],
      orders: [{ id: "00000000-0000-4000-8000-000000000001", email: "user@example.com", provider: "zpay", productCode: "membership", planCode: "pro_monthly", amountMinor: 5900, currency: "CNY", status: "paid", paidAt: "2026-09-18T00:10:00Z", refundedAt: null, createdAt: "2026-09-18T00:08:00Z" }],
      members: [{ email: "user@example.com", provider: "zpay", planCode: "pro_monthly", status: "active", currentPeriodStart: "2026-09-18T00:10:00Z", currentPeriodEnd: "2026-10-18T00:10:00Z", cancelAtPeriodEnd: false, managementSource: "payment", createdAt: "2026-09-18T00:10:00Z" }],
    }} onAddMembership={() => undefined} />);

    expect(html).toContain("用户、支付与会员");
    expect(html).toContain("注册用户");
    expect(html).toContain("已支付订单");
    expect(html).toContain("有效会员");
    expect(html).toContain("增加会员");
    expect(html).toContain("user@example.com");
    expect(html).toContain("支付宝");
    expect(html).not.toContain("ZPAY");
  });
});
