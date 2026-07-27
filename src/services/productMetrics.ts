import { getSupabaseClient } from "./supabaseClient";
import type { QualityIssueCode } from "../domain/quality";

export type ProductEventName =
  | "landing_view"
  | "photo_selected"
  | "women_photo_selected"
  | "men_photo_selected"
  | "analysis_succeeded"
  | "analysis_failed"
  | "match_result_view"
  | "feedback_yes"
  | "feedback_no"
  | "creator_link_clicked"
  | "share_succeeded";

export type AnalysisFailureReason =
  | "no_face"
  | "multiple_faces"
  | "too_dark"
  | "pose_issue"
  | "component_error";

export type MatchNegativeFeedbackReason =
  | "analysis_incorrect"
  | "creator_mismatch"
  | "style_mismatch"
  | "problem_not_solved"
  | "other";

export interface MatchNegativeFeedbackDetails {
  otherReason?: string;
  reasonCodes: MatchNegativeFeedbackReason[];
}

interface MatchNegativeFeedbackPayload extends MatchNegativeFeedbackDetails {
  algorithmVersion: string;
  creatorIds: string[];
}

const FAILURE_REASON_BY_ISSUE: Record<QualityIssueCode, AnalysisFailureReason> = {
  "no-face": "no_face",
  "multiple-faces": "multiple_faces",
  "too-dark": "too_dark",
  "too-small": "pose_issue",
  tilted: "pose_issue",
  "side-facing": "pose_issue",
  "expressive-mouth": "pose_issue",
};

const SESSION_STORAGE_KEY = "make-up-product-metrics-session";
const CAMPAIGN_SOURCE_PATTERN = /^(xhs|creator|community)_\d{2}$/;

export function photoSelectionEventNames(
  referenceAudience: "women" | "men",
): ProductEventName[] {
  return referenceAudience === "men"
    ? ["photo_selected", "men_photo_selected"]
    : ["photo_selected", "women_photo_selected"];
}

export function analysisFailureReasonFromIssues(
  issues: readonly { code: QualityIssueCode }[],
): AnalysisFailureReason | undefined {
  return issues[0] ? FAILURE_REASON_BY_ISSUE[issues[0].code] : undefined;
}

interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function getOrCreateProductMetricSessionId(
  storage: SessionStorageLike,
  createId: () => string,
): string {
  const existing = storage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;

  const sessionId = createId();
  storage.setItem(SESSION_STORAGE_KEY, sessionId);
  return sessionId;
}

export function campaignSourceFromSearch(search: string): string | undefined {
  const source = new URLSearchParams(search).get("src")?.trim().toLowerCase();
  return source && CAMPAIGN_SOURCE_PATTERN.test(source) ? source : undefined;
}

let fallbackSessionId: string | undefined;

function productMetricSessionId(): string | undefined {
  if (typeof window === "undefined" || typeof crypto.randomUUID !== "function") return undefined;
  fallbackSessionId ??= crypto.randomUUID();
  try {
    return getOrCreateProductMetricSessionId(window.sessionStorage, () => fallbackSessionId!);
  } catch {
    return fallbackSessionId;
  }
}

async function invokeProductEvent(body: Record<string, unknown>): Promise<void> {
  try {
    const supabase = await getSupabaseClient();
    await supabase.functions.invoke("record-product-event", { body });
  } catch {
    // Metrics are best-effort and must never interrupt local photo analysis.
  }
}

export async function recordProductEvent(
  eventName: ProductEventName,
  failureReason?: AnalysisFailureReason,
): Promise<void> {
  const sessionId = productMetricSessionId();
  if (!sessionId) return;

  await invokeProductEvent(
    failureReason
      ? { sessionId, eventName, failureReason }
      : { sessionId, eventName },
  );
}

export async function recordMatchNegativeFeedback({
  algorithmVersion,
  creatorIds,
  otherReason,
  reasonCodes,
}: MatchNegativeFeedbackPayload): Promise<void> {
  const sessionId = productMetricSessionId();
  if (!sessionId || creatorIds.length === 0 || reasonCodes.length === 0) return;

  await invokeProductEvent({
    sessionId,
    eventName: "feedback_no",
    creatorIds: [...creatorIds].sort(),
    algorithmVersion,
    reasonCodes,
    ...(otherReason?.trim() ? { otherReason: otherReason.trim() } : {}),
  });
}
