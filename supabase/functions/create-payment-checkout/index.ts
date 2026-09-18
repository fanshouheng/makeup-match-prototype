import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { readJsonWithLimit } from "../_shared/requestBody.ts";
import { firstKeyFromCollection } from "../_shared/supabaseKey.ts";
import { zpaySign } from "../_shared/zpaySignature.ts";

const MAX_REQUEST_BYTES = 8 * 1024;
type Provider = "stripe" | "zpay";

interface CheckoutRequest {
  provider?: Provider;
  product?: "points" | "membership";
  packageCode?: string;
  planCode?: string;
  idempotencyKey?: string;
}

interface PointPackage {
  amount_minor: number;
  code: string;
  currency: string;
  name: string;
  points: number;
  provider: Provider;
}

interface MembershipPlan {
  billing_interval: "month" | "year";
  code: string;
  currency: string;
  daily_match_limit: number | null;
  match_access: "daily" | "unlimited";
  monthly_amount_minor: number;
  monthly_points: number;
  name: string;
  provider: Provider;
  stripe_price_id?: string | null;
}

function configuredOrigins(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean);
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

function secretKey(): string | undefined {
  return Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    firstKeyFromCollection(Deno.env.get("SUPABASE_SECRET_KEYS"));
}

function publishableKey(): string | undefined {
  return Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ??
    firstKeyFromCollection(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"));
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

interface ZpayCheckoutForm {
  action: string;
  fields: Record<string, string>;
}

function zpayCheckoutForm(
  orderId: string,
  outTradeNo: string,
  item: PointPackage,
): ZpayCheckoutForm | undefined {
  const pid = Deno.env.get("ZPAY_PID")?.trim();
  const key = Deno.env.get("ZPAY_KEY")?.trim();
  const notifyUrl = Deno.env.get("ZPAY_NOTIFY_URL")?.trim();
  const returnUrl = Deno.env.get("ZPAY_RETURN_URL")?.trim();
  const type = (Deno.env.get("ZPAY_TYPE") ?? "wxpay").trim();
  if (!pid || !key || !notifyUrl || !returnUrl || !/^https?:\/\/[^?]+$/.test(notifyUrl) ||
    !/^https?:\/\/[^?]+$/.test(returnUrl) || !/^[a-z][a-z0-9_,-]*$/i.test(type) || item.currency !== "CNY") {
    return undefined;
  }
  const params: Record<string, string> = {
    name: `MAKE UP ${item.points} 积分会员`,
    money: (item.amount_minor / 100).toFixed(2),
    type,
    out_trade_no: outTradeNo,
    notify_url: notifyUrl,
    pid,
    return_url: returnUrl,
    param: orderId,
    sign_type: "MD5",
  };
  params.sign = zpaySign(params, key);
  return { action: "https://zpayz.cn/submit.php", fields: params };
}

function zpayMembershipCheckoutForm(
  orderId: string,
  outTradeNo: string,
  item: MembershipPlan,
): ZpayCheckoutForm | undefined {
  const pid = Deno.env.get("ZPAY_PID")?.trim();
  const key = Deno.env.get("ZPAY_KEY")?.trim();
  const notifyUrl = Deno.env.get("ZPAY_NOTIFY_URL")?.trim();
  const returnUrl = Deno.env.get("ZPAY_RETURN_URL")?.trim();
  const type = (Deno.env.get("ZPAY_TYPE") ?? "wxpay").trim();
  if (!pid || !key || !notifyUrl || !returnUrl || !/^https?:\/\/[^?]+$/.test(notifyUrl) ||
    !/^https?:\/\/[^?]+$/.test(returnUrl) || !/^[a-z][a-z0-9_,-]*$/i.test(type) || item.currency !== "CNY") {
    return undefined;
  }
  const params: Record<string, string> = {
    name: `MAKE UP ${item.name}`,
    money: (item.monthly_amount_minor / 100).toFixed(2),
    type,
    out_trade_no: outTradeNo,
    notify_url: notifyUrl,
    pid,
    return_url: returnUrl,
    param: orderId,
    sign_type: "MD5",
  };
  params.sign = zpaySign(params, key);
  return { action: "https://zpayz.cn/submit.php", fields: params };
}

async function authenticate(request: Request, origin: string) {
  const authorization = request.headers.get("authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = publishableKey();
  const serviceKey = secretKey();
  if (!url || !anonKey || !serviceKey) return reply(origin, 503, { code: "service_not_configured" });
  const accessToken = authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return reply(origin, 401, { code: "auth_required" });
  const userClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization! } },
  });
  const { data, error } = await userClient.auth.getUser(accessToken);
  if (error || !data.user || !data.user.email_confirmed_at) {
    return reply(origin, 403, { code: data.user ? "email_not_confirmed" : "auth_required" });
  }
  return {
    admin: createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }),
    userId: data.user.id,
  };
}

