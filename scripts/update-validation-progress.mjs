import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const PROJECT_REF = "srydzphmmepcywepcccq";
const LEGACY_EVENT_KEYS = [
  "landing_view",
  "photo_selected",
  "women_photo_selected",
  "men_photo_selected",
  "analysis_succeeded",
  "analysis_failed",
  "match_result_view",
  "feedback_yes",
  "feedback_no",
  "creator_link_clicked",
  "share_succeeded",
];
const PLUS_EVENT_KEYS = [
  "plus_offer_viewed",
  "plus_offer_opened",
  "plus_offer_configured",
  "plus_intent_yes",
  "plus_intent_price_high",
  "plus_intent_not_needed",
];
const COMMERCIAL_EVENT_KEYS = [
  "plus_page_viewed",
  "plus_checkout_started",
  "points_page_viewed",
  "points_checkout_started",
  "plus_invite_redeemed",
  "plus_job_created",
  "plus_job_succeeded",
  "plus_job_failed",
  "plus_credit_refunded",
  "plus_report_saved_local",
  "plus_usage_feedback",
];
const AI_EVENT_KEYS = [
  "ai_discovery_viewed",
  "ai_discovery_consent",
  "ai_discovery_requested",
  "ai_discovery_succeeded",
  "ai_discovery_failed",
  "ai_creator_name_clicked",
  "ai_discovery_feedback",
];
const PRE_POINTS_EVENT_KEYS = [
  ...LEGACY_EVENT_KEYS,
  ...PLUS_EVENT_KEYS,
  ...COMMERCIAL_EVENT_KEYS.filter((key) => !key.startsWith("points_")),
  ...AI_EVENT_KEYS,
];
const EVENT_KEYS = [...LEGACY_EVENT_KEYS, ...PLUS_EVENT_KEYS, ...COMMERCIAL_EVENT_KEYS, ...AI_EVENT_KEYS];
const PLUS_VARIANTS = ["price_9_9", "price_19_9", "price_29_9"];
const ANALYSIS_FAILURE_KEYS = [
  "no_face",
  "multiple_faces",
  "too_dark",
  "pose_issue",
  "component_error",
];
const SUBMISSION_KEYS = [
  "new_total",
  "pending",
  "approved",
  "rejected",
  "pending_over_7_days",
  "active_new_creators",
  "active_total",
];
const OUTREACH_KEYS = [
  "total",
  "replied",
  "interested",
  "submitted",
  "approved",
  "active",
  "declined",
  "no_reply",
  "overdue_follow_ups",
];
const AI_DIMENSION_KEYS = {
  locale: ["zh-CN", "en-US", "en-GB", "ja-JP", "ko-KR"],
  country_code: ["global", "CN", "JP", "KR", "US", "GB"],
  platform: ["all", "youtube", "instagram", "tiktok", "xiaohongshu", "douyin"],
};
const PAYMENT_STATUS_KEYS = ["created", "pending", "paid", "failed", "refunded", "cancelled"];
const PAYMENT_PROVIDER_KEYS = ["stripe", "zpay", "manual"];
const PAYMENT_PRODUCT_KEYS = ["plus", "ai_credits", "points"];
const PAYMENT_PACKAGE_KEYS = ["light", "standard", "value"];
const POINT_PURPOSE_KEYS = ["ai_discovery", "makeup_report"];
const POINT_STATUS_KEYS = ["reserved", "consumed", "refunded"];

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") values.help = true;
    else if (["--input", "--output", "--snapshots"].includes(arg)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} requires a path`);
      values[arg.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return values;
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.join("\n") !== wanted.join("\n")) {
    throw new Error(`${label} keys must be exactly: ${wanted.join(", ")}`);
  }
}

function normalizeSnapshot(raw) {
  const hasOutreach = Object.prototype.hasOwnProperty.call(raw, "outreach");
  const hasAnalysisFailures = Object.prototype.hasOwnProperty.call(raw, "analysis_failures");
  const hasPlusByVariant = Object.prototype.hasOwnProperty.call(raw, "plus_by_variant");
  const hasCurrentMetrics = EVENT_KEYS.every((key) => Object.prototype.hasOwnProperty.call(raw.metrics ?? {}, key));
  const hasAiDimensions = Object.prototype.hasOwnProperty.call(raw, "ai_dimensions");
  const hasPaymentSummary = Object.prototype.hasOwnProperty.call(raw, "payment_summary");
  const hasPointActivity = Object.prototype.hasOwnProperty.call(raw, "point_activity");
  assertExactKeys(
    raw,
    [
      "project_ref",
      "captured_at",
      "period_start",
      "metrics",
      ...(hasAnalysisFailures ? ["analysis_failures"] : []),
      ...(hasPlusByVariant ? ["plus_by_variant"] : []),
      ...(hasAiDimensions ? ["ai_dimensions"] : []),
      ...(hasPaymentSummary ? ["payment_summary"] : []),
      ...(hasPointActivity ? ["point_activity"] : []),
      "submissions",
      ...(hasOutreach ? ["outreach"] : []),
    ],
    "snapshot",
  );
  const hasHistoricalPlusMetrics = PLUS_EVENT_KEYS.every((key) => Object.prototype.hasOwnProperty.call(raw.metrics ?? {}, key));
  const hasPrePointsMetrics = PRE_POINTS_EVENT_KEYS.every((key) => Object.prototype.hasOwnProperty.call(raw.metrics ?? {}, key));
  const acceptedMetricKeys = hasCurrentMetrics ? EVENT_KEYS : hasPrePointsMetrics ? PRE_POINTS_EVENT_KEYS : hasHistoricalPlusMetrics ? [...LEGACY_EVENT_KEYS, ...PLUS_EVENT_KEYS] : LEGACY_EVENT_KEYS;
  assertExactKeys(raw.metrics, acceptedMetricKeys, "metrics");
  if (hasAnalysisFailures) {
    assertExactKeys(raw.analysis_failures, ANALYSIS_FAILURE_KEYS, "analysis_failures");
  }
  assertExactKeys(raw.submissions, SUBMISSION_KEYS, "submissions");
  if (hasOutreach) assertExactKeys(raw.outreach, OUTREACH_KEYS, "outreach");
  if (hasPlusByVariant) {
    assertExactKeys(raw.plus_by_variant, PLUS_VARIANTS, "plus_by_variant");
    for (const variant of PLUS_VARIANTS) {
      assertExactKeys(raw.plus_by_variant[variant], PLUS_EVENT_KEYS, `plus_by_variant.${variant}`);
    }
  }
  if (hasAiDimensions) {
    assertExactKeys(raw.ai_dimensions, ["available", "locale", "country_code", "platform"], "ai_dimensions");
    if (typeof raw.ai_dimensions.available !== "boolean") throw new Error("ai_dimensions.available must be boolean");
    for (const [dimension, keys] of Object.entries(AI_DIMENSION_KEYS)) {
      assertExactKeys(raw.ai_dimensions[dimension], keys, `ai_dimensions.${dimension}`);
    }
  }
  if (hasPaymentSummary) {
    const hasPointPaymentSummary = Object.prototype.hasOwnProperty.call(raw.payment_summary, "paid_points");
    assertExactKeys(raw.payment_summary, ["available", "order_count", "by_status", "by_provider", "by_product", ...(hasPointPaymentSummary ? ["by_package", "paid_points"] : []), "paid_amounts_minor"], "payment_summary");
    if (typeof raw.payment_summary.available !== "boolean") throw new Error("payment_summary.available must be boolean");
    if (!Number.isInteger(raw.payment_summary.order_count) || raw.payment_summary.order_count < 0) throw new Error("payment_summary.order_count must be a non-negative integer");
    assertExactKeys(raw.payment_summary.by_status, PAYMENT_STATUS_KEYS, "payment_summary.by_status");
    assertExactKeys(raw.payment_summary.by_provider, PAYMENT_PROVIDER_KEYS, "payment_summary.by_provider");
    assertExactKeys(raw.payment_summary.by_product, hasPointPaymentSummary ? PAYMENT_PRODUCT_KEYS : PAYMENT_PRODUCT_KEYS.slice(0, 2), "payment_summary.by_product");
    if (hasPointPaymentSummary) {
      assertExactKeys(raw.payment_summary.by_package, PAYMENT_PACKAGE_KEYS, "payment_summary.by_package");
      if (!Number.isInteger(raw.payment_summary.paid_points) || raw.payment_summary.paid_points < 0) throw new Error("payment_summary.paid_points must be a non-negative integer");
    }
    assertExactKeys(raw.payment_summary.paid_amounts_minor, ["CNY", "USD", "EUR", "JPY", "KRW", "GBP"], "payment_summary.paid_amounts_minor");
  }
  if (hasPointActivity) {
    assertExactKeys(raw.point_activity, ["available", "consumed_points", "refunded_points", "by_purpose"], "point_activity");
    if (typeof raw.point_activity.available !== "boolean") throw new Error("point_activity.available must be boolean");
    for (const key of ["consumed_points", "refunded_points"]) {
      if (!Number.isInteger(raw.point_activity[key]) || raw.point_activity[key] < 0) throw new Error(`point_activity.${key} must be a non-negative integer`);
    }
    assertExactKeys(raw.point_activity.by_purpose, POINT_PURPOSE_KEYS, "point_activity.by_purpose");
    for (const purpose of POINT_PURPOSE_KEYS) {
      assertExactKeys(raw.point_activity.by_purpose[purpose], POINT_STATUS_KEYS, `point_activity.by_purpose.${purpose}`);
    }
  }

  if (raw.project_ref !== PROJECT_REF) throw new Error("Snapshot came from the wrong Supabase project");
  const capturedAt = new Date(raw.captured_at);
  const periodStart = new Date(raw.period_start);
  if (Number.isNaN(capturedAt.valueOf()) || Number.isNaN(periodStart.valueOf())) {
    throw new Error("captured_at and period_start must be valid timestamps");
  }

  const normalizeCounts = (value, keys, label) => Object.fromEntries(keys.map((key) => {
    const count = value[key];
    if (!Number.isInteger(count) || count < 0) throw new Error(`${label}.${key} must be a non-negative integer`);
    return [key, count];
  }));

  const emptyMetrics = () => Object.fromEntries(EVENT_KEYS.map((key) => [key, 0]));
  const emptyPlusMetrics = () => Object.fromEntries(PLUS_EVENT_KEYS.map((key) => [key, 0]));
  const emptyDimensionCounts = () => Object.fromEntries(Object.entries(AI_DIMENSION_KEYS).map(([dimension, keys]) => [dimension, Object.fromEntries(keys.map((key) => [key, 0]))]));
  const emptyPaymentSummary = () => ({
    available: false,
    order_count: 0,
    by_status: Object.fromEntries(PAYMENT_STATUS_KEYS.map((key) => [key, 0])),
    by_provider: Object.fromEntries(PAYMENT_PROVIDER_KEYS.map((key) => [key, 0])),
    by_product: Object.fromEntries(PAYMENT_PRODUCT_KEYS.map((key) => [key, 0])),
    by_package: Object.fromEntries(PAYMENT_PACKAGE_KEYS.map((key) => [key, 0])),
    paid_points: 0,
    paid_amounts_minor: Object.fromEntries(["CNY", "USD", "EUR", "JPY", "KRW", "GBP"].map((key) => [key, 0])),
  });
  const emptyPointActivity = () => ({
    available: false,
    consumed_points: 0,
    refunded_points: 0,
    by_purpose: Object.fromEntries(POINT_PURPOSE_KEYS.map((purpose) => [
      purpose,
      Object.fromEntries(POINT_STATUS_KEYS.map((key) => [key, 0])),
    ])),
  });
  const plusByVariant = Object.fromEntries(PLUS_VARIANTS.map((variant) => [
    variant,
    hasPlusByVariant
      ? normalizeCounts(raw.plus_by_variant[variant], PLUS_EVENT_KEYS, `plus_by_variant.${variant}`)
      : emptyPlusMetrics(),
  ]));

  return {
    project_ref: PROJECT_REF,
    captured_at: capturedAt.toISOString(),
    period_start: periodStart.toISOString(),
    metrics: normalizeCounts(
      { ...emptyMetrics(), ...raw.metrics },
      EVENT_KEYS,
      "metrics",
    ),
    ...(hasAnalysisFailures ? {
      analysis_failures: normalizeCounts(
        raw.analysis_failures,
        ANALYSIS_FAILURE_KEYS,
        "analysis_failures",
      ),
    } : {}),
    plus_by_variant: plusByVariant,
    ai_dimensions: hasAiDimensions
      ? {
          available: raw.ai_dimensions.available,
          locale: normalizeCounts(raw.ai_dimensions.locale, AI_DIMENSION_KEYS.locale, "ai_dimensions.locale"),
          country_code: normalizeCounts(raw.ai_dimensions.country_code, AI_DIMENSION_KEYS.country_code, "ai_dimensions.country_code"),
          platform: normalizeCounts(raw.ai_dimensions.platform, AI_DIMENSION_KEYS.platform, "ai_dimensions.platform"),
        }
      : { available: false, ...emptyDimensionCounts() },
    payment_summary: hasPaymentSummary
      ? {
          available: raw.payment_summary.available,
          order_count: raw.payment_summary.order_count,
          by_status: normalizeCounts(raw.payment_summary.by_status, PAYMENT_STATUS_KEYS, "payment_summary.by_status"),
          by_provider: normalizeCounts(raw.payment_summary.by_provider, PAYMENT_PROVIDER_KEYS, "payment_summary.by_provider"),
          by_product: normalizeCounts({ ...Object.fromEntries(PAYMENT_PRODUCT_KEYS.map((key) => [key, 0])), ...raw.payment_summary.by_product }, PAYMENT_PRODUCT_KEYS, "payment_summary.by_product"),
          by_package: normalizeCounts({ ...Object.fromEntries(PAYMENT_PACKAGE_KEYS.map((key) => [key, 0])), ...(raw.payment_summary.by_package ?? {}) }, PAYMENT_PACKAGE_KEYS, "payment_summary.by_package"),
          paid_points: raw.payment_summary.paid_points ?? 0,
          paid_amounts_minor: normalizeCounts(raw.payment_summary.paid_amounts_minor, ["CNY", "USD", "EUR", "JPY", "KRW", "GBP"], "payment_summary.paid_amounts_minor"),
        }
      : emptyPaymentSummary(),
    point_activity: hasPointActivity
      ? {
          available: raw.point_activity.available,
          consumed_points: raw.point_activity.consumed_points,
          refunded_points: raw.point_activity.refunded_points,
          by_purpose: Object.fromEntries(POINT_PURPOSE_KEYS.map((purpose) => [
            purpose,
            normalizeCounts(raw.point_activity.by_purpose[purpose], POINT_STATUS_KEYS, `point_activity.by_purpose.${purpose}`),
          ])),
        }
      : emptyPointActivity(),
    submissions: normalizeCounts(raw.submissions, SUBMISSION_KEYS, "submissions"),
    ...(hasOutreach ? { outreach: normalizeCounts(raw.outreach, OUTREACH_KEYS, "outreach") } : {}),
  };
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function percentage(numerator, denominator) {
  return denominator > 0 ? `${((numerator / denominator) * 100).toFixed(1)}%` : "暂无分母";
}

function delta(current, previous) {
  if (previous === undefined) return "首次记录";
  const value = current - previous;
  return value > 0 ? `+${value}` : String(value);
}

function rateStatus(numerator, denominator, threshold, minimumSample) {
  if (denominator < minimumSample) return `样本少于 ${minimumSample}，暂不判断`;
  return numerator / denominator >= threshold ? "达到观察线" : "低于观察线";
}

function createReport(current, previous) {
  const currentWindowMs = new Date(current.captured_at).valueOf() - new Date(current.period_start).valueOf();
  const previousWindowMs = previous
    ? new Date(previous.captured_at).valueOf() - new Date(previous.period_start).valueOf()
    : undefined;
  const comparablePrevious = previous && previousWindowMs !== undefined && Math.abs(currentWindowMs - previousWindowMs) < 2 * 24 * 60 * 60 * 1000
    ? previous
    : undefined;
  const metrics = current.metrics;
  const analysisFailures = current.analysis_failures;
  const submissions = current.submissions;
  const outreach = current.outreach;
  const plusByVariant = current.plus_by_variant;
  const aiDimensions = current.ai_dimensions;
  const paymentSummary = current.payment_summary;
  const pointActivity = current.point_activity;
  const previousMetrics = comparablePrevious?.metrics;
  const previousAnalysisFailures = comparablePrevious?.analysis_failures;
  const previousSubmissions = comparablePrevious?.submissions;
  const previousOutreach = comparablePrevious?.outreach;
  const plusPrices = {
    price_9_9: "¥9.9",
    price_19_9: "¥19.9",
    price_29_9: "¥29.9",
  };
  const metricRows = [
    ["全部匿名访问", "landing_view"],
    ["选择照片", "photo_selected"],
    ["分析成功", "analysis_succeeded"],
    ["分析失败", "analysis_failed"],
    ["结果展示", "match_result_view"],
    ["点击创作者链接", "creator_link_clicked"],
    ["成功分享", "share_succeeded"],
  ];
  const rateRows = [
    ["选择照片率", metrics.photo_selected, metrics.landing_view, 0.3, 20],
    ["分析完成率", metrics.analysis_succeeded, metrics.photo_selected, 0.7, 20],
    ["结果到达率", metrics.match_result_view, metrics.analysis_succeeded, 0.9, 20],
    ["创作者点击率", metrics.creator_link_clicked, metrics.match_result_view, 0.15, 20],
    ["分享率", metrics.share_succeeded, metrics.match_result_view, 0.03, 20],
  ];
  const failureRows = [
    ["未检测到人脸", "no_face"],
    ["检测到多张人脸", "multiple_faces"],
    ["照片过暗", "too_dark"],
    ["角度或画面问题", "pose_issue"],
    ["分析组件异常", "component_error"],
  ];
  const classifiedFailures = analysisFailures
    ? Object.values(analysisFailures).reduce((total, count) => total + count, 0)
    : 0;
  const unclassifiedFailures = Math.max(metrics.analysis_failed - classifiedFailures, 0);
  const previousClassifiedFailures = previousAnalysisFailures
    ? Object.values(previousAnalysisFailures).reduce((total, count) => total + count, 0)
    : 0;
  const previousUnclassifiedFailures = previousAnalysisFailures
    ? Math.max((previousMetrics?.analysis_failed ?? 0) - previousClassifiedFailures, 0)
    : undefined;

  const lines = [
    "# MAKE UP 每周商业化复核",
    "",
    `更新时间：${formatDate(current.captured_at)}（Asia/Shanghai）`,
    `本次复核窗口起点：${formatDate(current.period_start)}（Asia/Shanghai）`,
    "",
    "> 本报告由定时任务生成，只包含匿名聚合计数。普通用户照片、面部比例、匹配分数、博主姓名、主页、联系方式和跟进备注不会写入本文件。",
    "",
    "## 产品漏斗",
    "",
    "| 指标 | 本周期 | 较上次 |",
    "| --- | ---: | ---: |",
    ...metricRows.map(([label, key]) => `| ${label} | ${metrics[key]} | ${delta(metrics[key], previousMetrics?.[key])} |`),
    "",
    ...(analysisFailures ? [
      "## 分析失败原因",
      "",
    "| 原因 | 本周期 | 较上次 |",
      "| --- | ---: | ---: |",
      ...failureRows.map(([label, key]) => `| ${label} | ${analysisFailures[key]} | ${delta(analysisFailures[key], previousAnalysisFailures?.[key])} |`),
      `| 旧版本未分类 | ${unclassifiedFailures} | ${delta(unclassifiedFailures, previousUnclassifiedFailures)} |`,
      "",
    ] : []),
    "## 漏斗观察",
    "",
    "| 指标 | 当前值 | 观察线 | 判断 |",
    "| --- | ---: | ---: | --- |",
    ...rateRows.map(([label, numerator, denominator, threshold, minimumSample]) => {
      const status = rateStatus(numerator, denominator, threshold, minimumSample);
      return `| ${label} | ${percentage(numerator, denominator)} | ${(threshold * 100).toFixed(0)}% | ${status} |`;
    }),
    "",
    "## 商业化行动信号",
    "",
    "| 信号 | 本周期 | 较上次 |",
    "| --- | ---: | ---: |",
    ...["points_page_viewed", "points_checkout_started", "plus_job_created", "plus_job_succeeded", "plus_job_failed", "plus_credit_refunded", "plus_report_saved_local", "plus_usage_feedback", "ai_discovery_viewed", "ai_discovery_consent", "ai_discovery_requested", "ai_discovery_succeeded", "ai_discovery_failed", "ai_creator_name_clicked", "ai_discovery_feedback"].map((key) => `| ${key} | ${metrics[key]} | ${delta(metrics[key], previousMetrics?.[key])} |`),
    "",
    `完整报告成功率：${percentage(metrics.plus_job_succeeded, metrics.plus_job_created)}；AI 推荐成功率：${percentage(metrics.ai_discovery_succeeded, metrics.ai_discovery_requested)}。主动反馈保留用于故障诊断，不在商业化主漏斗展示，也不外推整体满意度或符合率。`,
    "",
    "## AI 全球行动信号",
    "",
    aiDimensions.available ? "固定枚举分布（不含博主姓名、链接或用户标识）：" : "全球维度迁移尚未部署，本周只记录 AI 行为总量。",
    ...(aiDimensions.available ? [
      `- 语言：${Object.entries(aiDimensions.locale).map(([key, value]) => `${key} ${value}`).join("；")}`,
      `- 市场：${Object.entries(aiDimensions.country_code).map(([key, value]) => `${key} ${value}`).join("；")}`,
      `- 平台：${Object.entries(aiDimensions.platform).map(([key, value]) => `${key} ${value}`).join("；")}`,
    ] : []),
    "",
    "## 支付状态",
    "",
    paymentSummary.available
      ? `订单 ${paymentSummary.order_count}；状态 ${Object.entries(paymentSummary.by_status).map(([key, value]) => `${key} ${value}`).join("、")}；供应商 ${Object.entries(paymentSummary.by_provider).map(([key, value]) => `${key} ${value}`).join("、")}；套餐 ${Object.entries(paymentSummary.by_package).map(([key, value]) => `${key} ${value}`).join("、")}；已到账积分 ${paymentSummary.paid_points}；已支付金额（最小货币单位）${Object.entries(paymentSummary.paid_amounts_minor).filter(([, value]) => value > 0).map(([key, value]) => `${key} ${value}`).join("、") || "暂无"}。`
      : "支付订单迁移尚未部署，线上支付仍未纳入本周统计。",
    "",
    "## 积分使用",
    "",
    pointActivity.available
      ? `报告：消费 ${pointActivity.by_purpose.makeup_report.consumed} 次、处理中 ${pointActivity.by_purpose.makeup_report.reserved} 次、退回 ${pointActivity.by_purpose.makeup_report.refunded} 次；AI 推荐：消费 ${pointActivity.by_purpose.ai_discovery.consumed} 次、处理中 ${pointActivity.by_purpose.ai_discovery.reserved} 次、退回 ${pointActivity.by_purpose.ai_discovery.refunded} 次；本周期消费 ${pointActivity.consumed_points} 积分、退回 ${pointActivity.refunded_points} 积分。`
      : "积分预占迁移尚未部署，本周无法统计消费与退回。",
    "",
    "<details>",
    "<summary>历史价格意向实验（仅兼容旧数据，不作为当前决策依据）</summary>",
    "",
    "| 价格 | 曝光 | 展开 | 配置完成 | 愿意购买 | 价格偏高 | 暂不需要 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...PLUS_VARIANTS.map((variant) => {
      const data = plusByVariant[variant];
      return `| ${plusPrices[variant]} | ${data.plus_offer_viewed} | ${data.plus_offer_opened} | ${data.plus_offer_configured} | ${data.plus_intent_yes} | ${data.plus_intent_price_high} | ${data.plus_intent_not_needed} |`;
    }),
    "",
    "</details>",
    "",
    "",
    "## 创作者供给",
    "",
    "| 指标 | 当前状态/本周期 | 较上次 |",
    "| --- | ---: | ---: |",
    `| 本轮新增申请 | ${submissions.new_total} | ${delta(submissions.new_total, previousSubmissions?.new_total)} |`,
    `| 待审核 | ${submissions.pending} | ${delta(submissions.pending, previousSubmissions?.pending)} |`,
    `| 已批准 | ${submissions.approved} | ${delta(submissions.approved, previousSubmissions?.approved)} |`,
    `| 已拒绝 | ${submissions.rejected} | ${delta(submissions.rejected, previousSubmissions?.rejected)} |`,
    `| 超过 7 天待审核 | ${submissions.pending_over_7_days} | ${delta(submissions.pending_over_7_days, previousSubmissions?.pending_over_7_days)} |`,
    `| 本轮新增且当前在线 | ${submissions.active_new_creators} | ${delta(submissions.active_new_creators, previousSubmissions?.active_new_creators)} |`,
    `| 当前在线创作者总数 | ${submissions.active_total} | ${delta(submissions.active_total, previousSubmissions?.active_total)} |`,
    "",
    ...(outreach ? [
      "## 博主触达",
      "",
      "| 指标 | 当前状态 | 较上次 |",
      "| --- | ---: | ---: |",
      `| 已联系 | ${outreach.total} | ${delta(outreach.total, previousOutreach?.total)} |`,
      `| 已回复 | ${outreach.replied} | ${delta(outreach.replied, previousOutreach?.replied)} |`,
      `| 有意愿 | ${outreach.interested} | ${delta(outreach.interested, previousOutreach?.interested)} |`,
      `| 已提交 | ${outreach.submitted} | ${delta(outreach.submitted, previousOutreach?.submitted)} |`,
      `| 已批准 | ${outreach.approved} | ${delta(outreach.approved, previousOutreach?.approved)} |`,
      `| 已上线 | ${outreach.active} | ${delta(outreach.active, previousOutreach?.active)} |`,
      `| 已拒绝 | ${outreach.declined} | ${delta(outreach.declined, previousOutreach?.declined)} |`,
      `| 未回复 | ${outreach.no_reply} | ${delta(outreach.no_reply, previousOutreach?.no_reply)} |`,
      `| 逾期待跟进 | ${outreach.overdue_follow_ups} | ${delta(outreach.overdue_follow_ups, previousOutreach?.overdue_follow_ups)} |`,
      "",
    ] : []),
    "## 事实、假设与未知",
    "",
    "- 事实：本报告只汇总固定事件、固定 AI 市场/语言/平台枚举和支付状态聚合。",
    "- 假设：AI 名字点击代表用户愿意继续查看，不代表授权、合作或转化。",
    "- 未知：女性目标受众渠道访问、真实支付原因、退款原因、交付后的长期使用仍需人工记录。",
    "",
    "## 口径说明",
    "",
    "- 同一会话的同一事件只计一次。",
    "- Plus 历史价格意向只为兼容旧快照，不再新增采集，也不作为当前商业化判断。",
    "- 分析失败原因只记录固定分类代码；不会记录照片、面部参数、异常文本或设备身份。",
    "- `使用女生模式选图` 只表示用户选择了女生模式，不代表系统识别或推断了用户性别。",
    "- 所有转化率都按本次复核窗口计算；样本较小时只记录，不据此频繁改产品。",
    "",
  ];
  return lines.join("\n");
}

function readHistory(filename) {
  if (!fs.existsSync(filename)) return [];
  return fs.readFileSync(filename, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => normalizeSnapshot(JSON.parse(line)));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/update-validation-progress.mjs [--input snapshot.json] [--output report.md] [--snapshots history.jsonl]");
    return;
  }

  const output = path.resolve(args.output ?? "output/validation-progress/MAKE_UP_验证进度.md");
  const snapshots = path.resolve(args.snapshots ?? "output/validation-progress/snapshots.jsonl");
  const inputText = args.input ? fs.readFileSync(path.resolve(args.input), "utf8") : fs.readFileSync(0, "utf8");
  const current = normalizeSnapshot(JSON.parse(inputText));
  const history = readHistory(snapshots);
  const previous = history.filter((snapshot) => snapshot.captured_at !== current.captured_at).at(-1);

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.mkdirSync(path.dirname(snapshots), { recursive: true });
  fs.writeFileSync(output, createReport(current, previous), "utf8");
  if (!history.some((snapshot) => snapshot.captured_at === current.captured_at)) {
    fs.appendFileSync(snapshots, `${JSON.stringify(current)}\n`, "utf8");
  }
  console.log(output);
}

main();
