import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.110.7";
import {
  isCreatorPlatform,
  isCreatorPlatformUrl,
} from "../_shared/creatorPlatform.ts";
import {
  isIsoDate,
  resolveAdminMetricsRange,
  type AdminMetricsRange,
} from "./adminMetricsRange.ts";
import { summarizeMatchNegativeFeedback } from "../_shared/matchNegativeFeedback.ts";
import { isAuthorizedAdmin } from "../_shared/adminAuthorization.ts";
import { isValidFaceFeatureVector } from "../_shared/faceFeatureVector.ts";

const PHOTO_BUCKET = "creator-photos";
const SIGNED_URL_TTL_SECONDS = 300;
const MAX_REVIEW_NOTE_LENGTH = 500;
const MAX_OUTREACH_NAME_LENGTH = 60;
const MAX_OUTREACH_REASON_LENGTH = 200;
const MAX_OUTREACH_NOTES_LENGTH = 1000;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const CONSENT_VERSION = "2026-07-21";
const AI_DISCOVERY_LOG_LIMIT = 50;
const AI_LOCALES = ["zh-CN", "en-US", "en-GB", "ja-JP", "ko-KR"] as const;
const AI_COUNTRIES = ["global", "CN", "JP", "KR", "US", "GB"] as const;
const AI_PLATFORMS = ["all", "youtube", "instagram", "tiktok", "xiaohongshu", "douyin"] as const;
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
  "plus_page_viewed",
  "plus_checkout_started",
  "points_page_viewed",
  "points_checkout_started",
  "membership_page_viewed",
  "membership_checkout_started",
  "membership_cycle_granted",
  "membership_payment_failed",
  "plus_invite_redeemed",
  "plus_job_created",
  "plus_job_succeeded",
  "plus_job_failed",
  "plus_credit_refunded",
  "plus_report_saved_local",
  "plus_usage_feedback",
  "ai_discovery_viewed",
  "ai_discovery_consent",
  "ai_discovery_requested",
  "ai_discovery_succeeded",
  "ai_discovery_failed",
  "ai_creator_name_clicked",
  "ai_discovery_feedback",
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
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_REFERENCE_AUDIENCES = new Set(["women", "men"]);
const ALLOWED_CONTENT_TYPES = new Set(["appearance", "hair", "makeup"]);
const OUTREACH_STATUSES = new Set([
  "contacted", "replied", "interested", "submitted",
  "approved", "active", "declined", "no_reply",
]);
const TERMINAL_OUTREACH_STATUSES = new Set(["declined", "no_reply"]);
type Action = "list" | "create" | "verify" | "approve" | "reject" | "cleanup" | "set_active" | "delete_creator" | "save_outreach" | "delete_outreach" | "get_membership_catalog" | "lookup_membership" | "grant_membership_month" | "cancel_membership" | "update_membership_plan";
interface RequestBody {
  action?: Action;
  metricsStartDate?: string;
  metricsEndDate?: string;
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
  email?: string;
  idempotencyKey?: string;
  planName?: string;
  monthlyPoints?: number;
  zpayAmountMinor?: number;
  stripeAmountMinor?: number;
  planActive?: boolean;
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

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isDate(value: string): boolean {
  return isIsoDate(value);
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
  if (error || !data.user) return reply(origin, 401, { code: "auth_required" });
  if (!isAuthorizedAdmin(data.user, Deno.env.get("ADMIN_USER_IDS"))) {
    return reply(origin, 403, { code: "not_admin" });
  }

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

async function productMetrics(
  admin: SupabaseClient,
  range: AdminMetricsRange,
): Promise<Record<string, unknown>> {
  const [counts, failuresResult, plusResult, negativeFeedbackResult] = await Promise.all([
    Promise.all(PRODUCT_EVENT_NAMES.map(async (eventName) => {
      const result = await admin.from("product_events")
        .select("session_id", { count: "exact", head: true })
        .eq("event_name", eventName)
        .gte("created_at", range.startAt)
        .lt("created_at", range.endBefore);
      if (result.error) throw result.error;
      return [eventName, result.count ?? 0] as const;
    })),
    admin.from("product_events")
      .select("failure_reason")
      .eq("event_name", "analysis_failed")
      .gte("created_at", range.startAt)
      .lt("created_at", range.endBefore),
    admin.from("product_events")
      .select("event_name,experiment_variant")
      .in("event_name", [...PLUS_EVENT_NAMES])
      .gte("created_at", range.startAt)
      .lt("created_at", range.endBefore),
    admin.from("match_negative_feedback")
      .select("reason_codes")
      .gte("created_at", range.startAt)
      .lt("created_at", range.endBefore),
  ]);
  if (failuresResult.error) throw failuresResult.error;
  if (plusResult.error) throw plusResult.error;
  if (negativeFeedbackResult.error) throw negativeFeedbackResult.error;

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
    period_start: range.startAt,
    ...Object.fromEntries(counts),
    analysis_failures: failureCounts,
    negative_feedback: summarizeMatchNegativeFeedback(negativeFeedbackResult.data ?? []),
    plus_by_variant: plusByVariant,
  };
}

async function aiDiscoveryData(
  admin: SupabaseClient,
  range: AdminMetricsRange,
): Promise<Record<string, unknown>> {
  const periodStart = range.startAt;
  const periodEnd = range.endBefore;
  const baseCount = () => admin.from("ai_creator_discovery_logs")
    .select("id", { count: "exact", head: true })
    .gte("created_at", periodStart)
    .lt("created_at", periodEnd);
  const [totalResult, succeededResult, failedResult, recentResult, dimensionsResult] = await Promise.all([
    baseCount(),
    baseCount().eq("status", "succeeded"),
    baseCount().eq("status", "failed"),
    admin.from("ai_creator_discovery_logs")
      .select("id,status,error_code,duration_ms,provider_status,reference_audience,content_filter,locale,country_code,platform,created_at")
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd)
      .order("created_at", { ascending: false })
      .limit(AI_DISCOVERY_LOG_LIMIT),
    admin.from("ai_creator_discovery_logs")
      .select("locale,country_code,platform")
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd),
  ]);
  if (totalResult.error) throw totalResult.error;
  if (succeededResult.error) throw succeededResult.error;
  if (failedResult.error) throw failedResult.error;
  let recentRows: Array<Record<string, unknown>> | null = recentResult.data;
  if (recentResult.error && ["PGRST204", "PGRST205", "42703"].includes(recentResult.error.code)) {
    const fallback = await admin.from("ai_creator_discovery_logs")
      .select("id,status,error_code,duration_ms,provider_status,reference_audience,content_filter,created_at")
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd)
      .order("created_at", { ascending: false })
      .limit(AI_DISCOVERY_LOG_LIMIT);
    if (fallback.error) throw fallback.error;
    recentRows = fallback.data;
  } else if (recentResult.error) {
    throw recentResult.error;
  }
  const dimensionsAvailable = !dimensionsResult.error;
  if (dimensionsResult.error && !["PGRST204", "PGRST205", "42703"].includes(dimensionsResult.error.code)) {
    throw dimensionsResult.error;
  }
  const dimensionCounts = {
    locale: Object.fromEntries(AI_LOCALES.map((key) => [key, 0])),
    country_code: Object.fromEntries(AI_COUNTRIES.map((key) => [key, 0])),
    platform: Object.fromEntries(AI_PLATFORMS.map((key) => [key, 0])),
  } as Record<string, Record<string, number>>;
  for (const row of dimensionsResult.data ?? []) {
    if (typeof row.locale === "string" && AI_LOCALES.includes(row.locale as typeof AI_LOCALES[number])) {
      dimensionCounts.locale[row.locale] += 1;
    }
    const country = typeof row.country_code === "string" ? row.country_code : "global";
    if (AI_COUNTRIES.includes(country as typeof AI_COUNTRIES[number])) dimensionCounts.country_code[country] += 1;
    if (typeof row.platform === "string" && AI_PLATFORMS.includes(row.platform as typeof AI_PLATFORMS[number])) {
      dimensionCounts.platform[row.platform] += 1;
    }
  }
  return {
    period_start: periodStart,
    total: totalResult.count ?? 0,
    succeeded: succeededResult.count ?? 0,
    failed: failedResult.count ?? 0,
    dimensions_available: dimensionsAvailable,
    dimensions: dimensionCounts,
    recent: recentRows ?? [],
  };
}

