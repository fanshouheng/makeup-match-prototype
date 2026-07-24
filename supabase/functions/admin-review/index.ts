import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.110.7";
import {
  isCreatorPlatform,
  isCreatorPlatformUrl,
} from "../_shared/creatorPlatform.ts";

const PHOTO_BUCKET = "creator-photos";
const SIGNED_URL_TTL_SECONDS = 300;
const MAX_REVIEW_NOTE_LENGTH = 500;
const MAX_OUTREACH_NAME_LENGTH = 60;
const MAX_OUTREACH_REASON_LENGTH = 200;
const MAX_OUTREACH_NOTES_LENGTH = 1000;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const CONSENT_VERSION = "2026-07-21";
const PRODUCT_METRICS_DAYS = 7;
const AI_DISCOVERY_LOG_LIMIT = 50;
const PRODUCT_EVENT_NAMES = [
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
] as const;
const PLUS_EVENT_NAMES = [
  "plus_offer_viewed",
  "plus_offer_opened",
  "plus_offer_configured",
  "plus_intent_yes",
  "plus_intent_price_high",
  "plus_intent_not_needed",
] as const;
const PLUS_VARIANTS = ["price_9_9", "price_19_9", "price_29_9"] as const;
type PlusEventName = typeof PLUS_EVENT_NAMES[number];
type PlusVariant = typeof PLUS_VARIANTS[number];
const PRODUCT_FAILURE_REASONS = [
  "no_face",
  "multiple_faces",
  "too_dark",
  "pose_issue",
  "component_error",
] as const;
type ProductFailureReason = typeof PRODUCT_FAILURE_REASONS[number];
const FEATURE_KEYS = [
  "faceAspectRatio", "jawToCheekRatio", "foreheadToCheekRatio",
  "lowerThirdRatio", "eyeSpacingRatio", "eyeAspectRatio",
  "noseWidthRatio", "lipWidthRatio", "lipAspectRatio",
] as const;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_REFERENCE_AUDIENCES = new Set(["women", "men"]);
const ALLOWED_CONTENT_TYPES = new Set(["appearance", "hair", "makeup"]);
const OUTREACH_STATUSES = new Set([
  "contacted", "replied", "interested", "submitted",
  "approved", "active", "declined", "no_reply",
]);
const TERMINAL_OUTREACH_STATUSES = new Set(["declined", "no_reply"]);
type Action = "list" | "create" | "verify" | "approve" | "reject" | "cleanup" | "set_active" | "delete_creator" | "save_outreach" | "delete_outreach";
interface RequestBody {
  action?: Action;
  submissionId?: string;
  creatorId?: string;
  isActive?: boolean;
  confirmName?: string;
  reviewNote?: string;
  outreachId?: string;
  displayName?: string;
  profileUrl?: string;
  firstContactedAt?: string;
  outreachStatus?: string;
  nextFollowUpAt?: string | null;
  lossReason?: string;
  notes?: string;
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

function parseStringArray(value: FormDataEntryValue | null): string[] | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      parsed.some((item) => typeof item !== "string")
    ) {
      return undefined;
    }
    const values = parsed as string[];
    return new Set(values).size === values.length ? values : undefined;
  } catch {
    return undefined;
  }
}

function isValidReferenceSelection(
  referenceAudience: string | undefined,
  contentTypes: string[] | undefined,
): boolean {
  return Boolean(
    referenceAudience &&
    ALLOWED_REFERENCE_AUDIENCES.has(referenceAudience) &&
    contentTypes &&
    contentTypes.every((type) => ALLOWED_CONTENT_TYPES.has(type)) &&
    (
      referenceAudience === "men" ||
      (contentTypes.length === 1 && contentTypes[0] === "makeup")
    ),
  );
}

function isFeatureVector(value: Record<string, unknown> | undefined): boolean {
  return Boolean(value && FEATURE_KEYS.every((key) => typeof value[key] === "number" && Number.isFinite(value[key])));
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
  return new Map((data ?? []).flatMap((item) =>
    item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : []
  ));
}

