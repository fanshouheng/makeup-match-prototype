import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.110.7";
import { isAuthorizedAdmin } from "../_shared/adminAuthorization.ts";

type Action = "claimReferral" | "grantPoints" | "grantPurchase" | "recordMatchSuccess" | "status";

interface RequestBody {
  action?: Action;
  consumeBonus?: boolean;
  membershipAccess?: boolean;
  credits?: number;
  email?: string;
  points?: number;
  referralCode?: string;
  successId?: string;
}

interface RewardStatusRow {
  referral_code: string;
  match_credits: number;
  ai_credits: number;
  successful_match_count: number;
  successful_invites: number;
  pending_referral: boolean;
  points: number;
  membership_match_mode: "daily" | "unlimited" | null;
  membership_matches_remaining: number | null;
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
    ) return origin;
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

function reply(origin: string, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
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

function publishableKey(): string | undefined {
  return Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    keyFromCollection("SUPABASE_PUBLISHABLE_KEYS");
}

function secretKey(): string | undefined {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    keyFromCollection("SUPABASE_SECRET_KEYS");
}

function rewardResponse(row: RewardStatusRow): Record<string, unknown> {
  return {
    referralCode: row.referral_code,
    matchCredits: row.match_credits,
    // Temporary compatibility for the deployed pre-points frontend.
    aiCredits: Math.floor(row.points / 3),
    points: row.points,
    successfulMatchCount: row.successful_match_count,
    successfulInvites: row.successful_invites,
    pendingReferral: row.pending_referral,
    membershipMatchMode: row.membership_match_mode,
    membershipMatchesRemaining: row.membership_matches_remaining,
  };
}

async function authenticate(
  request: Request,
  origin: string,
): Promise<{ user: User; admin: SupabaseClient } | Response> {
  const authorization = request.headers.get("authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = publishableKey();
  const serviceKey = secretKey();
  if (!url || !anonKey || !serviceKey) {
    return reply(origin, 503, { code: "service_not_configured" });
  }
  if (!authorization) return reply(origin, 401, { code: "auth_required" });

  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return reply(origin, 401, { code: "auth_required" });
  const userClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await userClient.auth.getUser(accessToken);
  if (error || !data.user || !data.user.email) {
    return reply(origin, 401, { code: "auth_required" });
  }

  return {
    user: data.user,
    admin: createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  };
}

async function loadStatus(admin: SupabaseClient, userId: string): Promise<RewardStatusRow> {
  const [balance, membership] = await Promise.all([
    admin.rpc("get_point_balance", { p_user_id: userId }),
    admin.rpc("get_membership_match_status", { p_user_id: userId }),
  ]);
  if (balance.error) throw balance.error;
  if (membership.error) throw membership.error;
  const result = await admin.rpc("get_reward_status", { p_user_id: userId });
  if (result.error) throw result.error;
  const row = result.data?.[0] as RewardStatusRow | undefined;
  if (!row) throw new Error("reward_status_missing");
  const membershipRow = membership.data?.[0] as Pick<RewardStatusRow, "membership_match_mode" | "membership_matches_remaining"> | undefined;
  return {
    ...row,
    points: Number(balance.data),
    membership_match_mode: membershipRow?.membership_match_mode ?? null,
    membership_matches_remaining: membershipRow?.membership_matches_remaining ?? null,
  };
}

function knownDatabaseCode(message: string): string | undefined {
  return [
    "account_not_found",
    "email_not_confirmed",
    "invalid_credit_amount",
    "invalid_point_amount",
    "no_match_credits",
    "daily_match_limit_reached",
    "referral_already_claimed",
    "referral_invalid",
    "self_referral",
  ].find((code) => message.includes(code));
}

Deno.serve(async (request) => {
  const origin = resolveOrigin(request);
  if (!origin) {
    return new Response(JSON.stringify({ code: "origin_not_allowed" }), {
      status: 403,
      headers: headers("null"),
    });
  }
  if (request.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  if (request.method !== "POST") return reply(origin, 405, { code: "method_not_allowed" });

  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return reply(origin, 400, { code: "invalid_request" });
    }
    const body = parsed as RequestBody;
    const identity = await authenticate(request, origin);
    if (identity instanceof Response) return identity;

    if (body.action === "status") {
      if (Object.keys(body).some((key) => key !== "action")) {
        return reply(origin, 400, { code: "invalid_request" });
      }
      return reply(origin, 200, { rewards: rewardResponse(await loadStatus(identity.admin, identity.user.id)) });
    }

    if (body.action === "claimReferral") {
      if (
        Object.keys(body).some((key) => !["action", "referralCode"].includes(key)) ||
        typeof body.referralCode !== "string"
      ) return reply(origin, 400, { code: "invalid_request" });
      const result = await identity.admin.rpc("claim_reward_referral", {
        p_user_id: identity.user.id,
        p_referral_code: body.referralCode,
      });
      if (result.error) {
        return reply(origin, 400, { code: knownDatabaseCode(result.error.message) ?? "referral_invalid" });
      }
      return reply(origin, 200, { rewards: rewardResponse(await loadStatus(identity.admin, identity.user.id)) });
    }

    if (body.action === "recordMatchSuccess") {
      if (
        Object.keys(body).some((key) => !["action", "consumeBonus", "membershipAccess", "successId"].includes(key)) ||
        typeof body.consumeBonus !== "boolean" ||
        body.membershipAccess !== undefined && typeof body.membershipAccess !== "boolean" ||
        typeof body.successId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.successId)
      ) return reply(origin, 400, { code: "invalid_request" });
      const result = body.membershipAccess
        ? await identity.admin.rpc("record_membership_match_success", {
          p_user_id: identity.user.id,
          p_success_id: body.successId,
        })
        : await identity.admin.rpc("record_reward_match_success", {
          p_user_id: identity.user.id,
          p_success_id: body.successId,
          p_consume_bonus: body.consumeBonus,
        });
      if (result.error) {
        const code = knownDatabaseCode(result.error.message);
        return reply(origin, code === "no_match_credits" || code === "daily_match_limit_reached" ? 409 : 400, { code: code ?? "invalid_request" });
      }
      return reply(origin, 200, { rewards: rewardResponse(await loadStatus(identity.admin, identity.user.id)) });
    }

    if (body.action === "grantPoints" || body.action === "grantPurchase") {
      const isLegacyPurchase = body.action === "grantPurchase";
      const allowedKeys = isLegacyPurchase ? ["action", "credits", "email"] : ["action", "email", "points"];
      const points = isLegacyPurchase ? 30 : body.points;
      if (Object.keys(body).some((key) => !allowedKeys.includes(key)) ||
        typeof body.email !== "string" ||
        isLegacyPurchase && body.credits !== 10 ||
        !Number.isInteger(points) || Number(points) <= 0 || Number(points) > 100000) {
        return reply(origin, 400, { code: "invalid_request" });
      }
      if (!isAuthorizedAdmin(identity.user, Deno.env.get("ADMIN_USER_IDS"))) {
        return reply(origin, 403, { code: "not_admin" });
      }
      const result = await identity.admin.rpc("grant_points_by_email", {
        p_email: body.email.trim().toLowerCase(),
        p_admin_id: identity.user.id,
        p_points: Number(points),
        p_reference_id: crypto.randomUUID(),
      });
      if (result.error) {
        const code = knownDatabaseCode(result.error.message);
        return reply(origin, code === "account_not_found" ? 404 : 400, { code: code ?? "invalid_request" });
      }
      const granted = (result.data as Array<{ user_id: string }> | null)?.[0];
      if (!granted) throw new Error("reward_status_missing");
      return reply(origin, 200, { rewards: rewardResponse(await loadStatus(identity.admin, granted.user_id)) });
    }

    return reply(origin, 400, { code: "unsupported_action" });
  } catch (error) {
    console.error("rewards-access failed", error instanceof Error ? error.message : "unknown_error");
    return reply(origin, 500, { code: "unexpected_error" });
  }
});
