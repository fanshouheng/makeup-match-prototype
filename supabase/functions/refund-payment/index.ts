import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.110.7";
import { isAuthorizedAdmin } from "../_shared/adminAuthorization.ts";
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
    if (Deno.env.get("ALLOW_LOCAL_ORIGINS") === "true" &&
      (hostname === "localhost" || hostname === "127.0.0.1")) return origin;
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

async function authenticate(
  request: Request,
  origin: string,
): Promise<{ admin: SupabaseClient; user: User } | Response> {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.replace(/^Bearer\s+/i, "").trim();
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = publishableKey();
  const serviceKey = secretKey();
  if (!url || !anonKey || !serviceKey) return reply(origin, 503, { code: "service_not_configured" });
  if (!accessToken) return reply(origin, 401, { code: "auth_required" });
  const userClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization! } },
  });
  const { data, error } = await userClient.auth.getUser(accessToken);
  if (error || !data.user) return reply(origin, 401, { code: "auth_required" });
  if (!isAuthorizedAdmin(data.user, Deno.env.get("ADMIN_USER_IDS"))) {
    return reply(origin, 403, { code: "not_admin" });
  }
  return {
    user: data.user,
    admin: createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }),
  };
}

async function stripeRefund(paymentIntent: string, amountMinor: number, orderId: string) {
  const secret = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secret) throw new Error("stripe_not_configured");
  const form = new URLSearchParams();
  form.set("payment_intent", paymentIntent);
  form.set("amount", String(amountMinor));
  form.set("metadata[order_id]", orderId);
  const response = await fetch("https://api.stripe.com/v1/refunds", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `refund:${orderId}`,
    },
    body: form,
  });
  const payload = await response.json().catch(() => undefined) as { id?: unknown; status?: unknown } | undefined;
  if (!response.ok || typeof payload?.id !== "string" || typeof payload.status !== "string") {
    throw new Error("provider_refund_failed");
  }
  return { id: payload.id, status: payload.status };
}

async function zpayRefund(outTradeNo: string, amountMinor: number) {
  const pid = Deno.env.get("ZPAY_PID")?.trim();
  const key = Deno.env.get("ZPAY_KEY")?.trim();
  if (!pid || !key) throw new Error("zpay_not_configured");
  const form = new URLSearchParams();
  form.set("pid", pid);
  form.set("key", key);
  form.set("out_trade_no", outTradeNo);
  form.set("money", (amountMinor / 100).toFixed(2));
  const response = await fetch("https://zpayz.cn/api.php?act=refund", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const payload = await response.json().catch(() => undefined) as { code?: unknown } | undefined;
  if (!response.ok || payload?.code !== 1 && payload?.code !== "1") throw new Error("provider_refund_failed");
  return { id: `zpay:${outTradeNo}`, status: "succeeded" };
}

Deno.serve(async (request) => {
  const origin = resolveOrigin(request);
  if (!origin) return reply("null", 403, { code: "origin_not_allowed" });
  if (request.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  if (request.method !== "POST") return reply(origin, 405, { code: "method_not_allowed" });

  try {
    const identity = await authenticate(request, origin);
    if (identity instanceof Response) return identity;
    const parsed = await readJsonWithLimit(request, MAX_REQUEST_BYTES);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return reply(origin, 400, { code: "invalid_request" });
    }
    const body = parsed as Record<string, unknown>;
    if (Object.keys(body).sort().join("|") !== "confirmation|orderId" || body.confirmation !== "REFUND" ||
      typeof body.orderId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.orderId)) {
      return reply(origin, 400, { code: "invalid_request" });
    }
    const order = await identity.admin.from("payment_orders")
      .select("id,user_id,provider,provider_order_id,product_code,points_granted,amount_minor,status")
      .eq("id", body.orderId)
      .maybeSingle();
    if (order.error) throw order.error;
    if (!order.data) return reply(origin, 404, { code: "payment_not_found" });
    if (order.data.status === "refunded") return reply(origin, 200, { status: "refunded" });
    if (order.data.status !== "paid" || typeof order.data.provider_order_id !== "string") {
      return reply(origin, 409, { code: "payment_not_refundable" });
    }
    if (order.data.provider !== "stripe" && order.data.provider !== "zpay") {
      return reply(origin, 409, { code: "payment_provider_not_refundable" });
    }
    if (order.data.product_code === "points" && order.data.points_granted > 0) {
      const balance = await identity.admin.rpc("get_point_balance", {
        p_user_id: order.data.user_id,
      });
      if (balance.error) throw balance.error;
      if (Number(balance.data) < order.data.points_granted) {
        return reply(origin, 409, { code: "points_already_used" });
      }
    }
    const refund = order.data.provider === "stripe"
      ? await stripeRefund(order.data.provider_order_id, order.data.amount_minor, order.data.id)
      : await zpayRefund(order.data.provider_order_id, order.data.amount_minor);
    if (refund.status !== "succeeded") return reply(origin, 202, { status: "pending" });
    const result = await identity.admin.rpc("refund_payment_order", {
      p_order_id: order.data.id,
      p_provider_reference: refund.id,
    });
    if (result.error) throw result.error;
    return reply(origin, 200, { status: "refunded" });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unexpected_error";
    if (code === "stripe_not_configured" || code === "zpay_not_configured") return reply(origin, 503, { code });
    if (code === "provider_refund_failed") return reply(origin, 502, { code });
    console.error("refund-payment failed", { code: typeof error === "object" && error && "code" in error ? String(error.code) : undefined });
    return reply(origin, 500, { code: "unexpected_error" });
  }
});
