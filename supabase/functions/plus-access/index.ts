import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.110.7";
import {
  generateInviteCode,
  hashInviteCode,
  normalizeInviteCode,
} from "../_shared/plusInvite.ts";
import {
  isValidPlusEmail,
  isValidPlusPassword,
} from "../_shared/plusAccountValidation.ts";

type Action = "issue" | "redeem" | "register" | "status";

interface RequestBody {
  action?: Action;
  email?: string;
  inviteCode?: string;
  password?: string;
}

interface PlusMembershipRow {
  user_id: string;
  tier: "early_access";
  status: "active" | "revoked";
  trial_credits: number;
  activated_at: string;
  benefit_expires_at: string;
}

function configuredOrigins(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function resolveOrigin(request: Request): string | undefined {
  const origin = request.headers.get("origin") ?? "";
  if (!origin) return undefined;
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

function adminEmails(): Set<string> {
  return new Set(
    (Deno.env.get("ADMIN_EMAILS") ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function membershipResponse(row: PlusMembershipRow): Record<string, unknown> {
  return {
    userId: row.user_id,
    tier: row.tier,
    status: row.status,
    trialCredits: row.trial_credits,
    activatedAt: row.activated_at,
    benefitExpiresAt: row.benefit_expires_at,
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

async function status(admin: SupabaseClient, userId: string): Promise<PlusMembershipRow | null> {
  const result = await admin
    .from("plus_memberships")
    .select("user_id,tier,status,trial_credits,activated_at,benefit_expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data as PlusMembershipRow | null;
}

async function register(body: RequestBody, origin: string): Promise<Response> {
  const keys = Object.keys(body);
  if (keys.some((key) => !["action", "email", "password", "inviteCode"].includes(key))) {
    return reply(origin, 400, { code: "invalid_request" });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const inviteCode = typeof body.inviteCode === "string"
    ? normalizeInviteCode(body.inviteCode)
    : undefined;
  if (!isValidPlusEmail(email)) return reply(origin, 400, { code: "invalid_email" });
  if (!isValidPlusPassword(password)) return reply(origin, 400, { code: "invalid_password" });
  if (!inviteCode) return reply(origin, 400, { code: "invite_invalid" });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = secretKey();
  if (!url || !serviceKey) return reply(origin, 503, { code: "service_not_configured" });
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const codeHash = await hashInviteCode(inviteCode);
  const inviteResult = await admin
    .from("plus_invites")
    .select("expires_at,redeemed_at")
    .eq("code_hash", codeHash)
    .maybeSingle();
  if (inviteResult.error) throw inviteResult.error;
  if (!inviteResult.data) return reply(origin, 400, { code: "invite_invalid" });
  if (inviteResult.data.redeemed_at) return reply(origin, 400, { code: "invite_redeemed" });
  if (new Date(inviteResult.data.expires_at).getTime() <= Date.now()) {
    return reply(origin, 400, { code: "invite_expired" });
  }

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) {
    if (
      created.error.code === "email_exists" ||
      created.error.code === "user_already_exists"
    ) {
      return reply(origin, 409, { code: "email_exists" });
    }
    if (created.error.code === "weak_password") {
      return reply(origin, 400, { code: "invalid_password" });
    }
    throw created.error;
  }

  const userId = created.data.user.id;
  const redeemed = await admin.rpc("redeem_plus_invite", {
    p_code_hash: codeHash,
    p_user_id: userId,
  });
  if (redeemed.error || !redeemed.data?.[0]) {
    const cleanup = await admin.auth.admin.deleteUser(userId);
    if (cleanup.error) console.error("plus registration cleanup failed");
    const knownCode = ["invite_invalid", "invite_expired", "invite_redeemed"]
      .find((code) => redeemed.error?.message.includes(code));
    if (knownCode) return reply(origin, 400, { code: knownCode });
    throw redeemed.error ?? new Error("membership_missing_after_register");
  }

  return reply(origin, 200, { registered: true });
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
    const parsedBody = await request.json();
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      return reply(origin, 400, { code: "invalid_request" });
    }
    const body = parsedBody as RequestBody;
    if (!body.action) return reply(origin, 400, { code: "action_required" });
    if (body.action === "register") return await register(body, origin);

    const identity = await authenticate(request, origin);
    if (identity instanceof Response) return identity;
    const keys = Object.keys(body);

    if (body.action === "status") {
      if (keys.some((key) => key !== "action")) {
        return reply(origin, 400, { code: "invalid_request" });
      }
      const membership = await status(identity.admin, identity.user.id);
      return reply(origin, 200, {
        membership: membership ? membershipResponse(membership) : null,
      });
    }

    if (body.action === "redeem") {
      if (keys.some((key) => key !== "action" && key !== "inviteCode")) {
        return reply(origin, 400, { code: "invalid_request" });
      }
      const inviteCode = typeof body.inviteCode === "string"
        ? normalizeInviteCode(body.inviteCode)
        : undefined;
      if (!inviteCode) return reply(origin, 400, { code: "invite_invalid" });
      const codeHash = await hashInviteCode(inviteCode);
      const result = await identity.admin.rpc("redeem_plus_invite", {
        p_code_hash: codeHash,
        p_user_id: identity.user.id,
      });
      if (result.error) {
        const knownCode = ["invite_invalid", "invite_expired", "invite_redeemed"]
          .find((code) => result.error.message.includes(code));
        if (knownCode) return reply(origin, 400, { code: knownCode });
        throw result.error;
      }
      const membership = (result.data?.[0] ?? null) as PlusMembershipRow | null;
      if (!membership) throw new Error("membership_missing_after_redeem");
      return reply(origin, 200, { membership: membershipResponse(membership) });
    }

    if (body.action === "issue") {
      if (keys.some((key) => key !== "action")) {
        return reply(origin, 400, { code: "invalid_request" });
      }
      if (!adminEmails().has(identity.user.email!.toLowerCase())) {
        return reply(origin, 403, { code: "not_admin" });
      }
      const inviteCode = generateInviteCode();
      const codeHash = await hashInviteCode(inviteCode);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const result = await identity.admin.from("plus_invites").insert({
        code_hash: codeHash,
        created_by: identity.user.id,
        expires_at: expiresAt,
      });
      if (result.error) throw result.error;
      return reply(origin, 200, { inviteCode, expiresAt });
    }

    return reply(origin, 400, { code: "unsupported_action" });
  } catch (error) {
    console.error("plus-access failed", error instanceof Error ? error.message : "unknown_error");
    return reply(origin, 500, { code: "unexpected_error" });
  }
});
