import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminWorkbench } from "./AdminWorkbench";
import type { AdminProductMetrics } from "./adminApi";

const metrics: AdminProductMetrics = {
  period_start: "2026-07-23T00:00:00Z",
  landing_view: 1000,
  photo_selected: 800,
  women_photo_selected: 780,
  men_photo_selected: 20,
  analysis_succeeded: 600,
  analysis_failed: 200,
  match_result_view: 600,
  feedback_yes: 10,
  feedback_no: 90,
  creator_link_clicked: 300,
  share_succeeded: 5,
  plus_offer_viewed: 360,
  plus_offer_opened: 30,
  plus_offer_configured: 20,
  plus_intent_yes: 8,
  plus_intent_price_high: 6,
  plus_intent_not_needed: 4,
  plus_by_variant: {
    price_9_9: { plus_offer_viewed: 140, plus_offer_opened: 10, plus_offer_configured: 8, plus_intent_yes: 4, plus_intent_price_high: 1, plus_intent_not_needed: 1 },
    price_19_9: { plus_offer_viewed: 120, plus_offer_opened: 10, plus_offer_configured: 6, plus_intent_yes: 2, plus_intent_price_high: 2, plus_intent_not_needed: 1 },
    price_29_9: { plus_offer_viewed: 100, plus_offer_opened: 10, plus_offer_configured: 6, plus_intent_yes: 2, plus_intent_price_high: 3, plus_intent_not_needed: 2 },
  },
  analysis_failures: { no_face: 50, multiple_faces: 5, too_dark: 4, pose_issue: 100, component_error: 41 },
  negative_feedback: {
    valid_responses: 42,
    reasons: {
      analysis_incorrect: 10,
      creator_mismatch: 18,
      style_mismatch: 9,
      problem_not_solved: 12,
      other: 3,
    },
  },
};

describe("AdminWorkbench", () => {
  it("turns the current validation plan into a prioritized operator view", () => {
    const html = renderToStaticMarkup(
      <AdminWorkbench
        metrics={metrics}
        dateRangeLabel="7 月 21 日至 7 月 27 日"
        paymentSummary={{ available: true, order_count: 3, by_status: { paid: 2, refunded: 1 } }}
        onNavigate={() => undefined}
      />,
    );

    expect(html).toContain("先把会员、账期、消费和交付跑成一条线");
    expect(html).toContain("今天先做");
    expect(html).toContain("三个商业化闭环");
    expect(html).toContain("跑通会员与账期");
    expect(html).toContain("验证报告付费价值");
    expect(html).toContain("验证邀请增长");
    expect(html).toContain("获客内容约束");
    expect(html).toContain("完成匹配并提交真实反馈");
    expect(html).toContain("开发复盘、Vibe Coding、开源进展单独记录");
    expect(html).toContain("真实支付订单");
    expect(html).toContain("已支付 2 · 已退款 1");
    expect(html).toContain("暂停新增积分玩法");
    expect(html).toContain("付款不会改变普通匹配排序");
    expect(html).toContain("50.0%");
    expect(html).toContain("暂缓事项");
    expect(html).not.toContain("xhs_01");
  });
});