async function stripeCheckout(
  secret: string,
  origin: string,
  orderId: string,
  item: PointPackage,
): Promise<{ id: string; url: string }> {
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", `${origin}/plus?payment=success&order=${encodeURIComponent(orderId)}`);
  form.set("cancel_url", `${origin}/plus?payment=cancelled&order=${encodeURIComponent(orderId)}`);
  form.set("line_items[0][price_data][currency]", item.currency.toLowerCase());
  form.set("line_items[0][price_data][product_data][name]", `MAKE UP ${item.points} points`);
  form.set("line_items[0][price_data][unit_amount]", String(item.amount_minor));
  form.set("line_items[0][quantity]", "1");
  form.set("metadata[order_id]", orderId);
  form.set("metadata[product_code]", "points");
  form.set("metadata[package_code]", item.code);
  form.set("payment_intent_data[metadata][order_id]", orderId);
  form.set("payment_intent_data[metadata][product_code]", "points");
  form.set("payment_intent_data[metadata][package_code]", item.code);
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": orderId,
    },
    body: form,
  });
  const payload = await response.json().catch(() => undefined) as { id?: unknown; url?: unknown } | undefined;
  if (!response.ok || typeof payload?.id !== "string" || typeof payload.url !== "string") {
    throw new Error("stripe_checkout_failed");
  }
  return { id: payload.id, url: payload.url };
}

async function stripeSubscriptionCheckout(
  secret: string,
  origin: string,
  orderId: string,
  item: MembershipPlan,
): Promise<{ id: string; url: string }> {
  const form = new URLSearchParams();
  form.set("mode", "subscription");
  form.set("success_url", `${origin}/plus?payment=success&order=${encodeURIComponent(orderId)}`);
  form.set("cancel_url", `${origin}/plus?payment=cancelled&order=${encodeURIComponent(orderId)}`);
  if (item.stripe_price_id) {
    form.set("line_items[0][price]", item.stripe_price_id);
  } else {
    form.set("line_items[0][price_data][currency]", item.currency.toLowerCase());
    form.set("line_items[0][price_data][product_data][name]", `MAKE UP ${item.name}`);
    form.set("line_items[0][price_data][unit_amount]", String(item.monthly_amount_minor));
    form.set("line_items[0][price_data][recurring][interval]", item.billing_interval);
  }
  form.set("line_items[0][quantity]", "1");
  form.set("metadata[order_id]", orderId);
  form.set("metadata[product_code]", "membership");
  form.set("metadata[plan_code]", item.code);
  form.set("subscription_data[metadata][order_id]", orderId);
  form.set("subscription_data[metadata][product_code]", "membership");
  form.set("subscription_data[metadata][plan_code]", item.code);
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": orderId,
    },
    body: form,
  });
  const payload = await response.json().catch(() => undefined) as { id?: unknown; url?: unknown } | undefined;
  if (!response.ok || typeof payload?.id !== "string" || typeof payload.url !== "string") {
    throw new Error("stripe_subscription_checkout_failed");
  }
  return { id: payload.id, url: payload.url };
}

