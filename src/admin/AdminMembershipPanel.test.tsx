import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdminMembershipPanel } from "./AdminMembershipPanel";

vi.mock("./adminApi", () => ({
  cancelAdminMembership: vi.fn(),
  getAdminMembershipCatalog: vi.fn(() => new Promise(() => undefined)),
  grantAdminMembershipMonth: vi.fn(),
  lookupAdminMembership: vi.fn(),
  updateAdminMembershipPlan: vi.fn(),
}));

describe("AdminMembershipPanel", () => {
  it("shows manual membership and single-plan controls", () => {
    const html = renderToStaticMarkup(<AdminMembershipPanel />);
    expect(html).toContain("会员与套餐");
    expect(html).toContain("手动管理会员");
    expect(html).toContain("每次人工开通只增加一个月并发放当期套餐积分");
    expect(html).toContain("设置月卡套餐");
    expect(html).toContain("只更新支付宝与 Stripe 的月卡目录");
    expect(html).toContain("正在读取套餐");
  });
});
