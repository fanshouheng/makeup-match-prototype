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

export type PlusOfferEventName =
  | "plus_offer_viewed"
  | "plus_offer_opened"
  | "plus_offer_configured"
  | "plus_intent_yes"
  | "plus_intent_price_high"
  | "plus_intent_not_needed";

export type PlusOfferVariant = "price_9_9" | "price_19_9" | "price_29_9";

export const PLUS_OFFER_PRICES: Record<PlusOfferVariant, number> = {
  price_9_9: 9.9,
  price_19_9: 19.9,
  price_29_9: 29.9,
};

const PLUS_OFFER_VARIANTS: PlusOfferVariant[] = [
  "price_9_9",
  "price_19_9",
  "price_29_9",
];

export type AnalysisFailureReason =
  | "no_face"
  | "multiple_faces"
  | "too_dark"
  | "pose_issue"
  | "component_error";

const FAILURE_REASON_BY_ISSUE: Record<QualityIssueCode, AnalysisFailureReason> = {
  "no-face": "no_face",
  "multiple-faces": "multiple_faces",
  "too-dark": "too_dark",
  "too-small": "pose_issue",
  tilted: "pose_issue",
  "side-facing": "pose_issue",
  "expressive-mouth": "pose_issue",
};

const SESSION_STORAGE_KEY = "look-ai-product-metrics-session";
const CAMPAIGN_SOURCE_PATTERN = /^(xhs|creator|community)_\d{2}$/;
const PRODUCT_METRIC_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export function plusOfferVariantFromSessionId(sessionId: string): PlusOfferVariant {
  if (!PRODUCT_METRIC_UUID_PATTERN.test(sessionId)) return "price_19_9";
  const tail = sessionId.replaceAll("-", "").slice(-8);
  const value = Number.parseInt(tail, 16);
  return Number.isFinite(value)
    ? PLUS_OFFER_VARIANTS[value % PLUS_OFFER_VARIANTS.length]
    : "price_19_9";
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

export function getPlusOfferVariant(): PlusOfferVariant {
  const sessionId = productMetricSessionId();
  return sessionId ? plusOfferVariantFromSessionId(sessionId) : "price_19_9";
}

async function invokeProductEvent(body: Record<string, string>): Promise<void> {
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

export async function recordPlusOfferEvent(
  eventName: PlusOfferEventName,
  experimentVariant: PlusOfferVariant,
): Promise<void> {
  const sessionId = productMetricSessionId();
  if (!sessionId) return;

  await invokeProductEvent({ sessionId, eventName, experimentVariant });
}