Deno.serve(async (request) => {
  const origin = resolveOrigin(request);
  if (!origin) return reply("null", 403, { code: "origin_not_allowed" });
  if (request.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = secretKey();
    if (!url || !serviceKey) return reply(origin, 503, { code: "service_not_configured" });
    const catalogClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    if (request.method === "GET") {
      const [result, membershipResult] = await Promise.all([
        catalogClient.from("point_packages")
        .select("code,provider,name,points,amount_minor,currency,sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
        catalogClient.from("membership_plans")
          .select("code,provider,name,monthly_amount_minor,currency,monthly_points,stripe_price_id,billing_interval,match_access,daily_match_limit,sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
      ]);
      if (result.error && !["PGRST205", "42P01"].includes(result.error.code)) throw result.error;
      if (membershipResult.error && !["PGRST205", "42P01"].includes(membershipResult.error.code)) throw membershipResult.error;
      if (result.error || membershipResult.error) {
        if (result.error && ["PGRST205", "42P01"].includes(result.error.code)) {
          return reply(origin, 503, { code: "payment_not_ready" });
        }
        return reply(origin, 503, { code: "membership_not_ready" });
      }
      return reply(origin, 200, {
        packages: (result.data ?? []).map((item) => ({
          amountMinor: item.amount_minor,
          code: item.code,
          currency: item.currency,
          name: item.name,
          points: item.points,
          provider: item.provider,
        })),
        membershipPlans: (membershipResult.data ?? []).map((item) => ({
          code: item.code,
          currency: item.currency,
          amountMinor: item.monthly_amount_minor,
          billingInterval: item.billing_interval,
          dailyMatchLimit: item.daily_match_limit,
          matchAccess: item.match_access,
          name: item.name,
          provider: item.provider,
          pointsPerGrant: item.monthly_points,
          stripePriceIdConfigured: Boolean(item.stripe_price_id),
        })),
      });
    }
    if (request.method !== "POST") return reply(origin, 405, { code: "method_not_allowed" });

    const parsed = await readJsonWithLimit(request, MAX_REQUEST_BYTES);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return reply(origin, 400, { code: "invalid_request" });
    }
    const body = parsed as CheckoutRequest;
    const product = body.product ?? (body.planCode ? "membership" : "points");
    const code = product === "membership" ? body.planCode : body.packageCode;
    const requestKeys = Object.keys(body).sort().join("|");
    const validRequestShape = product === "membership"
      ? (requestKeys === "idempotencyKey|planCode|product|provider" || requestKeys === "planCode|product|provider")
      : (requestKeys === "idempotencyKey|packageCode|provider" || requestKeys === "packageCode|provider");
    if (!validRequestShape ||
      body.provider !== "stripe" && body.provider !== "zpay" ||
      typeof code !== "string" || !/^[a-z0-9_-]{1,40}$/.test(code) ||
      product !== "points" && product !== "membership" ||
      body.idempotencyKey !== undefined && !isUuid(body.idempotencyKey)) {
      return reply(origin, 400, { code: "invalid_request" });
    }
    const provider = body.provider;
    const packageCode = product === "points" ? code : undefined;
    const planCode = product === "membership" ? code : undefined;
    const identity = await authenticate(request, origin);
    if (identity instanceof Response) return identity;
    if (product === "membership" && provider === "stripe") {
      const activeSubscription = await identity.admin.from("subscriptions")
        .select("id")
        .eq("user_id", identity.userId)
        .in("status", ["active", "trialing", "past_due", "unpaid", "incomplete"])
        .maybeSingle();
      if (activeSubscription.error && !["PGRST205", "42P01"].includes(activeSubscription.error.code)) throw activeSubscription.error;
      if (activeSubscription.data) return reply(origin, 409, { code: "subscription_already_active" });
    }
    const packageResult = product === "points" ? await identity.admin.from("point_packages")
      .select("code,provider,name,points,amount_minor,currency")
      .eq("code", packageCode).eq("provider", provider).eq("is_active", true).maybeSingle()
      : { data: null, error: null };
    const planResult = product === "membership" ? await identity.admin.from("membership_plans")
      .select("code,provider,name,monthly_amount_minor,currency,monthly_points,stripe_price_id,billing_interval,match_access,daily_match_limit")
      .eq("code", planCode).eq("provider", provider).eq("is_active", true).maybeSingle()
      : { data: null, error: null };
    const catalogResult = product === "points" ? packageResult : planResult;
    if (catalogResult.error) {
      if (["PGRST205", "42P01"].includes(catalogResult.error.code)) {
        return reply(origin, 503, { code: "payment_not_ready" });
      }
      throw catalogResult.error;
    }
    if (!catalogResult.data) return reply(origin, 404, { code: product === "membership" ? "membership_plan_not_found" : "package_not_found" });
    const item = catalogResult.data as PointPackage & MembershipPlan;

    const idempotencyKey = body.idempotencyKey ?? crypto.randomUUID();
    const existing = await identity.admin
      .from("payment_orders")
      .select("id,provider,product_code,package_code,plan_code,points_granted,status,provider_order_id,checkout_url,amount_minor,currency")
      .eq("user_id", identity.userId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing.error) {
      if (existing.error.code === "PGRST205" || existing.error.code === "42P01") {
        return reply(origin, 503, { code: "payment_not_ready" });
      }
      throw existing.error;
    }
    if (existing.data) {
      if (existing.data.provider !== provider || existing.data.product_code !== product ||
        product === "points" && (existing.data.package_code !== packageCode || existing.data.points_granted !== item.points || existing.data.amount_minor !== item.amount_minor || existing.data.currency !== item.currency) ||
        product === "membership" && (existing.data.plan_code !== planCode || existing.data.amount_minor !== item.monthly_amount_minor || existing.data.currency !== item.currency)) {
        return reply(origin, 409, { code: "idempotency_key_reused" });
      }
      if (existing.data.status === "failed") return reply(origin, 502, { code: "checkout_create_failed" });
      if (existing.data.status !== "created" && existing.data.status !== "pending") {
        return reply(origin, 409, { code: "payment_order_not_payable" });
      }
      if (provider === "zpay" && existing.data.provider_order_id) {
        const checkout = product === "membership"
          ? zpayMembershipCheckoutForm(existing.data.id, existing.data.provider_order_id, item)
          : zpayCheckoutForm(existing.data.id, existing.data.provider_order_id, item);
        if (checkout) {
          return reply(origin, 200, {
            orderId: existing.data.id,
            provider,
          packageCode: packageCode ?? planCode,
            points: product === "points" ? item.points : item.monthly_points,
            status: "pending",
            checkoutUrl: checkout.action,
            checkoutForm: checkout,
          });
        }
      }
      if (typeof existing.data.checkout_url === "string" && existing.data.checkout_url !== "") {
        return reply(origin, 200, {
          orderId: existing.data.id,
          provider,
          packageCode: packageCode ?? planCode,
          points: product === "points" ? item.points : item.monthly_points,
          status: "pending",
          checkoutUrl: existing.data.checkout_url,
        });
      }
      return reply(origin, 409, { code: "payment_order_pending" });
    }

    const orderId = crypto.randomUUID();
    const outTradeNo = `${Date.now()}${Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0")}`;
    if (provider === "zpay") {
      const checkout = product === "membership"
        ? zpayMembershipCheckoutForm(orderId, outTradeNo, item)
        : zpayCheckoutForm(orderId, outTradeNo, item);
      if (!checkout) return reply(origin, 503, { code: "zpay_not_configured" });
      const { data: inserted, error: insertError } = await identity.admin
        .from("payment_orders")
        .insert({
          id: orderId,
          user_id: identity.userId,
          provider: "zpay",
          product_code: product,
          package_code: packageCode,
          plan_code: planCode,
          points_granted: product === "points" ? item.points : item.monthly_points,
          amount_minor: product === "points" ? item.amount_minor : item.monthly_amount_minor,
          currency: item.currency,
          status: "pending",
          provider_order_id: outTradeNo,
          checkout_url: checkout.action,
          idempotency_key: idempotencyKey,
        })
        .select("id")
        .single();
      if (insertError || !inserted) throw new Error("payment_order_create_failed");
      return reply(origin, 200, {
        orderId,
        provider: "zpay",
        packageCode: packageCode ?? planCode,
        points: product === "points" ? item.points : item.monthly_points,
        status: "pending",
        checkoutUrl: checkout.action,
        checkoutForm: checkout,
      });
    }
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecret) return reply(origin, 503, { code: "stripe_not_configured" });

    const { data: inserted, error: insertError } = await identity.admin
      .from("payment_orders")
      .insert({
        id: orderId,
        user_id: identity.userId,
        provider: "stripe",
        product_code: product,
        package_code: packageCode,
        plan_code: planCode,
        points_granted: product === "points" ? item.points : item.monthly_points,
        amount_minor: product === "points" ? item.amount_minor : item.monthly_amount_minor,
        currency: item.currency,
        status: "created",
        idempotency_key: idempotencyKey,
      })
      .select("id")
      .single();
    if (insertError || !inserted) throw new Error("payment_order_create_failed");

    try {
      const checkout = product === "membership"
        ? await stripeSubscriptionCheckout(stripeSecret, origin, orderId, item)
        : await stripeCheckout(stripeSecret, origin, orderId, item);
      await identity.admin.from("payment_orders").update({
        status: "pending",
        provider_order_id: checkout.id,
        checkout_url: checkout.url,
        updated_at: new Date().toISOString(),
      }).eq("id", orderId);
      return reply(origin, 200, {
        orderId,
        provider: "stripe",
        packageCode: packageCode ?? planCode,
        points: product === "points" ? item.points : item.monthly_points,
        status: "pending",
        checkoutUrl: checkout.url,
      });
    } catch {
      await identity.admin.from("payment_orders").update({
        status: "failed",
        failure_code: "checkout_create_failed",
        updated_at: new Date().toISOString(),
      }).eq("id", orderId);
      return reply(origin, 502, { code: "checkout_create_failed" });
    }
  } catch (error) {
    if (error instanceof Error && error.message === "request_too_large") {
      return reply(origin ?? "null", 413, { code: "request_too_large" });
    }
    console.error("create-payment-checkout failed", error instanceof Error ? error.message : "unknown_error");
    return reply(origin ?? "null", 500, { code: "unexpected_error" });
  }
});
