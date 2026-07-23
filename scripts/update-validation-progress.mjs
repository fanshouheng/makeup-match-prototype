import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const PROJECT_REF = "srydzphmmepcywepcccq";
const EVENT_KEYS = [
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
  assertExactKeys(
    raw,
    [
      "project_ref",
      "captured_at",
      "period_start",
      "metrics",
      ...(hasAnalysisFailures ? ["analysis_failures"] : []),
      "submissions",
      ...(hasOutreach ? ["outreach"] : []),
    ],
    "snapshot",
  );
  assertExactKeys(raw.metrics, EVENT_KEYS, "metrics");
  if (hasAnalysisFailures) {
    assertExactKeys(raw.analysis_failures, ANALYSIS_FAILURE_KEYS, "analysis_failures");
  }
  assertExactKeys(raw.submissions, SUBMISSION_KEYS, "submissions");
  if (hasOutreach) assertExactKeys(raw.outreach, OUTREACH_KEYS, "outreach");

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

  return {
    project_ref: PROJECT_REF,
    captured_at: capturedAt.toISOString(),
    period_start: periodStart.toISOString(),
    metrics: normalizeCounts(raw.metrics, EVENT_KEYS, "metrics"),
    ...(hasAnalysisFailures ? {
      analysis_failures: normalizeCounts(
        raw.analysis_failures,
        ANALYSIS_FAILURE_KEYS,
        "analysis_failures",
      ),
    } : {}),
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
  const metrics = current.metrics;
  const analysisFailures = current.analysis_failures;
  const submissions = current.submissions;
  const outreach = current.outreach;
  const feedbackTotal = metrics.feedback_yes + metrics.feedback_no;
  const previousMetrics = previous?.metrics;
  const previousAnalysisFailures = previous?.analysis_failures;
  const previousSubmissions = previous?.submissions;
  const previousOutreach = previous?.outreach;
  const metricRows = [
    ["全部匿名访问", "landing_view"],
    ["选择照片", "photo_selected"],
    ["使用女生模式选图", "women_photo_selected"],
    ["使用男生模式选图", "men_photo_selected"],
    ["分析成功", "analysis_succeeded"],
    ["分析失败", "analysis_failed"],
    ["结果展示", "match_result_view"],
    ["反馈符合", "feedback_yes"],
    ["反馈不符合", "feedback_no"],
    ["点击创作者链接", "creator_link_clicked"],
    ["成功分享", "share_succeeded"],
  ];
  const rateRows = [
    ["选择照片率", metrics.photo_selected, metrics.landing_view, 0.3, 20],
    ["分析完成率", metrics.analysis_succeeded, metrics.photo_selected, 0.7, 20],
    ["结果到达率", metrics.match_result_view, metrics.analysis_succeeded, 0.9, 20],
    ["反馈率", feedbackTotal, metrics.match_result_view, 0.15, 20],
    ["主观符合率", metrics.feedback_yes, feedbackTotal, 0.6, 50],
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
    "# LOOK AI 30 天验证进度",
    "",
    `更新时间：${formatDate(current.captured_at)}（Asia/Shanghai）`,
    `完整埋点统计起点：${formatDate(current.period_start)}（Asia/Shanghai）`,
    "",
    "> 本报告由定时任务生成，只包含匿名聚合计数。普通用户照片、面部比例、匹配分数、博主姓名、主页、联系方式和跟进备注不会写入本文件。",
    "",
    "## 产品漏斗",
    "",
    "| 指标 | 当前累计 | 较上次 |",
    "| --- | ---: | ---: |",
    ...metricRows.map(([label, key]) => `| ${label} | ${metrics[key]} | ${delta(metrics[key], previousMetrics?.[key])} |`),
    "",
    ...(analysisFailures ? [
      "## 分析失败原因",
      "",
      "| 原因 | 当前累计 | 较上次 |",
      "| --- | ---: | ---: |",
      ...failureRows.map(([label, key]) => `| ${label} | ${analysisFailures[key]} | ${delta(analysisFailures[key], previousAnalysisFailures?.[key])} |`),
      `| 旧版本未分类 | ${unclassifiedFailures} | ${delta(unclassifiedFailures, previousUnclassifiedFailures)} |`,
      "",
    ] : []),
    "## 转化判断",
    "",
    "| 指标 | 当前值 | 30 天计划观察线 | 判断 |",
    "| --- | ---: | ---: | --- |",
    ...rateRows.map(([label, numerator, denominator, threshold, minimumSample]) => {
      const status = rateStatus(numerator, denominator, threshold, minimumSample);
      return `| ${label} | ${percentage(numerator, denominator)} | ${(threshold * 100).toFixed(0)}% | ${status} |`;
    }),
    "",
    "## 创作者供给",
    "",
    "| 指标 | 当前累计 | 较上次 |",
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
      "| 指标 | 当前累计 | 较上次 |",
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
    "## 需要人工补录",
    "",
    "- 女性受众渠道访问数：Supabase 事件没有保存渠道维度，不能把全部访问当成女性访客或目标渠道访问。",
    "- 品牌触达、正式报价和到账金额：这些数据来自商业台账，数据库无法自动判断。",
    "",
    "## 口径说明",
    "",
    "- 同一会话的同一事件只计一次。",
    "- 分析失败原因只记录固定分类代码；不会记录照片、面部参数、异常文本或设备身份。",
    "- `使用女生模式选图` 只表示用户选择了女生模式，不代表系统识别或推断了用户性别。",
    "- 所有转化率都从统计起点累计计算；样本较小时只记录，不据此频繁改产品。",
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

  const output = path.resolve(args.output ?? "output/validation-progress/LOOK_AI_验证进度.md");
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
