export const MATCH_ALGORITHM_VERSION = "weighted-rms-v1";

export const MATCH_NEGATIVE_REASON_CODES = [
  "analysis_incorrect",
  "creator_mismatch",
  "style_mismatch",
  "problem_not_solved",
  "other",
] as const;

export type MatchNegativeReasonCode = typeof MATCH_NEGATIVE_REASON_CODES[number];

export interface MatchNegativeFeedbackInput {
  algorithmVersion: typeof MATCH_ALGORITHM_VERSION;
  creatorIds: string[];
  otherReason?: string;
  reasonCodes: MatchNegativeReasonCode[];
}

export interface MatchNegativeFeedbackSummary {
  valid_responses: number;
  reasons: Record<MatchNegativeReasonCode, number>;
}

const MAX_OTHER_REASON_LENGTH = 160;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASON_CODE_SET = new Set<string>(MATCH_NEGATIVE_REASON_CODES);

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function parseMatchNegativeFeedback(
  body: Record<string, unknown>,
): MatchNegativeFeedbackInput | undefined {
  if (body.algorithmVersion !== MATCH_ALGORITHM_VERSION) return undefined;
  if (
    !Array.isArray(body.creatorIds) ||
    body.creatorIds.length < 1 ||
    body.creatorIds.length > 3 ||
    !body.creatorIds.every(isUuid) ||
    new Set(body.creatorIds).size !== body.creatorIds.length
  ) {
    return undefined;
  }
  if (
    !Array.isArray(body.reasonCodes) ||
    body.reasonCodes.length < 1 ||
    body.reasonCodes.length > MATCH_NEGATIVE_REASON_CODES.length ||
    !body.reasonCodes.every((reason) => typeof reason === "string" && REASON_CODE_SET.has(reason)) ||
    new Set(body.reasonCodes).size !== body.reasonCodes.length
  ) {
    return undefined;
  }

  const hasOtherReason = Object.prototype.hasOwnProperty.call(body, "otherReason");
  const otherReason = typeof body.otherReason === "string" ? body.otherReason.trim() : undefined;
  if (
    hasOtherReason &&
    (!otherReason || otherReason.length > MAX_OTHER_REASON_LENGTH)
  ) {
    return undefined;
  }
  if (otherReason && !body.reasonCodes.includes("other")) return undefined;

  return {
    algorithmVersion: MATCH_ALGORITHM_VERSION,
    creatorIds: [...body.creatorIds].sort(),
    reasonCodes: [...body.reasonCodes].sort() as MatchNegativeReasonCode[],
    ...(otherReason ? { otherReason } : {}),
  };
}

export function summarizeMatchNegativeFeedback(
  rows: readonly { reason_codes: unknown }[],
): MatchNegativeFeedbackSummary {
  const reasons = Object.fromEntries(
    MATCH_NEGATIVE_REASON_CODES.map((reason) => [reason, 0]),
  ) as Record<MatchNegativeReasonCode, number>;
  let validResponses = 0;

  for (const row of rows) {
    if (!Array.isArray(row.reason_codes)) continue;
    const selectedReasons = [...new Set(row.reason_codes)].filter(
      (reason): reason is MatchNegativeReasonCode =>
        typeof reason === "string" && REASON_CODE_SET.has(reason),
    );
    if (selectedReasons.length === 0) continue;
    validResponses += 1;
    for (const reason of selectedReasons) reasons[reason] += 1;
  }

  return { valid_responses: validResponses, reasons };
}
