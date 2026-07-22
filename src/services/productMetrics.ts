import { getSupabaseClient } from "./supabaseClient";

export type ProductEventName =
  | "photo_selected"
  | "analysis_succeeded"
  | "analysis_failed"
  | "match_result_view"
  | "feedback_yes"
  | "feedback_no"
  | "share_succeeded";

const SESSION_STORAGE_KEY = "look-ai-product-metrics-session";

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

export async function recordProductEvent(eventName: ProductEventName): Promise<void> {
  const sessionId = productMetricSessionId();
  if (!sessionId) return;

  try {
    const supabase = await getSupabaseClient();
    await supabase.functions.invoke("record-product-event", {
      body: { sessionId, eventName },
    });
  } catch {
    // Product metrics are best-effort and must never interrupt local analysis.
  }
}
