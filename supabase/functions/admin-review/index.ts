import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.110.7";

const PHOTO_BUCKET = "creator-photos";
const SIGNED_URL_TTL_SECONDS = 300;
const MAX_REVIEW_NOTE_LENGTH = 500;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const CONSENT_VERSION = "2026-07-21";
const PRODUCT_METRICS_DAYS = 7;
const PRODUCT_EVENT_NAMES = [
  "photo_selected",
  "analysis_succeeded",
  "analysis_failed",
  "match_result_view",
  "feedback_yes",
  "feedback_no",
  "share_succeeded",
] as const;
const FEATURE_KEYS = [
  "faceAspectRatio", "jawToCheekRatio", "foreheadToCheekRatio",
  "lowerThirdRatio", "eyeSpacingRatio", "eyeAspectRatio",
  "noseWidthRatio", "lipWidthRatio", "lipAspectRatio",
] as const;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
type Action = "list" | "create" | "verify" | "approve" | "reject" | "cleanup" | "set_active" | "delete_creator";
interface RequestBody {
  action?: Action;
  submissionId?: string;
  creatorId?: string;
  isActive?: boolean;
  confirmName?: string;
  reviewNote?: string;
}

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
  return new Set((Deno.env.get("ADMIN_EMAILS") ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function requiredText(formData: FormData, key: string, maxLength: number): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : undefined;
}

function parseObject(value: FormDataEntryValue | null): Record<string, unknown> | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function isFeatureVector(value: Record<string, unknown> | undefined): boolean {
  return Boolean(value && FEATURE_KEYS.every((key) => typeof value[key] === "number" && Number.isFinite(value[key])));
}

function isDouyinUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "douyin.com" || url.hostname.endsWith(".douyin.com"));
  } catch {
    return false;
  }
}

