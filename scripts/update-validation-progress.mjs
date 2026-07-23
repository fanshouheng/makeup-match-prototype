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
const SUBMISSION_KEYS = [
  "new_total",
  "pending",
  "approved",
  "rejected",
  "pending_over_7_days",
  "active_new_creators",
  "active_total",
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
  assertExactKeys(raw, ["project_ref", "captured_at", "period_start", "metrics", "submissions"], "snapshot");
  assertExactKeys(raw.metrics, EVENT_KEYS, "metrics");
  assertExactKeys(raw.submissions, SUBMISSION_KEYS, "submissions");

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
    submissions: normalizeCounts(raw.submissions, SUBMISSION_KEYS, "submissions"),
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
  const submissions = current.submissions;
  const feedbackTotal = metrics.feedback_yes + metrics.feedback_no;
  const previousMetrics = previous?.metrics;
  const previousSubmissions = previous?.submissions;
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

  const lines = [
    "# LOOK AI 30 天验证进度",
    "",
    `更新时间：${formatDate(current.captured_at)}（Asia/Shanghai）`,
    `完整埋点统计起点：${formatDate(current.period_start)}（Asia/Shanghai）`,
    "",
    "> 本报告由定时任务生成，只包含匿名聚合计数。普通用户照片、面部比例、匹配分数、创作者身份和联系方式不会写入本文件。",
    "",
    "## 产品漏斗",
    "",
    "| 指标 | 当前累计 | 较上次 |",
    "| --- | ---: | ---: |",
    ...metricRows.map(([label, key]) => `| ${label} | ${metrics[key]} | ${delta(metrics[key], previousMetrics?.[key])} |`),
    "",
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
    "## 需要人工补录",
    "",
    "- 女性受众渠道访问数：Supabase 事件没有保存渠道维度，不能把全部访问当成女性访客或目标渠道访问。",
    "- 博主触达、回复和有意愿人数：这些数据来自私聊台账，数据库无法自动判断。",
    "- 品牌触达、正式报价和到账金额：这些数据来自商业台账，数据库无法自动判断。",
    "",
    "## 口径说明",
    "",
    "- 同一会话的同一事件只计一次。",
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