async function paymentSummary(
  admin: SupabaseClient,
  range: AdminMetricsRange,
): Promise<Record<string, unknown>> {
  const [result, pointResult, subscriptionResult, cycleResult] = await Promise.all([
    admin.from("payment_orders")
      .select("provider,product_code,package_code,points_granted,status,amount_minor,currency")
      .gte("created_at", range.startAt)
      .lt("created_at", range.endBefore),
    admin.from("point_reservations")
      .select("purpose,status,points")
      .gte("created_at", range.startAt)
      .lt("created_at", range.endBefore),
    admin.from("subscriptions")
      .select("provider,plan_code,status")
      .gte("created_at", range.startAt)
      .lt("created_at", range.endBefore),
    admin.from("subscription_cycles")
      .select("points_granted,status")
      .gte("created_at", range.startAt)
      .lt("created_at", range.endBefore),
  ]);
  if (result.error) {
    if (result.error.code === "42P01" || result.error.code === "PGRST205") return { available: false };
    throw result.error;
  }
  if (pointResult.error && pointResult.error.code !== "42P01" && pointResult.error.code !== "PGRST205") {
    throw pointResult.error;
  }
  const subscriptionsAvailable = !subscriptionResult.error;
  if (subscriptionResult.error && !["42P01", "PGRST205"].includes(subscriptionResult.error.code)) throw subscriptionResult.error;
  const cyclesAvailable = !cycleResult.error;
  if (cycleResult.error && !["42P01", "PGRST205"].includes(cycleResult.error.code)) throw cycleResult.error;
  const byStatus: Record<string, number> = {};
  const byProvider: Record<string, number> = {};
  const byProduct: Record<string, number> = {};
  const byPackage: Record<string, number> = {};
  const subscriptionsByStatus: Record<string, number> = {};
  const subscriptionsByPlan: Record<string, number> = {};
  const paidAmounts: Record<string, number> = {};
  let paidPoints = 0;
  let subscriptionCyclesGranted = 0;
  let subscriptionPointsGranted = 0;
  for (const row of result.data ?? []) {
    if (typeof row.status === "string") byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    if (typeof row.provider === "string") byProvider[row.provider] = (byProvider[row.provider] ?? 0) + 1;
    if (typeof row.product_code === "string") byProduct[row.product_code] = (byProduct[row.product_code] ?? 0) + 1;
    if (typeof row.package_code === "string") byPackage[row.package_code] = (byPackage[row.package_code] ?? 0) + 1;
    if (row.status === "paid" && typeof row.currency === "string" && typeof row.amount_minor === "number") {
      paidAmounts[row.currency] = (paidAmounts[row.currency] ?? 0) + row.amount_minor;
      if (typeof row.points_granted === "number") paidPoints += row.points_granted;
    }
  }
  for (const row of subscriptionResult.data ?? []) {
    if (typeof row.status === "string") subscriptionsByStatus[row.status] = (subscriptionsByStatus[row.status] ?? 0) + 1;
    if (typeof row.plan_code === "string") subscriptionsByPlan[row.plan_code] = (subscriptionsByPlan[row.plan_code] ?? 0) + 1;
  }
  for (const row of cycleResult.data ?? []) {
    if (row.status === "granted") {
      subscriptionCyclesGranted += 1;
      if (typeof row.points_granted === "number") subscriptionPointsGranted += row.points_granted;
    }
  }
  const pointActivity = {
    available: !pointResult.error,
    consumed_points: 0,
    refunded_points: 0,
    by_purpose: {
      ai_discovery: { reserved: 0, consumed: 0, refunded: 0 },
      makeup_report: { reserved: 0, consumed: 0, refunded: 0 },
    },
  };
  for (const row of pointResult.data ?? []) {
    if (row.purpose !== "ai_discovery" && row.purpose !== "makeup_report") continue;
    if (row.status !== "reserved" && row.status !== "consumed" && row.status !== "refunded") continue;
    pointActivity.by_purpose[row.purpose][row.status] += 1;
    if (row.status === "consumed") pointActivity.consumed_points += row.points;
    if (row.status === "refunded") pointActivity.refunded_points += row.points;
  }
  return {
    available: true,
    period_start: range.startAt,
    order_count: result.data?.length ?? 0,
    by_status: byStatus,
    by_provider: byProvider,
    by_product: byProduct,
    by_package: byPackage,
    paid_amounts_minor: paidAmounts,
    paid_points: paidPoints,
    point_activity: pointActivity,
    subscription_count: subscriptionsAvailable ? (subscriptionResult.data?.length ?? 0) : undefined,
    subscriptions_by_status: subscriptionsAvailable ? subscriptionsByStatus : undefined,
    subscriptions_by_plan: subscriptionsAvailable ? subscriptionsByPlan : undefined,
    subscription_cycles_granted: cyclesAvailable ? subscriptionCyclesGranted : undefined,
    subscription_points_granted: cyclesAvailable ? subscriptionPointsGranted : undefined,
  };
}

