import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const script = path.resolve("scripts/update-validation-progress.mjs");

function runReport(snapshot: Record<string, unknown>): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "makeup-progress-"));
  const input = path.join(directory, "input.json");
  const output = path.join(directory, "report.md");
  const snapshots = path.join(directory, "history.jsonl");
  fs.writeFileSync(input, JSON.stringify(snapshot));
  execFileSync(process.execPath, [script, "--input", input, "--output", output, "--snapshots", snapshots]);
  return fs.readFileSync(output, "utf8");
}

function baseSnapshot(): Record<string, any> {
  const events = [
    "landing_view", "photo_selected", "women_photo_selected", "men_photo_selected",
    "analysis_succeeded", "analysis_failed", "match_result_view", "feedback_yes",
    "feedback_no", "creator_link_clicked", "share_succeeded", "plus_offer_viewed",
    "plus_offer_opened", "plus_offer_configured", "plus_intent_yes",
    "plus_intent_price_high", "plus_intent_not_needed", "plus_page_viewed",
    "plus_checkout_started", "plus_invite_redeemed", "plus_job_created",
    "plus_job_succeeded", "plus_job_failed", "plus_credit_refunded",
    "plus_report_saved_local", "plus_usage_feedback", "ai_discovery_viewed",
    "ai_discovery_consent", "ai_discovery_requested", "ai_discovery_succeeded",
    "ai_discovery_failed", "ai_creator_name_clicked", "ai_discovery_feedback",
  ];
  return {
    project_ref: "srydzphmmepcywepcccq",
    captured_at: "2026-09-12T10:00:00.000Z",
    period_start: "2026-07-23T08:20:41.000Z",
    metrics: Object.fromEntries(events.map((event) => [event, 0])),
    analysis_failures: { no_face: 0, multiple_faces: 0, too_dark: 0, pose_issue: 0, component_error: 0 },
    plus_by_variant: Object.fromEntries(["price_9_9", "price_19_9", "price_29_9"].map((variant) => [variant, {
      plus_offer_viewed: 0, plus_offer_opened: 0, plus_offer_configured: 0,
      plus_intent_yes: 0, plus_intent_price_high: 0, plus_intent_not_needed: 0,
    }])),
    submissions: { new_total: 0, pending: 0, approved: 0, rejected: 0, pending_over_7_days: 0, active_new_creators: 0, active_total: 0 },
    outreach: { total: 0, replied: 0, interested: 0, submitted: 0, approved: 0, active: 0, declined: 0, no_reply: 0, overdue_follow_ups: 0 },
  };
}

function pointSnapshot(): Record<string, any> {
  const snapshot = baseSnapshot();
  snapshot.metrics.points_page_viewed = 12;
  snapshot.metrics.points_checkout_started = 5;
  snapshot.payment_summary = {
    available: true,
    order_count: 4,
    by_status: { created: 0, pending: 1, paid: 2, failed: 0, refunded: 1, cancelled: 0 },
    by_provider: { stripe: 1, zpay: 3, manual: 0 },
    by_product: { plus: 0, ai_credits: 0, points: 4 },
    by_package: { light: 2, standard: 1, value: 1 },
    paid_points: 130,
    paid_amounts_minor: { CNY: 3980, USD: 199, EUR: 0, JPY: 0, KRW: 0, GBP: 0 },
  };
  snapshot.point_activity = {
    available: true,
    consumed_points: 16,
    refunded_points: 3,
    by_purpose: {
      ai_discovery: { reserved: 1, consumed: 2, refunded: 1 },
      makeup_report: { reserved: 0, consumed: 1, refunded: 0 },
    },
  };
  return snapshot;
}

describe("weekly validation progress", () => {
  it("keeps legacy snapshots readable and renames the report to weekly review", () => {
    const snapshot = baseSnapshot();
    for (const key of Object.keys(snapshot.metrics)) {
      if (key.startsWith("plus_") && !key.startsWith("plus_offer") && !key.startsWith("plus_intent")) delete snapshot.metrics[key];
      if (key.startsWith("ai_")) delete snapshot.metrics[key];
    }
    const report = runReport(snapshot);
    expect(report).toContain("# MAKE UP 每周商业化复核");
    expect(report).toContain("本次复核窗口起点");
    expect(report).toContain("历史价格意向实验（仅兼容旧数据");
    expect(report).toContain("支付订单迁移尚未部署");
  });

  it("reports only fixed global dimensions and payment aggregates", () => {
    const snapshot = baseSnapshot();
    snapshot.metrics.ai_discovery_requested = 4;
    snapshot.metrics.ai_discovery_succeeded = 3;
    snapshot.ai_dimensions = {
      available: true,
      locale: { "zh-CN": 2, "en-US": 1, "en-GB": 0, "ja-JP": 0, "ko-KR": 0 },
      country_code: { global: 1, CN: 2, JP: 0, KR: 0, US: 0, GB: 0 },
      platform: { all: 1, youtube: 2, instagram: 0, tiktok: 0, xiaohongshu: 1, douyin: 0 },
    };
    snapshot.payment_summary = {
      available: true,
      order_count: 2,
      by_status: { created: 0, pending: 0, paid: 1, failed: 0, refunded: 1, cancelled: 0 },
      by_provider: { stripe: 1, zpay: 1, manual: 0 },
      by_product: { plus: 2, ai_credits: 0 },
      paid_amounts_minor: { CNY: 990, USD: 0, EUR: 0, JPY: 0, KRW: 0, GBP: 0 },
    };
    const report = runReport(snapshot);
    expect(report).toContain("语言：zh-CN 2；en-US 1");
    expect(report).toContain("订单 2");
    expect(report).not.toMatch(/alice@example\.com|provider_order_id|session_id|photo_data/i);
  });

  it("reports point packages and point consumption without promoting voluntary feedback", () => {
    const snapshot = pointSnapshot();
    const report = runReport(snapshot);

    expect(report).toContain("points_page_viewed | 12");
    expect(report).toContain("套餐 light 2、standard 1、value 1");
    expect(report).toContain("已到账积分 130");
    expect(report).toContain("报告：消费 1 次、处理中 0 次、退回 0 次");
    expect(report).toContain("AI 推荐：消费 2 次、处理中 1 次、退回 1 次");
    expect(report).toContain("本周期消费 16 积分、退回 3 积分");
    expect(report).not.toContain("| 反馈符合 |");
    expect(report).not.toContain("| 反馈不符合 |");
    expect(report).toContain("不在商业化主漏斗展示");
    expect(report).toContain("所有转化率都按本次复核窗口计算");
  });
});
