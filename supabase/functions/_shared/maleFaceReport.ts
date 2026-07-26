export const MALE_FACE_REPORT_FEATURE_KEYS = [
  "faceAspectRatio",
  "jawToCheekRatio",
  "foreheadToCheekRatio",
  "lowerThirdRatio",
  "eyeSpacingRatio",
  "eyeAspectRatio",
  "noseWidthRatio",
  "lipWidthRatio",
  "lipAspectRatio",
] as const;

export type MaleFaceReportFeatureKey =
  typeof MALE_FACE_REPORT_FEATURE_KEYS[number];

export interface MaleFaceReportObservation {
  feature: MaleFaceReportFeatureKey;
  label: string;
  fact: string;
  comment: string;
}

export interface MaleFaceReport {
  title: string;
  summary: string;
  observations: MaleFaceReportObservation[];
  closing: string;
}

const BANNED_REPORT_TEXT =
  /(?:瞎|失明|残疾|残障|畸形|智障|弱智|猥琐|丑陋|性能力|娘炮|种族|民族|疾病|看不见|什么也看不见|算计|精打细算|心眼|气量|刻薄相|精明|不好糊弄|不好惹|不吃亏|没底气|不大气|小家子气|刁钻|凉薄|薄情|阴险|奸诈|老实|聪明|机灵|凶相|凶狠|凶恶|温柔|和善|善良|自信|怯懦|胆小|睁开费劲|斜视|斗鸡眼|裂口女|脱臼|血印|后娘养的)/i;

function requiredText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") throw new Error("invalid_report");
  const text = value.trim();
  if (!text || text.length > maxLength || BANNED_REPORT_TEXT.test(text)) {
    throw new Error("invalid_report");
  }
  return text;
}

export function parseMaleFaceReport(value: unknown): MaleFaceReport {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("invalid_report");
  }

  const report = value as Record<string, unknown>;
  if (!Array.isArray(report.observations)) throw new Error("invalid_report");
  if (report.observations.length < 3 || report.observations.length > 5) {
    throw new Error("invalid_report");
  }

  const allowedFeatures = new Set<string>(MALE_FACE_REPORT_FEATURE_KEYS);
  const usedFeatures = new Set<string>();
  const observations = report.observations.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("invalid_report");
    }
    const item = entry as Record<string, unknown>;
    const feature = item.feature;
    if (
      typeof feature !== "string" ||
      !allowedFeatures.has(feature) ||
      usedFeatures.has(feature)
    ) {
      throw new Error("invalid_report");
    }
    usedFeatures.add(feature);
    return {
      feature: feature as MaleFaceReportFeatureKey,
      label: requiredText(item.label, 20),
      fact: requiredText(item.fact, 100),
      comment: requiredText(item.comment, 160),
    };
  });

  return {
    title: requiredText(report.title, 40),
    summary: requiredText(report.summary, 220),
    observations,
    closing: requiredText(report.closing, 100),
  };
}

export function parseDeepSeekMaleFaceReport(response: unknown): MaleFaceReport {
  if (typeof response !== "object" || response === null || Array.isArray(response)) {
    throw new Error("invalid_provider_response");
  }
  const choices = (response as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("invalid_provider_response");
  }
  const first = choices[0];
  if (typeof first !== "object" || first === null || Array.isArray(first)) {
    throw new Error("invalid_provider_response");
  }
  const message = (first as Record<string, unknown>).message;
  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    throw new Error("invalid_provider_response");
  }
  const content = (message as Record<string, unknown>).content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("invalid_provider_response");
  }

  try {
    return parseMaleFaceReport(JSON.parse(content));
  } catch {
    throw new Error("invalid_provider_response");
  }
}
