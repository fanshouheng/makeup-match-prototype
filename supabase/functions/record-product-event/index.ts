import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const EVENT_NAMES = new Set([
  "photo_selected",
  "analysis_succeeded",
  "analysis_failed",
  "match_result_view",
  "feedback_yes",
  "feedback_no",
  "share_succeeded",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    if (
      Object.keys(body).length !== 2 ||
      typeof body.sessionId !== "string" ||
      !UUID_PATTERN.test(body.sessionId) ||
      typeof body.eventName !== "string" ||
      !EVENT_NAMES.has(body.eventName)
    ) {
      return reply(origin, 400, "invalid_event");
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await admin.from("product_events").upsert(
      { session_id: body.sessionId, event_name: body.eventName },
      { onConflict: "session_id,event_name", ignoreDuplicates: true },
    );
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