async function productMetrics(admin: SupabaseClient): Promise<Record<string, unknown>> {
  const periodStart = new Date(Date.now() - PRODUCT_METRICS_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const [counts, failuresResult, plusResult] = await Promise.all([
    Promise.all(PRODUCT_EVENT_NAMES.map(async (eventName) => {
      const result = await admin.from("product_events")
        .select("session_id", { count: "exact", head: true })
        .eq("event_name", eventName)
        .gte("created_at", periodStart);
      if (result.error) throw result.error;
      return [eventName, result.count ?? 0] as const;
    })),
    admin.from("product_events")
      .select("failure_reason")
      .eq("event_name", "analysis_failed")
      .gte("created_at", periodStart),
    admin.from("product_events")
      .select("event_name,experiment_variant")
      .in("event_name", [...PLUS_EVENT_NAMES])
      .gte("created_at", periodStart),
  ]);
  if (failuresResult.error) throw failuresResult.error;
  if (plusResult.error) throw plusResult.error;

  const failureCounts = Object.fromEntries(
    PRODUCT_FAILURE_REASONS.map((reason) => [reason, 0]),
  ) as Record<ProductFailureReason, number>;
  for (const row of failuresResult.data ?? []) {
    const reason = row.failure_reason;
    if (
      typeof reason === "string" &&
      PRODUCT_FAILURE_REASONS.includes(reason as ProductFailureReason)
    ) {
      failureCounts[reason as ProductFailureReason] += 1;
    }
  }

  const plusByVariant = Object.fromEntries(PLUS_VARIANTS.map((variant) => [
    variant,
    Object.fromEntries(PLUS_EVENT_NAMES.map((eventName) => [eventName, 0])),
  ])) as Record<PlusVariant, Record<PlusEventName, number>>;
  for (const row of plusResult.data ?? []) {
    const eventName = row.event_name;
    const variant = row.experiment_variant;
    if (
      typeof eventName === "string" &&
      PLUS_EVENT_NAMES.includes(eventName as PlusEventName) &&
      typeof variant === "string" &&
      PLUS_VARIANTS.includes(variant as PlusVariant)
    ) {
      plusByVariant[variant as PlusVariant][eventName as PlusEventName] += 1;
    }
  }

  return {
    period_start: periodStart,
    ...Object.fromEntries(counts),
    analysis_failures: failureCounts,
    plus_by_variant: plusByVariant,
  };
}

async function aiDiscoveryData(admin: SupabaseClient): Promise<Record<string, unknown>> {
  const periodStart = new Date(Date.now() - PRODUCT_METRICS_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const baseCount = () => admin.from("ai_creator_discovery_logs")
    .select("id", { count: "exact", head: true })
    .gte("created_at", periodStart);
  const [totalResult, succeededResult, failedResult, recentResult] = await Promise.all([
    baseCount(),
    baseCount().eq("status", "succeeded"),
    baseCount().eq("status", "failed"),
    admin.from("ai_creator_discovery_logs")
      .select("id,status,error_code,duration_ms,provider_status,reference_audience,content_filter,created_at")
      .gte("created_at", periodStart)
      .order("created_at", { ascending: false })
      .limit(AI_DISCOVERY_LOG_LIMIT),
  ]);
  if (totalResult.error) throw totalResult.error;
  if (succeededResult.error) throw succeededResult.error;
  if (failedResult.error) throw failedResult.error;
  if (recentResult.error) throw recentResult.error;
  return {
    period_start: periodStart,
    total: totalResult.count ?? 0,
    succeeded: succeededResult.count ?? 0,
    failed: failedResult.count ?? 0,
    recent: recentResult.data ?? [],
  };
}

async function listData(admin: SupabaseClient): Promise<Record<string, unknown>> {
  const [submissionsResult, creatorsResult, outreachResult, metrics, aiDiscovery] = await Promise.all([
    admin.from("creator_submissions")
      .select("id,name,contact_email,platform,profile_url,douyin_url,tutorial_url,reference_audience,content_types,reference_photo_path,quality_metrics,status,submitted_at,ownership_verified_at,reviewed_at,review_note")
      .eq("status", "pending")
      .order("submitted_at", { ascending: true }),
    admin.from("creators")
      .select("id,submission_id,name,platform,profile_url,douyin_url,tutorial_url,reference_audience,content_types,reference_photo_path,is_active,created_at,updated_at")
      .order("created_at", { ascending: false }),
    admin.from("creator_outreach")
      .select("id,candidate_no,display_name,profile_url,first_contacted_at,status,next_follow_up_at,loss_reason,notes,created_at,updated_at")
      .order("updated_at", { ascending: false }),
    productMetrics(admin),
    aiDiscoveryData(admin),
  ]);
  if (submissionsResult.error) throw submissionsResult.error;
  if (creatorsResult.error) throw creatorsResult.error;
  if (outreachResult.error) throw outreachResult.error;
  const submissions = submissionsResult.data ?? [];
  const creators = creatorsResult.data ?? [];
  const photos = await signedPhotoMap(admin, [...submissions, ...creators].map((row) => row.reference_photo_path));
  return {
    submissions: submissions.map(({ reference_photo_path, ...row }) => ({
      ...row,
      profile_url: row.profile_url ?? row.douyin_url,
      reference_photo_url: photos.get(reference_photo_path) ?? null,
    })),
    creators: creators.map(({ reference_photo_path, ...row }) => ({
      ...row,
      profile_url: row.profile_url ?? row.douyin_url,
      reference_photo_url: photos.get(reference_photo_path) ?? null,
    })),
    outreach: outreachResult.data ?? [],
    product_metrics: metrics,
    ai_discovery: aiDiscovery,
  };
}

async function createSubmission(admin: SupabaseClient, user: User, formData: FormData, origin: string): Promise<Response> {
  const name = requiredText(formData, "name", 60);
  const contactEmail = requiredText(formData, "contactEmail", 320);
  const legacyDouyinUrl = requiredText(formData, "douyinUrl", 2048);
  const platformValue = formData.get("platform");
  const profileUrlValue = formData.get("profileUrl");
  const isLegacyPlatformClient = platformValue === null && profileUrlValue === null;
  const platform = isLegacyPlatformClient
    ? "douyin"
    : requiredText(formData, "platform", 20);
  const profileUrl = isLegacyPlatformClient
    ? legacyDouyinUrl
    : requiredText(formData, "profileUrl", 2048);
  const tutorialValue = formData.get("tutorialUrl");
  const tutorialUrl = typeof tutorialValue === "string" ? tutorialValue.trim() : "";
  const referenceAudienceValue = formData.get("referenceAudience");
  const contentTypesValue = formData.get("contentTypes");
  const isLegacyReferenceClient = referenceAudienceValue === null && contentTypesValue === null;
  const referenceAudience = isLegacyReferenceClient
    ? "women"
    : requiredText(formData, "referenceAudience", 20);
  const contentTypes = isLegacyReferenceClient
    ? ["makeup"]
    : parseStringArray(contentTypesValue);
  const referencePhoto = formData.get("referencePhoto");
  const featureVector = parseObject(formData.get("featureVector"));
  const qualityMetrics = parseObject(formData.get("qualityMetrics"));
  const consentVersion = requiredText(formData, "consentVersion", 40);

  if (
    !name || !contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) ||
    !isCreatorPlatform(platform) || !profileUrl || !isCreatorPlatformUrl(platform, profileUrl) ||
    tutorialUrl.length > 2048 ||
    (tutorialUrl && !isCreatorPlatformUrl(platform, tutorialUrl)) ||
    !isValidReferenceSelection(referenceAudience, contentTypes) ||
    !(referencePhoto instanceof File) || referencePhoto.size > MAX_PHOTO_BYTES ||
    !ALLOWED_MIME_TYPES.has(referencePhoto.type) || !isFeatureVector(featureVector) ||
    !qualityMetrics || consentVersion !== CONSENT_VERSION
  ) {
    return reply(origin, 400, { code: "invalid_submission" });
  }

  const [emailMatch, profileMatch] = await Promise.all([
    admin.from("creator_submissions").select("id").eq("contact_email", contactEmail).in("status", ["pending", "approved"]).limit(1),
    admin.from("creator_submissions").select("id").eq("platform", platform).eq("profile_url", profileUrl).in("status", ["pending", "approved"]).limit(1),
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
    platform,
    profile_url: profileUrl,
    douyin_url: platform === "douyin" ? profileUrl : null,
    tutorial_url: tutorialUrl || null,
    reference_audience: referenceAudience,
    content_types: contentTypes,
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

    if (action === "save_outreach") {
      stage = "save_outreach";
      const outreachId = typeof body.outreachId === "string" ? body.outreachId.trim() : "";
      const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
      const profileUrl = typeof body.profileUrl === "string" ? body.profileUrl.trim() : "";
      const firstContactedAt = typeof body.firstContactedAt === "string" ? body.firstContactedAt.trim() : "";
      const outreachStatus = typeof body.outreachStatus === "string" ? body.outreachStatus.trim() : "";
      const nextFollowUpAt = typeof body.nextFollowUpAt === "string" ? body.nextFollowUpAt.trim() || null : null;
      const lossReason = typeof body.lossReason === "string" ? body.lossReason.trim() || null : null;
      const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;

      if (
        (body.outreachId !== undefined && !isUuid(outreachId)) ||
        !displayName || displayName.length > MAX_OUTREACH_NAME_LENGTH ||
        !profileUrl || profileUrl.length > 2048 || !isHttpsUrl(profileUrl) ||
        !isDate(firstContactedAt) || !OUTREACH_STATUSES.has(outreachStatus) ||
        (nextFollowUpAt !== null && (!isDate(nextFollowUpAt) || nextFollowUpAt < firstContactedAt)) ||
        (lossReason !== null && lossReason.length > MAX_OUTREACH_REASON_LENGTH) ||
        (notes !== null && notes.length > MAX_OUTREACH_NOTES_LENGTH) ||
        (TERMINAL_OUTREACH_STATUSES.has(outreachStatus) && !lossReason)
      ) {
        return reply(origin, 400, { code: "invalid_outreach" });
      }

      const values = {
        display_name: displayName,
        profile_url: profileUrl,
        first_contacted_at: firstContactedAt,
        status: outreachStatus,
        next_follow_up_at: nextFollowUpAt,
        loss_reason: lossReason,
        notes,
        updated_at: new Date().toISOString(),
      };
      const fields = "id,candidate_no,display_name,profile_url,first_contacted_at,status,next_follow_up_at,loss_reason,notes,created_at,updated_at";

      if (outreachId) {
        const result = await identity.admin.from("creator_outreach")
          .update(values)
          .eq("id", outreachId)
          .select(fields)
          .maybeSingle();
        if (result.error) throw result.error;
        if (!result.data) return reply(origin, 404, { code: "outreach_not_found" });
        return reply(origin, 200, { outreach: result.data });
      }

      const result = await identity.admin.from("creator_outreach")
        .insert(values)
        .select(fields)
        .single();
      if (result.error) throw result.error;
      return reply(origin, 201, { outreach: result.data });
    }

    if (action === "delete_outreach") {
      stage = "delete_outreach";
      if (typeof body.outreachId !== "string" || !isUuid(body.outreachId)) {
        return reply(origin, 400, { code: "invalid_outreach" });
      }
      const result = await identity.admin.from("creator_outreach")
        .delete()
        .eq("id", body.outreachId)
        .select("id")
        .maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return reply(origin, 404, { code: "outreach_not_found" });
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
    if (stage === "save_outreach" && code === "23505") {
      return reply(origin, 409, { code: "duplicate_outreach" });
    }
    if (stage === "save_outreach" && code === "23514") {
      return reply(origin, 400, { code: "invalid_outreach" });
    }
    return reply(origin, 500, { code: "unexpected_error" });
  }
});
