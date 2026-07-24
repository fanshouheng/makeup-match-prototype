import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const EVENT_NAMES = new Set([
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
  "plus_offer_viewed",
  "plus_offer_opened",
  "plus_offer_configured",
  "plus_intent_yes",
  "plus_intent_price_high",
  "plus_intent_not_needed",
]);
const PLUS_EVENT_NAMES = new Set([
  "plus_offer_viewed",
  "plus_offer_opened",
  "plus_offer_configured",
  "plus_intent_yes",
  "plus_intent_price_high",
  "plus_intent_not_needed",
]);
const PLUS_VARIANTS = ["price_9_9", "price_19_9", "price_29_9"] as const;
const FAILURE_REASONS = new Set([
  "no_face",
  "multiple_faces",
  "too_dark",
  "pose_issue",
  "component_error",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function plusVariantFromSessionId(sessionId: string): typeof PLUS_VARIANTS[number] {
  const value = Number.parseInt(sessionId.replaceAll("-", "").slice(-8), 16);
  return PLUS_VARIANTS[value % PLUS_VARIANTS.length];
}

function configuredOrigins(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function resolveOrigin(request: Request): string | undefined {
  const origin = request.headers.get("origin") ?? "";
  if (configuredOrigins().includes(origin)) return origin;
  try {
    const hostname = new URL(origin).hostname;
    if (
      Deno.env.get("ALLOW_LOCAL_ORIGINS") === "true" &&
      (hostname === "localhost" || hostname === "127.0.0.1")
    ) {
      return origin;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function headers(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

function reply(origin: string, status: number, code: string): Response {
  return new Response(JSON.stringify({ code }), { status, headers: headers(origin) });
}

function keyFromCollection(name: string): string | undefined {
  const collection = Deno.env.get(name);
  if (!collection) return undefined;
  try {
    const values = Object.values(JSON.parse(collection) as Record<string, unknown>);
    return values.find((value): value is string => typeof value === "string" && value.length > 0);
  } catch {
    return undefined;
  }
}

function secretKey(): string | undefined {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    keyFromCollection("SUPABASE_SECRET_KEYS");
}

Deno.serve(async (request) => {
  const origin = resolveOrigin(request);
  if (!origin) return reply("null", 403, "origin_not_allowed");
  if (request.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  if (request.method !== "POST") return reply(origin, 405, "method_not_allowed");

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 512) return reply(origin, 413, "request_too_large");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = secretKey();
  if (!supabaseUrl || !serviceKey) return reply(origin, 503, "service_not_configured");

  try {
    const body = await request.json() as Record<string, unknown>;
    const keys = Object.keys(body);
    const hasFailureReason = Object.prototype.hasOwnProperty.call(body, "failureReason");
    const eventNameIsValid = typeof body.eventName === "string" && EVENT_NAMES.has(body.eventName);
    const isPlusEvent = typeof body.eventName === "string" && PLUS_EVENT_NAMES.has(body.eventName);
    const sessionIdIsValid = typeof body.sessionId === "string" && UUID_PATTERN.test(body.sessionId);
    const failureReasonIsValid = body.eventName === "analysis_failed"
      ? !hasFailureReason || (
        typeof body.failureReason === "string" && FAILURE_REASONS.has(body.failureReason)
      )
      : !hasFailureReason;
    const fieldsAreValid = isPlusEvent
      ? keys.length === 3 && keys.every((key) => ["sessionId", "eventName", "experimentVariant"].includes(key))
      : (keys.length === 2 || keys.length === 3) &&
        keys.every((key) => ["sessionId", "eventName", "failureReason"].includes(key));
    const experimentVariantIsValid = isPlusEvent
      ? sessionIdIsValid &&
        typeof body.experimentVariant === "string" &&
        body.experimentVariant === plusVariantFromSessionId(body.sessionId as string)
      : !Object.prototype.hasOwnProperty.call(body, "experimentVariant");
    if (
      !fieldsAreValid ||
      !sessionIdIsValid ||
      !eventNameIsValid ||
      !failureReasonIsValid ||
      !experimentVariantIsValid
    ) {
      return reply(origin, 400, "invalid_event");
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await admin.from("product_events").upsert(
      {
        session_id: body.sessionId,
        event_name: body.eventName,
        failure_reason: hasFailureReason ? body.failureReason : null,
        experiment_variant: isPlusEvent ? body.experimentVariant : null,
      },
      { onConflict: "session_id,event_name", ignoreDuplicates: true },
    );
    if (error?.code === "23505") return reply(origin, 202, "already_recorded");
    if (error) throw error;

    return reply(origin, 202, "recorded");
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : undefined;
    console.error("product event write failed", { code });
    return reply(origin, 500, "unexpected_error");
  }
});
