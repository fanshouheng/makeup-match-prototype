import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const PHOTO_BUCKET = "creator-photos";
const CONSENT_VERSION = "2026-07-21";
const LEGACY_CONSENT_VERSION = "2026-07-17";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const FEATURE_KEYS = [
  "faceAspectRatio",
  "jawToCheekRatio",
  "foreheadToCheekRatio",
  "lowerThirdRatio",
  "eyeSpacingRatio",
  "eyeAspectRatio",
  "noseWidthRatio",
  "lipWidthRatio",
  "lipAspectRatio",
] as const;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_REFERENCE_AUDIENCES = new Set(["women", "men"]);
const ALLOWED_CONTENT_TYPES = new Set(["appearance", "hair", "makeup"]);

interface TurnstileOutcome {
  success: boolean;
  action?: string;
  hostname?: string;
}

function configuredOrigins(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function allowedHostnames(): string[] {
  const hostnames = configuredOrigins().flatMap((origin) => {
    try {
      return [new URL(origin).hostname];
    } catch {
      return [];
    }
  });
  if (Deno.env.get("ALLOW_LOCAL_ORIGINS") === "true") {
    hostnames.push("localhost", "127.0.0.1");
  }
  return hostnames;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

function response(
  status: number,
  code: string,
  origin: string,
): Response {
  return new Response(JSON.stringify({ code }), {
    status,
    headers: corsHeaders(origin),
  });
}

function resolveOrigin(request: Request): string | undefined {
  const origin = request.headers.get("origin") ?? "";
  if (!origin) return "*";

  try {
    const url = new URL(origin);
    if (
      Deno.env.get("ALLOW_LOCAL_ORIGINS") === "true" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    ) {
      return origin;
    }
  } catch {
    return undefined;
  }

  return configuredOrigins().includes(origin) ? origin : undefined;
}

function requiredText(
  formData: FormData,
  key: string,
  maxLength: number,
): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : undefined;
}

function isDouyinUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "douyin.com" || url.hostname.endsWith(".douyin.com"))
    );
  } catch {
    return false;
  }
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
  return Boolean(
    value &&
      FEATURE_KEYS.every(
        (key) => typeof value[key] === "number" && Number.isFinite(value[key]),
      ),
  );
}

function extensionForMimeType(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

async function hashRateKey(value: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${value}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getSecretKey(): string | undefined {
  const modernKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modernKeys) {
    try {
      return JSON.parse(modernKeys).default as string | undefined;
    } catch {
      return undefined;
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? undefined;
}

Deno.serve(async (request) => {
  const origin = resolveOrigin(request);
  if (!origin) return response(403, "origin_not_allowed", "null");
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") return response(405, "method_not_allowed", origin);

  const turnstileSecret = Deno.env.get("CLOUDFLARE_SECRET_KEY");
  const rateLimitSalt = Deno.env.get("RATE_LIMIT_SALT");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = getSecretKey();
  if (!turnstileSecret || !rateLimitSalt || !supabaseUrl || !secretKey) {
    return response(503, "service_not_configured", origin);
  }

  try {
    const formData = await request.formData();
    const name = requiredText(formData, "name", 60);
    const contactEmail = requiredText(formData, "contactEmail", 320);
    const douyinUrl = requiredText(formData, "douyinUrl", 2048);
    const tutorialUrlValue = formData.get("tutorialUrl");
    const tutorialUrl = typeof tutorialUrlValue === "string"
      ? tutorialUrlValue.trim()
      : "";
    const referenceAudienceValue = formData.get("referenceAudience");
    const contentTypesValue = formData.get("contentTypes");
    const isLegacyClient = referenceAudienceValue === null && contentTypesValue === null;
    const referenceAudience = isLegacyClient
      ? "women"
      : requiredText(formData, "referenceAudience", 20);
    const contentTypes = isLegacyClient
      ? ["makeup"]
      : parseStringArray(contentTypesValue);
    const turnstileToken = requiredText(formData, "turnstileToken", 4096);
    const consentVersion = requiredText(formData, "consentVersion", 40);
    const referencePhoto = formData.get("referencePhoto");
    const featureVector = parseObject(formData.get("featureVector"));
    const qualityMetrics = parseObject(formData.get("qualityMetrics"));

    if (
      !name ||
      !contactEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) ||
      !douyinUrl ||
      !isDouyinUrl(douyinUrl) ||
      (tutorialUrl && !isDouyinUrl(tutorialUrl)) ||
      !isValidReferenceSelection(referenceAudience, contentTypes) ||
      !turnstileToken ||
      (
        consentVersion !== CONSENT_VERSION &&
        !(isLegacyClient && consentVersion === LEGACY_CONSENT_VERSION)
      ) ||
      !(referencePhoto instanceof File) ||
      referencePhoto.size > MAX_PHOTO_BYTES ||
      !ALLOWED_MIME_TYPES.has(referencePhoto.type) ||
      !isFeatureVector(featureVector) ||
      !qualityMetrics
    ) {
      return response(400, "invalid_submission", origin);
    }

    const forwardedFor = request.headers.get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim();
    const clientIp = request.headers.get("cf-connecting-ip") ?? forwardedFor;
    if (!clientIp) return response(400, "client_address_missing", origin);

    const captchaBody = new FormData();
    captchaBody.set("secret", turnstileSecret);
    captchaBody.set("response", turnstileToken);
    captchaBody.set("remoteip", clientIp);
    const captchaResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: captchaBody },
    );
    const captchaOutcome = await captchaResponse.json() as TurnstileOutcome;
    if (
      !captchaOutcome.success ||
      captchaOutcome.action !== "creator_submission" ||
      !captchaOutcome.hostname ||
      !allowedHostnames().includes(captchaOutcome.hostname)
    ) {
      return response(403, "captcha_failed", origin);
    }

    const admin = createClient(supabaseUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const [ipHash, emailHash] = await Promise.all([
      hashRateKey(`ip:${clientIp}`, rateLimitSalt),
      hashRateKey(`email:${contactEmail.toLowerCase()}`, rateLimitSalt),
    ]);
    for (const rateKey of [ipHash, emailHash]) {
      const { data: allowed, error: rateError } = await admin.rpc(
        "consume_creator_submission_rate_limit",
        { rate_key: rateKey },
      );
      if (rateError) return response(500, "rate_limit_failed", origin);
      if (!allowed) return response(429, "rate_limited", origin);
    }

    const submissionId = crypto.randomUUID();
    const extension = extensionForMimeType(referencePhoto.type);
    const photoPath = `submissions/${submissionId}/reference.${extension}`;
    const upload = await admin.storage
      .from(PHOTO_BUCKET)
      .upload(photoPath, referencePhoto, {
        cacheControl: "3600",
        contentType: referencePhoto.type,
        upsert: false,
      });
    if (upload.error) return response(500, "photo_upload_failed", origin);

    const inserted = await admin.from("creator_submissions").insert({
      id: submissionId,
      name,
      contact_email: contactEmail,
      douyin_url: douyinUrl,
      tutorial_url: tutorialUrl || null,
      reference_audience: referenceAudience,
      content_types: contentTypes,
      reference_photo_path: photoPath,
      feature_vector: featureVector,
      quality_metrics: qualityMetrics,
      consent_version: consentVersion,
    });
    if (inserted.error) {
      await admin.storage.from(PHOTO_BUCKET).remove([photoPath]);
      return response(500, "submission_write_failed", origin);
    }

    return new Response(JSON.stringify({ submissionId }), {
      status: 201,
      headers: corsHeaders(origin),
    });
  } catch {
    return response(500, "unexpected_error", origin);
  }
});
