import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { readJsonWithLimit } from "../_shared/requestBody.ts";
import { firstKeyFromCollection } from "../_shared/supabaseKey.ts";

const MAX_REQUEST_BYTES = 4 * 1024;

function configuredOrigins(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
}

function resolveOrigin(request: Request): string | undefined {
  const origin = request.headers.get("origin") ?? "";
  if (configuredOrigins().includes(origin)) return origin;
  try {
    const hostname = new URL(origin).hostname;
    if (Deno.env.get("ALLOW_LOCAL_ORIGINS") === "true" && (hostname === "localhost" || hostname === "127.0.0.1")) return origin;
  } catch { return undefined; }
  return undefined;
}

function headers(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
  };
}

function reply(origin: string, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}

function publishableKey(): string | undefined {
  return Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ??
    firstKeyFromCollection(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"));
}

function secretKey(): string | undefined {
  return Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    firstKeyFromCollection(Deno.env.get("SUPABASE_SECRET_KEYS"));
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (request) => {
  const origin = resolveOrigin(request);
  if (!origin) return reply("null", 403, { code: "origin_not_allowed" });
  if (request.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  if (request.method !== "POST") return reply(origin, 405, { code: "method_not_allowed" });

  try {
    const parsed = await readJsonWithLimit(request, MAX_REQUEST_BYTES);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return reply(origin, 400, { code: "invalid_request" });
    const body = parsed as Record<string, unknown>;
    const isSubscriptionLookup = Object.keys(body).length === 1 && body.subscription === true;
    const isZpayLookup = Object.keys(body).length === 2 && body.provider === "zpay" &&
      typeof body.providerOrderId === "string" && /^[0-9]{13,32}$/.test(body.providerOrderId);
    if ((!isSubscriptionLookup && !isZpayLookup && (Object.keys(body).length !== 1 || !isUuid(body.orderId))) ||
      (isZpayLookup && body.provider !== "zpay")) return reply(origin, 400, { code: "invalid_request" });

    const authorization = request.headers.get("authorization");
    const accessToken = authorization?.replace(/^Bearer\s+/i, "").trim();
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = publishableKey();
    const serviceKey = secretKey();
    if (!url || !anonKey || !serviceKey) return reply(origin, 503, { code: "service_not_configured" });
    if (!accessToken) return reply(origin, 401, { code: "auth_required" });
    const userClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: authorization! } } });
    const { data: authData, error: authError } = await userClient.auth.getUser(accessToken);
    if (authError || !authData.user) return reply(origin, 401, { code: "auth_required" });

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    if (isSubscriptionLookup) {
      const subscription = await admin.from("subscriptions")
        .select("id,provider,plan_code,status,current_period_start,current_period_end,cancel_at_period_end,ended_at")
        .eq("user_id", authData.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (subscription.error) {
        if (["PGRST205", "42P01"].includes(subscription.error.code)) return reply(origin, 503, { code: "payment_not_ready" });
        throw subscription.error;
      }
      return reply(origin, 200, {
        subscription: subscription.data ? {
          id: subscription.data.id,
          provider: subscription.data.provider,
          planCode: subscription.data.plan_code,
          status: subscription.data.status,
          currentPeriodStart: subscription.data.current_period_start,
          currentPeriodEnd: subscription.data.current_period_end,
          cancelAtPeriodEnd: subscription.data.cancel_at_period_end,
          endedAt: subscription.data.ended_at,
        } : null,
      });
    }
    let query = admin.from("payment_orders")
      .select("id,product_code,package_code,points_granted,status,amount_minor,currency,paid_at")
      .eq("user_id", authData.user.id);
    query = isZpayLookup
      ? query.eq("provider", "zpay").eq("provider_order_id", body.providerOrderId)
      : query.eq("id", body.orderId);
    const result = await query.maybeSingle();
    if (result.error) {
      if (result.error.code === "PGRST205" || result.error.code === "42P01") return reply(origin, 503, { code: "payment_not_ready" });
      throw result.error;
    }
    if (!result.data) return reply(origin, 404, { code: "payment_not_found" });
    return reply(origin, 200, {
      order: {
        id: result.data.id,
        product: result.data.product_code,
        packageCode: result.data.package_code,
        points: result.data.points_granted,
        status: result.data.status,
        amountMinor: result.data.amount_minor,
        currency: result.data.currency,
        paidAt: result.data.paid_at,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "request_too_large") return reply(origin ?? "null", 413, { code: "request_too_large" });
    console.error("payment-status failed", error instanceof Error ? error.message : "unknown_error");
    return reply(origin ?? "null", 500, { code: "unexpected_error" });
  }
});