async function listData(
  admin: SupabaseClient,
  metricsRange: AdminMetricsRange,
): Promise<Record<string, unknown>> {
  const [submissionsResult, creatorsResult, outreachResult, metrics, aiDiscovery, payments, commerceResult] = await Promise.all([
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
    productMetrics(admin, metricsRange),
    aiDiscoveryData(admin, metricsRange),
    paymentSummary(admin, metricsRange),
    admin.rpc("admin_commerce_overview"),
  ]);
  if (submissionsResult.error) throw submissionsResult.error;
  if (creatorsResult.error) throw creatorsResult.error;
  if (outreachResult.error) throw outreachResult.error;
  const commerceUnavailable = ["42883", "PGRST202"].includes(commerceResult.error?.code ?? "");
  if (commerceResult.error && !commerceUnavailable) throw commerceResult.error;
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
    payment_summary: payments,
    commerce_overview: commerceUnavailable
      ? { available: false }
      : { available: true, ...(commerceResult.data as Record<string, unknown>) },
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
    !ALLOWED_MIME_TYPES.has(referencePhoto.type) || !isValidFaceFeatureVector(featureVector) ||
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
      const metricsRange = resolveAdminMetricsRange(body.metricsStartDate, body.metricsEndDate);
      if (!metricsRange) return reply(origin, 400, { code: "invalid_metrics_range" });
      return new Response(JSON.stringify(await listData(identity.admin, metricsRange)), { status: 200, headers: headers(origin) });
    }

    if (action === "get_membership_catalog") {
      stage = "get_membership_catalog";
      const result = await identity.admin.from("membership_plans")
        .select("code,provider,name,monthly_amount_minor,currency,monthly_points,stripe_price_id,is_active")
        .eq("code", "pro_monthly")
        .order("provider");
      if (result.error) throw result.error;
      return reply(origin, 200, {
        plans: (result.data ?? []).map((plan) => ({
          code: plan.code,
          provider: plan.provider,
          name: plan.name,
          monthlyAmountMinor: plan.monthly_amount_minor,
          currency: plan.currency,
          monthlyPoints: plan.monthly_points,
          stripePriceIdConfigured: Boolean(plan.stripe_price_id),
          isActive: plan.is_active,
        })),
      });
    }

    if (action === "lookup_membership") {
      stage = "lookup_membership";
      if (typeof body.email !== "string" || !body.email.trim()) {
        return reply(origin, 400, { code: "invalid_email" });
      }
      const result = await identity.admin.rpc("admin_membership_status_by_email", {
        p_email: body.email.trim().toLowerCase(),
      });
      if (result.error) throw result.error;
      return reply(origin, 200, { membership: result.data });
    }

    if (action === "grant_membership_month" || action === "cancel_membership") {
      stage = action;
      if (typeof body.email !== "string" || !body.email.trim() ||
        typeof body.idempotencyKey !== "string" || !isUuid(body.idempotencyKey)) {
        return reply(origin, 400, { code: "invalid_membership_action" });
      }
      const rpcName = action === "grant_membership_month"
        ? "admin_grant_membership_month"
        : "admin_cancel_membership";
      const result = await identity.admin.rpc(rpcName, {
        p_email: body.email.trim().toLowerCase(),
        p_admin_id: identity.user.id,
        p_idempotency_key: body.idempotencyKey,
      });
      if (result.error) throw result.error;
      return reply(origin, 200, { membership: result.data });
    }

    if (action === "update_membership_plan") {
      stage = "update_membership_plan";
      if (typeof body.idempotencyKey !== "string" || !isUuid(body.idempotencyKey) ||
        typeof body.planName !== "string" || typeof body.monthlyPoints !== "number" ||
        typeof body.zpayAmountMinor !== "number" || typeof body.stripeAmountMinor !== "number" ||
        typeof body.planActive !== "boolean") {
        return reply(origin, 400, { code: "invalid_membership_plan" });
      }
      const result = await identity.admin.rpc("admin_update_membership_plan", {
        p_admin_id: identity.user.id,
        p_idempotency_key: body.idempotencyKey,
        p_name: body.planName.trim(),
        p_monthly_points: body.monthlyPoints,
        p_zpay_amount_minor: body.zpayAmountMinor,
        p_stripe_amount_minor: body.stripeAmountMinor,
        p_is_active: body.planActive,
      });
      if (result.error) throw result.error;
      return reply(origin, 200, { plans: result.data });
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
      const result = await identity.admin.from("creator_submissions")
        .update({ status: "rejected", reviewed_at: new Date().toISOString(), review_note: note })
        .eq("id", body.submissionId)
        .eq("status", "pending")
        .select("id,reference_photo_path")
        .maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return reply(origin, 409, { code: "submission_already_reviewed" });
      const cleanup = result.data.reference_photo_path
        ? await identity.admin.storage.from(PHOTO_BUCKET).remove([result.data.reference_photo_path])
        : { error: null };
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
    const message = typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : error instanceof Error ? error.message : "";
    const membershipCode = [
      "account_not_found",
      "email_not_confirmed",
      "membership_not_found",
      "membership_plan_not_found",
      "external_subscription_requires_provider",
      "invalid_membership_action",
      "invalid_membership_plan",
      "idempotency_key_reused",
    ].find((value) => message.includes(value));
    if (membershipCode) {
      const status = membershipCode === "account_not_found" || membershipCode === "membership_not_found" ? 404 : 400;
      return reply(origin, status, { code: membershipCode });
    }
    if (["42P01", "PGRST205", "42883"].includes(code ?? "")) {
      return reply(origin, 503, { code: "membership_not_ready" });
    }
    return reply(origin, 500, { code: "unexpected_error" });
  }
});
