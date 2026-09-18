import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { parseZpayAmountMinor, stripeOrderDetails, stripePaymentDetails, stripeRefundDetails } from "../_shared/paymentProvider.ts";
import { verifyStripeSignature } from "../_shared/stripeSignature.ts";
import { firstKeyFromCollection } from "../_shared/supabaseKey.ts";
import { verifyZpaySignature } from "../_shared/zpaySignature.ts";

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    firstKeyFromCollection(Deno.env.get("SUPABASE_SECRET_KEYS"));
  if (!url || !key) throw new Error("service_not_configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
}

function text(status: number, value: string): Response {
  return new Response(value, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

function eventObject(event: Record<string, unknown>): Record<string, unknown> | undefined {
  const data = event.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return undefined;
  const object = (data as Record<string, unknown>).object;
  return typeof object === "object" && object !== null && !Array.isArray(object)
    ? object as Record<string, unknown>
    : undefined;
}

function metadataValue(object: Record<string, unknown>, key: string): string | undefined {
  const metadata = object.metadata;
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function dateFromUnix(value: unknown): string | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? new Date(value * 1000).toISOString()
    : undefined;
}

async function upsertStripeSubscription(admin: ReturnType<typeof serviceClient>, object: Record<string, unknown>) {
  const providerSubscriptionId = typeof object.id === "string" ? object.id : undefined;
  if (!providerSubscriptionId) return undefined;
  const metadataOrderId = metadataValue(object, "order_id");
  const metadataPlanCode = metadataValue(object, "plan_code");
  let order: { id: string; user_id: string; plan_code: string | null } | null = null;
  if (metadataOrderId) {
    const result = await admin.from("payment_orders").select("id,user_id,plan_code").eq("id", metadataOrderId).maybeSingle();
    if (result.error) throw result.error;
    order = result.data;
  }
  const existing = await admin.from("subscriptions")
    .select("id,user_id,plan_code")
    .eq("provider", "stripe")
    .eq("provider_subscription_id", providerSubscriptionId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  const userId = order?.user_id ?? existing.data?.user_id;
  const planCode = metadataPlanCode ?? order?.plan_code ?? existing.data?.plan_code;
  if (!userId || !planCode) throw new Error("subscription_metadata_missing");
  const status = typeof object.status === "string" && ["active", "trialing", "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired"].includes(object.status)
    ? object.status
    : "incomplete";
  const row = {
    user_id: userId,
    provider: "stripe",
    plan_code: planCode,
    provider_customer_id: typeof object.customer === "string" ? object.customer : null,
    provider_subscription_id: providerSubscriptionId,
    status,
    current_period_start: dateFromUnix(object.current_period_start),
    current_period_end: dateFromUnix(object.current_period_end),
    cancel_at_period_end: object.cancel_at_period_end === true,
    ended_at: status === "canceled" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const result = await admin.from("subscriptions")
    .upsert(row, { onConflict: "provider,provider_subscription_id" })
    .select("id,user_id,plan_code")
    .single();
  if (result.error) throw result.error;
  if (order) {
    await admin.from("payment_orders").update({
      subscription_id: result.data.id,
      updated_at: new Date().toISOString(),
    }).eq("id", order.id);
  }
  return result.data;
}

async function handleStripeMembershipEvent(
  admin: ReturnType<typeof serviceClient>,
  event: Record<string, unknown>,
  type: string,
): Promise<Response | undefined> {
  const object = eventObject(event);
  if (!object) return json(400, { code: "subscription_payload_missing" });
  if (type === "checkout.session.completed") {
    if (object.mode !== "subscription") return undefined;
    const subscriptionId = typeof object.subscription === "string" ? object.subscription : undefined;
    if (!subscriptionId) return json(400, { code: "subscription_id_missing" });
    const subscriptionObject = {
      id: subscriptionId,
      metadata: object.metadata,
      customer: object.customer,
      status: "incomplete",
    };
    await upsertStripeSubscription(admin, subscriptionObject);
    return json(200, { received: true, subscription: "created" });
  }
  if (type === "customer.subscription.created" || type === "customer.subscription.updated" || type === "customer.subscription.deleted") {
    await upsertStripeSubscription(admin, object);
    return json(200, { received: true, subscription: type });
  }
  const subscriptionId = typeof object.subscription === "string" ? object.subscription : undefined;
  if (!subscriptionId) return json(400, { code: "subscription_id_missing" });
  const subscriptionResult = await admin.from("subscriptions")
    .select("id,user_id,provider,plan_code,status")
    .eq("provider", "stripe")
    .eq("provider_subscription_id", subscriptionId)
    .maybeSingle();
  if (subscriptionResult.error) throw subscriptionResult.error;
  if (!subscriptionResult.data) return json(409, { code: "subscription_not_ready" });
  if (type === "invoice.payment_failed" || type === "invoice.payment_action_required") {
    await admin.from("subscriptions").update({
      status: type === "invoice.payment_action_required" ? "incomplete" : "past_due",
      updated_at: new Date().toISOString(),
    }).eq("id", subscriptionResult.data.id);
    return json(200, { received: true, subscription: "payment_failed" });
  }
  if (type !== "invoice.paid") return undefined;
  const lines = object.lines;
  const firstLine = typeof lines === "object" && lines !== null && !Array.isArray(lines)
    ? (lines as Record<string, unknown>).data
    : undefined;
  const lineObject = Array.isArray(firstLine) && firstLine[0] && typeof firstLine[0] === "object"
    ? firstLine[0] as Record<string, unknown>
    : undefined;
  const linePeriod = lineObject?.period;
  const period = typeof linePeriod === "object" && linePeriod !== null && !Array.isArray(linePeriod)
    ? linePeriod as Record<string, unknown>
    : undefined;
  const periodStart = dateFromUnix(object.period_start) ?? dateFromUnix(period?.start);
  const periodEnd = dateFromUnix(object.period_end) ?? dateFromUnix(period?.end);
  if (!periodStart || !periodEnd) return json(400, { code: "invoice_period_missing" });
  const periodUpdate = await admin.from("subscriptions").update({
    status: "active",
    current_period_start: periodStart,
    current_period_end: periodEnd,
    updated_at: new Date().toISOString(),
  }).eq("id", subscriptionResult.data.id);
  if (periodUpdate.error) throw periodUpdate.error;
  const grant = await admin.rpc("grant_subscription_cycle", {
    p_subscription_id: subscriptionResult.data.id,
    p_provider: "stripe",
    p_provider_invoice_id: typeof object.id === "string" ? object.id : null,
    p_provider_event_id: typeof event.id === "string" ? event.id : null,
    p_period_start: periodStart,
    p_period_end: periodEnd,
  });
  if (grant.error) throw grant.error;
  await admin.from("payment_orders")
    .update({ status: "paid", subscription_id: subscriptionResult.data.id, paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("subscription_id", subscriptionResult.data.id)
    .in("status", ["created", "pending"]);
  return json(200, { received: true, fulfillment: "subscription_cycle_granted" });
}

async function handleZpay(request: Request): Promise<Response> {
  const pid = Deno.env.get("ZPAY_PID")?.trim();
  const key = Deno.env.get("ZPAY_KEY")?.trim();
  if (!pid || !key) return text(503, "fail");
  const params: Record<string, string> = {};
  for (const [name, value] of new URL(request.url).searchParams.entries()) params[name] = value;
  if (params.pid !== pid || params.sign_type?.toUpperCase() !== "MD5" ||
    params.trade_status !== "TRADE_SUCCESS" || !params.out_trade_no || !params.money ||
    !params.trade_no || !verifyZpaySignature(params, key)) {
    return text(400, "fail");
  }
  const amountMinor = parseZpayAmountMinor(params.money);
  if (amountMinor === undefined) return text(400, "fail");
  const admin = serviceClient();
  const order = await admin.from("payment_orders")
    .select("id, amount_minor, status, product_code")
    .eq("provider", "zpay")
    .eq("provider_order_id", params.out_trade_no)
    .maybeSingle();
  if (order.error || !order.data || order.data.amount_minor !== amountMinor) return text(400, "fail");
  if (order.data.status === "paid") return text(200, "success");
  const result = order.data.product_code === "membership"
    ? await admin.rpc("fulfill_manual_membership_payment", {
      p_order_id: order.data.id,
      p_provider_order_id: params.out_trade_no,
    })
    : await admin.rpc("fulfill_payment_order", {
      p_order_id: order.data.id,
      p_provider_order_id: params.out_trade_no,
    });
  return result.error ? text(500, "fail") : text(200, "success");
}

Deno.serve(async (request) => {
  if (request.method === "GET") {
    try {
      return await handleZpay(request);
    } catch (error) {
      console.error("zpay webhook failed", error instanceof Error ? error.message : "unknown_error");
      return text(500, "fail");
    }
  }
  if (request.method !== "POST") return json(405, { code: "method_not_allowed" });
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return json(503, { code: "stripe_webhook_not_configured" });
  const payload = await request.text();
  if (!await verifyStripeSignature(payload, signature, secret)) {
    return json(400, { code: "invalid_signature" });
  }

  try {
    const event = JSON.parse(payload) as Record<string, unknown>;
    const type = event.type;
    if (type !== "checkout.session.completed" && type !== "checkout.session.async_payment_succeeded" &&
      type !== "payment_intent.succeeded" &&
      type !== "checkout.session.expired" && type !== "checkout.session.async_payment_failed" &&
      type !== "charge.refunded" && type !== "refund.updated" &&
      type !== "customer.subscription.created" && type !== "customer.subscription.updated" &&
      type !== "customer.subscription.deleted" && type !== "invoice.paid" &&
      type !== "invoice.payment_failed" && type !== "invoice.payment_action_required") {
      return json(200, { received: true });
    }
    const admin = serviceClient();
    if (type === "checkout.session.completed" || type.startsWith("customer.subscription.") || type.startsWith("invoice.")) {
      const membershipResult = await handleStripeMembershipEvent(admin, event, type);
      if (membershipResult) return membershipResult;
    }
    if (type === "charge.refunded" || type === "refund.updated") {
      const details = stripeRefundDetails(event);
      if (!details) return json(400, { code: "refund_metadata_missing" });
      if (type === "refund.updated" && details.status !== "succeeded") {
        return json(200, { received: true, refund: details.status ?? "unknown" });
      }
      let query = admin.from("payment_orders")
        .select("id,amount_minor,currency,status")
        .eq("provider", "stripe");
      if (details.orderId) query = query.eq("id", details.orderId);
      else if (details.providerPaymentId) query = query.eq("provider_order_id", details.providerPaymentId);
      else return json(400, { code: "refund_metadata_missing" });
      const order = await query.maybeSingle();
      if (order.error || !order.data) return json(404, { code: "payment_not_found" });
      if (order.data.amount_minor !== details.amountMinor ||
        details.currency && order.data.currency !== details.currency) {
        return json(200, { received: true, refund: "partial_or_mismatched" });
      }
      const refunded = await admin.rpc("refund_payment_order", {
        p_order_id: order.data.id,
        p_provider_reference: details.refundId,
      });
      if (refunded.error) return json(500, { code: "payment_refund_failed" });
      return json(200, { received: true, refund: refunded.data });
    }
    if (type === "checkout.session.expired" || type === "checkout.session.async_payment_failed") {
      const details = stripeOrderDetails(event);
      if (!details) return json(400, { code: "payment_metadata_missing" });
      const finalStatus = type === "checkout.session.expired" ? "cancelled" : "failed";
      const failed = await admin.rpc("mark_payment_order_final", {
        p_order_id: details.orderId,
        p_provider_order_id: details.providerOrderId,
        p_status: finalStatus,
      });
      if (failed.error) return json(500, { code: "payment_status_update_failed" });
      return json(200, { received: true, fulfillment: failed.data });
    }
    const details = stripePaymentDetails(event);
    if (!details) return json(400, { code: "payment_evidence_missing" });
    if (!details.paid) return json(200, { received: true, payment: "pending" });
    const order = await admin.from("payment_orders")
      .select("id,amount_minor,currency")
      .eq("id", details.orderId)
      .eq("provider", "stripe")
      .maybeSingle();
    if (order.error || !order.data) return json(404, { code: "payment_not_found" });
    if (order.data.amount_minor !== details.amountMinor || order.data.currency !== details.currency) {
      return json(400, { code: "payment_amount_mismatch" });
    }
    const result = await admin.rpc("fulfill_payment_order", {
      p_order_id: details.orderId,
      p_provider_order_id: details.providerOrderId,
    });
    if (result.error) {
      console.error("payment fulfillment failed", { code: result.error.code });
      return json(500, { code: "payment_fulfillment_failed" });
    }
    return json(200, { received: true, fulfillment: result.data });
  } catch (error) {
    console.error("payment-webhook failed", error instanceof Error ? error.message : "unknown_error");
    return json(500, { code: "unexpected_error" });
  }
});
