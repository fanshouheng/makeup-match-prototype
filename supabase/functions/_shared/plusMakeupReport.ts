export const PLUS_MAKEUP_REPORT_CONSENT_VERSION = "2026-07-31";

export const PLUS_MAKEUP_SCENES = [
  { value: "commute", label: "日常通勤" },
  { value: "date", label: "约会见面" },
  { value: "camera", label: "拍照上镜" },
  { value: "party", label: "聚会派对" },
  { value: "wedding_guest", label: "婚礼宾客" },
  { value: "graduation", label: "毕业典礼" },
  { value: "presentation", label: "面试汇报" },
  { value: "travel", label: "旅行出游" },
] as const;

export const PLUS_MAKEUP_DIRECTIONS = [
  { value: "clean", label: "清透自然" },
  { value: "soft", label: "温柔氛围" },
  { value: "sweet_cool", label: "甜酷利落" },
  { value: "retro", label: "复古港风" },
  { value: "camera_ready", label: "明艳上镜" },
  { value: "auto", label: "让 AI 建议" },
] as const;

export type PlusMakeupScene = typeof PLUS_MAKEUP_SCENES[number]["value"];
export type PlusMakeupDirection = typeof PLUS_MAKEUP_DIRECTIONS[number]["value"];

export interface PlusMakeupStep {
  area: string;
  instruction: string;
}

export interface PlusMakeupPlan {
  name: string;
  sceneFit: string;
  effect: string;
  steps: PlusMakeupStep[];
  products: string[];
  avoid: string[];
}

export interface PlusMakeupCoreReport {
  title: string;
  faceProfile: {
    summary: string;
    focusAreas: string[];
    limitations: string[];
  };
  plans: PlusMakeupPlan[];
  disclaimer: string;
}

export interface PlusMakeupReport extends PlusMakeupCoreReport {
  creatorNames: string[];
}

const CREATOR_DISCOVERY_KEYWORDS = [
  "底妆",
  "遮瑕",
  "眉形",
  "眉峰",
  "眼线",
  "眼影",
  "睫毛",
  "卧蚕",
  "腮红",
  "修容",
  "高光",
  "唇妆",
  "唇线",
  "哑光",
  "珠光",
] as const;

export function approvedCreatorDiscoveryKeywords(
  report: PlusMakeupCoreReport,
): string[] {
  const text = [
    ...report.faceProfile.focusAreas,
    ...report.plans.flatMap((plan) => [
      ...plan.steps.flatMap((step) => [step.area, step.instruction]),
      ...plan.products,
      ...plan.avoid,
    ]),
  ].join("\n");
  return CREATOR_DISCOVERY_KEYWORDS.filter((keyword) => text.includes(keyword)).slice(0, 8);
}

const BANNED_TEXT =
  /(?:种族|民族|残疾|残障|智障|弱智|畸形|丑陋|性能力|性取向|人格缺陷|性格决定|健康状况|疾病诊断)/i;

function requiredText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") throw new Error("invalid_report");
  const text = value.trim();
  if (!text || text.length > maxLength || BANNED_TEXT.test(text)) {
    throw new Error("invalid_report");
  }
  return text;
}

function textList(
  value: unknown,
  minimum: number,
  maximum: number,
  itemMaxLength: number,
): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error("invalid_report");
  }
  const items = value.map((item) => requiredText(item, itemMaxLength));
  if (new Set(items).size !== items.length) throw new Error("invalid_report");
  return items;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("invalid_report");
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) {
    throw new Error("invalid_report");
  }
}

export function parsePlusMakeupCoreReport(value: unknown): PlusMakeupCoreReport {
  const report = record(value);
  exactKeys(report, ["title", "faceProfile", "plans", "disclaimer"]);

  const faceProfile = record(report.faceProfile);
  exactKeys(faceProfile, ["summary", "focusAreas", "limitations"]);

  if (!Array.isArray(report.plans) || report.plans.length !== 3) {
    throw new Error("invalid_report");
  }
  const planNames = new Set<string>();
  const plans = report.plans.map((value) => {
    const plan = record(value);
    exactKeys(plan, ["name", "sceneFit", "effect", "steps", "products", "avoid"]);
    const name = requiredText(plan.name, 40);
    if (planNames.has(name)) throw new Error("invalid_report");
    planNames.add(name);

    if (!Array.isArray(plan.steps) || plan.steps.length < 5 || plan.steps.length > 7) {
      throw new Error("invalid_report");
    }
    const steps = plan.steps.map((value) => {
      const step = record(value);
      exactKeys(step, ["area", "instruction"]);
      return {
        area: requiredText(step.area, 16),
        instruction: requiredText(step.instruction, 180),
      };
    });

    return {
      name,
      sceneFit: requiredText(plan.sceneFit, 100),
      effect: requiredText(plan.effect, 180),
      steps,
      products: textList(plan.products, 3, 7, 60),
      avoid: textList(plan.avoid, 1, 3, 100),
    };
  });

  return {
    title: requiredText(report.title, 60),
    faceProfile: {
      summary: requiredText(faceProfile.summary, 420),
      focusAreas: textList(faceProfile.focusAreas, 2, 4, 140),
      limitations: textList(faceProfile.limitations, 1, 3, 140),
    },
    plans,
    disclaimer: requiredText(report.disclaimer, 160),
  };
}

export function parsePlusMakeupReport(value: unknown): PlusMakeupReport {
  const report = record(value);
  exactKeys(report, ["title", "faceProfile", "plans", "creatorNames", "disclaimer"]);
  const { creatorNames, ...core } = report;
  return {
    ...parsePlusMakeupCoreReport(core),
    creatorNames: textList(creatorNames, 1, 5, 60),
  };
}

export function parseDeepSeekPlusMakeupReport(response: unknown): PlusMakeupCoreReport {
  const provider = record(response);
  const choices = provider.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("invalid_provider_response");
  }
  const first = record(choices[0]);
  const message = record(first.message);
  const content = message.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("invalid_provider_response");
  }
  try {
    const trimmed = content.trim();
    const json = trimmed.startsWith("```")
      ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
      : trimmed;
    return parsePlusMakeupCoreReport(JSON.parse(json));
  } catch {
    throw new Error("invalid_provider_response");
  }
}
