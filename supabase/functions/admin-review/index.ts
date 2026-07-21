import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.110.7";

const PHOTO_BUCKET = "creator-photos";
const SIGNED_URL_TTL_SECONDS = 300;
const MAX_REVIEW_NOTE_LENGTH = 500;

type Action = "list" | "verify" | "approve" | "reject" | "cleanup";
interface RequestBody { action?: Action; submissionId?: string; reviewNote?: string; }

function configuredOrigins(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
}

function resolveOrigin(request: Request): string | undefined {
  const origin = request.headers.get("origin") ?? "";
  if (!origin) return undefined;
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
    Vary: "Origin",
  };
}

function reply(origin: string, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}

function secretKey(): string | undefined {
  const modernKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modernKeys) {
    try { return JSON.parse(modernKeys).default as string | undefined; } catch { return undefined; }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

function adminEmails(): Set<string> {
  return new Set((Deno.env.get("ADMIN_EMAILS") ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
}

async function authenticate(request: Request, origin: string): Promise<{ user: User; admin: SupabaseClient } | Response> {
  const authorization = request.headers.get("authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = secretKey();
  if (!authorization || !url || !anonKey || !serviceKey) return reply(origin, 503, { code: "service_not_configured" });
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return reply(origin, 401, { code: "auth_required" });

  const userClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await userClient.auth.getUser(accessToken);
  if (error || !data.user || !data.user.email) return reply(origin, 401, { code: "auth_required" });
  if (!adminEmails().has(data.user.email.toLowerCase())) return reply(origin, 403, { code: "not_admin" });

  return { user: data.user, admin: createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }) };
}

async function signedPhotoMap(admin: SupabaseClient, paths: string[]): Promise<Map<string, string>> {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (uniquePaths.length === 0) return new Map();
  const { data, error } = await admin.storage.from(PHOTO_BUCKET).createSignedUrls(uniquePaths, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  return new Map((data ?? []).flatMap((item) => item.signedUrl ? [[item.path, item.signedUrl] as const] : []));
}

async function listData(admin: SupabaseClient): Promise<Record<string, unknown>> {
  const [submissionsResult, creatorsResult] = await Promise.all([
    admin.from("creator_submissions")
      .select("id,name,contact_email,douyin_url,tutorial_url,reference_photo_path,quality_metrics,status,submitted_at,ownership_verified_at,reviewed_at,review_note")
      .eq("status", "pending")
      .order("submitted_at", { ascending: true }),
    admin.from("creators")
      .select("id,submission_id,name,douyin_url,tutorial_url,reference_photo_path,is_active,created_at,updated_at")
      .order("created_at", { ascending: false }),
  ]);
  if (submissionsResult.error) throw submissionsResult.error;
  if (creatorsResult.error) throw creatorsResult.error;
  const submissions = submissionsResult.data ?? [];
  const creators = creatorsResult.data ?? [];
  const photos = await signedPhotoMap(admin, [...submissions, ...creators].map((row) => row.reference_photo_path));
  return {
    submissions: submissions.map(({ reference_photo_path, ...row }) => ({ ...row, reference_photo_url: photos.get(reference_photo_path) ?? null })),
    creators: creators.map(({ reference_photo_path, ...row }) => ({ ...row, reference_photo_url: photos.get(reference_photo_path) ?? null })),
  };
}

async function submission(admin: SupabaseClient, id: string) {
  const result = await admin.from("creator_submissions").select("id,status,reference_photo_path").eq("id", id).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

Deno.serve(async (request) => {
  const origin = resolveOrigin(request);
  if (!origin) return new Response(JSON.stringify({ code: "origin_not_allowed" }), { status: 403, headers: headers("null") });
  if (request.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  if (request.method !== "POST") return reply(origin, 405, { code: "method_not_allowed" });

  try {
    const identity = await authenticate(request, origin);
    if (identity instanceof Response) return identity;
    const body = await request.json() as RequestBody;
    const action = body.action;
    if (!action) return reply(origin, 400, { code: "action_required" });

    if (action === "list") return new Response(JSON.stringify(await listData(identity.admin)), { status: 200, headers: headers(origin) });
    if (!body.submissionId) return reply(origin, 400, { code: "submission_required" });

    const current = await submission(identity.admin, body.submissionId);
    if (!current) return reply(origin, 404, { code: "submission_not_found" });

    if (action === "verify") {
      if (current.status !== "pending") return reply(origin, 409, { code: "submission_already_reviewed" });
      const result = await identity.admin.from("creator_submissions").update({ ownership_verified_at: new Date().toISOString() }).eq("id", body.submissionId).eq("status", "pending").is("ownership_verified_at", null);
      if (result.error) throw result.error;
      return reply(origin, 200, { ok: true });
    }

    if (action === "approve") {
      if (current.status !== "pending") return reply(origin, 409, { code: "submission_already_reviewed" });
      const { data, error } = await identity.admin.rpc("approve_creator_submission", { submission_uuid: body.submissionId });
      if (error) throw error;
      return reply(origin, 200, { ok: true, creatorId: data });
    }

    if (action === "reject") {
      const note = body.reviewNote?.trim() ?? "";
      if (!note || note.length > MAX_REVIEW_NOTE_LENGTH) return reply(origin, 400, { code: "review_note_required" });
      if (current.status !== "pending") return reply(origin, 409, { code: "submission_already_reviewed" });
      const result = await identity.admin.from("creator_submissions").update({ status: "rejected", reviewed_at: new Date().toISOString(), review_note: note }).eq("id", body.submissionId).eq("status", "pending");
      if (result.error) throw result.error;
      const cleanup = current.reference_photo_path ? await identity.admin.storage.from(PHOTO_BUCKET).remove([current.reference_photo_path]) : { error: null };
      return reply(origin, 200, { ok: true, photoCleanup: cleanup.error ? "failed" : "complete" });
    }

    if (action === "cleanup") {
      if (current.status !== "rejected") return reply(origin, 409, { code: "submission_not_rejected" });
      const cleanup = current.reference_photo_path ? await identity.admin.storage.from(PHOTO_BUCKET).remove([current.reference_photo_path]) : { error: null };
      if (cleanup.error) throw cleanup.error;
      return reply(origin, 200, { ok: true, photoCleanup: "complete" });
    }

    return reply(origin, 400, { code: "unsupported_action" });
  } catch {
    return reply(origin, 500, { code: "unexpected_error" });
  }
});