function extensionForMimeType(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

async function authenticate(request: Request, origin: string): Promise<{ user: User; admin: SupabaseClient } | Response> {
  const authorization = request.headers.get("authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = publishableKey();
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

async function productMetrics(admin: SupabaseClient): Promise<Record<string, string | number>> {
  const periodStart = new Date(Date.now() - PRODUCT_METRICS_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const counts = await Promise.all(PRODUCT_EVENT_NAMES.map(async (eventName) => {
    const result = await admin.from("product_events")
      .select("session_id", { count: "exact", head: true })
      .eq("event_name", eventName)
      .gte("created_at", periodStart);
    if (result.error) throw result.error;
    return [eventName, result.count ?? 0] as const;
  }));

  return { period_start: periodStart, ...Object.fromEntries(counts) };
}

async function listData(admin: SupabaseClient): Promise<Record<string, unknown>> {
  const [submissionsResult, creatorsResult, metrics] = await Promise.all([
    admin.from("creator_submissions")
      .select("id,name,contact_email,douyin_url,tutorial_url,reference_photo_path,quality_metrics,status,submitted_at,ownership_verified_at,reviewed_at,review_note")
      .eq("status", "pending")
      .order("submitted_at", { ascending: true }),
    admin.from("creators")
      .select("id,submission_id,name,douyin_url,tutorial_url,reference_photo_path,is_active,created_at,updated_at")
      .order("created_at", { ascending: false }),
    productMetrics(admin),
  ]);
  if (submissionsResult.error) throw submissionsResult.error;
  if (creatorsResult.error) throw creatorsResult.error;
  const submissions = submissionsResult.data ?? [];
  const creators = creatorsResult.data ?? [];
  const photos = await signedPhotoMap(admin, [...submissions, ...creators].map((row) => row.reference_photo_path));
  return {
    submissions: submissions.map(({ reference_photo_path, ...row }) => ({ ...row, reference_photo_url: photos.get(reference_photo_path) ?? null })),
    creators: creators.map(({ reference_photo_path, ...row }) => ({ ...row, reference_photo_url: photos.get(reference_photo_path) ?? null })),
    product_metrics: metrics,
  };
}

async function createSubmission(admin: SupabaseClient, user: User, formData: FormData, origin: string): Promise<Response> {
  const name = requiredText(formData, "name", 60);
  const contactEmail = requiredText(formData, "contactEmail", 320);
  const douyinUrl = requiredText(formData, "douyinUrl", 2048);
  const tutorialValue = formData.get("tutorialUrl");
  const tutorialUrl = typeof tutorialValue === "string" ? tutorialValue.trim() : "";
  const referencePhoto = formData.get("referencePhoto");
  const featureVector = parseObject(formData.get("featureVector"));
  const qualityMetrics = parseObject(formData.get("qualityMetrics"));
  const consentVersion = requiredText(formData, "consentVersion", 40);

  if (
    !name || !contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) ||
    !douyinUrl || !isDouyinUrl(douyinUrl) || (tutorialUrl && !isDouyinUrl(tutorialUrl)) ||
    !(referencePhoto instanceof File) || referencePhoto.size > MAX_PHOTO_BYTES ||
    !ALLOWED_MIME_TYPES.has(referencePhoto.type) || !isFeatureVector(featureVector) ||
    !qualityMetrics || consentVersion !== CONSENT_VERSION
  ) {
    return reply(origin, 400, { code: "invalid_submission" });
  }

  const [emailMatch, profileMatch] = await Promise.all([
    admin.from("creator_submissions").select("id").eq("contact_email", contactEmail).in("status", ["pending", "approved"]).limit(1),
    admin.from("creator_submissions").select("id").eq("douyin_url", douyinUrl).in("status", ["pending", "approved"]).limit(1),
  ]);
  if (emailMatch.error) throw emailMatch.error;
  if (profileMatch.error) throw profileMatch.error;
  if ((emailMatch.data?.length ?? 0) > 0 || (profileMatch.data?.length ?? 0) > 0) {
    return reply(origin, 409, { code: "duplicate_submission" });
  }

  const submissionId = crypto.randomUUID();
  const photoPath = `submissions/${submissionId}/reference.${extensionForMimeType(referencePhoto.type)}`;
  const upload = await admin.storage.from(PHOTO_BUCKET).upload(photoPath, referencePhoto, {
    cacheControl: "3600",
    contentType: referencePhoto.type,
    upsert: false,
  });
  if (upload.error) throw upload.error;

  const inserted = await admin.from("creator_submissions").insert({
    id: submissionId,
    name,
    contact_email: contactEmail,
    douyin_url: douyinUrl,
    tutorial_url: tutorialUrl || null,
    reference_photo_path: photoPath,
    feature_vector: featureVector,
    quality_metrics: qualityMetrics,
    consent_version: consentVersion,
    review_note: `管理员 ${user.email ?? user.id} 代录：资料由创作者本人提供并授权使用，待归属核验。`,
  });
  if (inserted.error) {
    await admin.storage.from(PHOTO_BUCKET).remove([photoPath]);
    throw inserted.error;
  }
  return reply(origin, 201, { submissionId });
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

  let stage = "authenticate";
  try {
    const identity = await authenticate(request, origin);
    if (identity instanceof Response) return identity;
    stage = "parse_request";
    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const formData = await request.formData();
      if (formData.get("action") !== "create") return reply(origin, 400, { code: "unsupported_action" });
      stage = "create";
      return await createSubmission(identity.admin, identity.user, formData, origin);
    }
    const body = await request.json() as RequestBody;
    const action = body.action;
    if (!action) return reply(origin, 400, { code: "action_required" });

    if (action === "list") {
      stage = "list";
      return new Response(JSON.stringify(await listData(identity.admin)), { status: 200, headers: headers(origin) });
    }

    if (action === "set_active") {
      stage = "set_active";
      if (!body.creatorId || typeof body.isActive !== "boolean") {
        return reply(origin, 400, { code: "creator_action_invalid" });
      }
      const result = await identity.admin.from("creators")
        .update({ is_active: body.isActive, updated_at: new Date().toISOString() })
        .eq("id", body.creatorId)
        .select("id")
        .maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return reply(origin, 404, { code: "creator_not_found" });
      return reply(origin, 200, { ok: true });
    }

    if (action === "delete_creator") {
      stage = "delete_lookup";
      if (!body.creatorId || !body.confirmName) return reply(origin, 400, { code: "creator_action_invalid" });
      const creatorResult = await identity.admin.from("creators")
        .select("id,submission_id,name,reference_photo_path")
        .eq("id", body.creatorId)
        .maybeSingle();
      if (creatorResult.error) throw creatorResult.error;
      const creator = creatorResult.data;
      if (!creator) return reply(origin, 404, { code: "creator_not_found" });
      if (body.confirmName !== creator.name) return reply(origin, 400, { code: "confirmation_mismatch" });

      stage = "delete_deactivate";
      const deactivated = await identity.admin.from("creators")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", creator.id);
      if (deactivated.error) throw deactivated.error;

      stage = "delete_photo";
      const photoCleanup = await identity.admin.storage.from(PHOTO_BUCKET).remove([creator.reference_photo_path]);
      if (photoCleanup.error) throw photoCleanup.error;

      stage = "delete_creator";
      const creatorDelete = await identity.admin.from("creators").delete().eq("id", creator.id);
      if (creatorDelete.error) throw creatorDelete.error;

      stage = "delete_submission";
      const submissionDelete = await identity.admin.from("creator_submissions")
        .delete()
        .eq("id", creator.submission_id)
        .eq("status", "approved");
      if (submissionDelete.error) throw submissionDelete.error;
      return reply(origin, 200, { ok: true });
    }

    if (!body.submissionId) return reply(origin, 400, { code: "submission_required" });

    const current = await submission(identity.admin, body.submissionId);
    if (!current) return reply(origin, 404, { code: "submission_not_found" });

    if (action === "verify") {
      stage = "verify";
      if (current.status !== "pending") return reply(origin, 409, { code: "submission_already_reviewed" });
      const result = await identity.admin.from("creator_submissions").update({ ownership_verified_at: new Date().toISOString() }).eq("id", body.submissionId).eq("status", "pending").is("ownership_verified_at", null);
      if (result.error) throw result.error;
      return reply(origin, 200, { ok: true });
    }

    if (action === "approve") {
      stage = "approve";
      if (current.status !== "pending") return reply(origin, 409, { code: "submission_already_reviewed" });
      const { data, error } = await identity.admin.rpc("approve_creator_submission", { submission_uuid: body.submissionId });
      if (error) throw error;
      return reply(origin, 200, { ok: true, creatorId: data });
    }

    if (action === "reject") {
      stage = "reject";
      const note = body.reviewNote?.trim() ?? "";
      if (!note || note.length > MAX_REVIEW_NOTE_LENGTH) return reply(origin, 400, { code: "review_note_required" });
      if (current.status !== "pending") return reply(origin, 409, { code: "submission_already_reviewed" });
      const result = await identity.admin.from("creator_submissions").update({ status: "rejected", reviewed_at: new Date().toISOString(), review_note: note }).eq("id", body.submissionId).eq("status", "pending");
      if (result.error) throw result.error;
      const cleanup = current.reference_photo_path ? await identity.admin.storage.from(PHOTO_BUCKET).remove([current.reference_photo_path]) : { error: null };
      return reply(origin, 200, { ok: true, photoCleanup: cleanup.error ? "failed" : "complete" });
    }

    if (action === "cleanup") {
      stage = "cleanup";
      if (current.status !== "rejected") return reply(origin, 409, { code: "submission_not_rejected" });
      const cleanup = current.reference_photo_path ? await identity.admin.storage.from(PHOTO_BUCKET).remove([current.reference_photo_path]) : { error: null };
      if (cleanup.error) throw cleanup.error;
      return reply(origin, 200, { ok: true, photoCleanup: "complete" });
    }

    return reply(origin, 400, { code: "unsupported_action" });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : undefined;
    console.error("admin-review request failed", { stage, code });
    return reply(origin, 500, { code: "unexpected_error" });
  }
});
