import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.110.7";
import { parseProviderCreatorNames } from "../_shared/aiCreatorDiscovery.ts";

const AI_DISCOVERY_CONSENT_VERSION = "2026-07-23";
const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024;
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const ARK_RESPONSES_URL = "https://ark.cn-beijing.volces.com/api/v3/responses";
const ALLOWED_REFERENCE_AUDIENCES = new Set(["women", "men"]);
const ALLOWED_CONTENT_FILTERS = new Set(["all", "hair", "makeup"]);

interface TurnstileOutcome {
  action?: string;
  hostname?: string;
  success: boolean;
}

type AiInvocationError =
  | "web_search_not_configured"
  | "provider_request_failed"
  | "invalid_provider_response"
  | "timeout"
  | "unexpected_error";

interface AiInvocationLog {
  contentFilter: string;
  durationMs: number;
  errorCode?: AiInvocationError;
  providerStatus?: number;
  referenceAudience: string;
  status: "succeeded" | "failed";
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

function resolveOrigin(request: Request): string | undefined {
  const origin = request.headers.get("origin") ?? "";
  try {
    const hostname = new URL(origin).hostname;
    if (
      Deno.env.get("ALLOW_LOCAL_ORIGINS") === "true" &&
      (hostname === "localhost" || hostname === "127.0.0.1")
    ) {
      return origin;
    }
  } catch {
    return undefined;
  }
  return configuredOrigins().includes(origin) ? origin : undefined;
}

function headers(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
  };
}

function reply(origin: string, status: number, code: string): Response {
  return new Response(JSON.stringify({ code }), {
    status,
    headers: headers(origin),
  });
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

function secretKey(): string | undefined {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    keyFromCollection("SUPABASE_SECRET_KEYS");
}

async function hashRateKey(value: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${value}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyTurnstile(
  token: string,
  secret: string,
  clientIp: string,
): Promise<boolean> {
  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  body.set("remoteip", clientIp);
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body },
  );
  const outcome = await response.json() as TurnstileOutcome;
  return Boolean(
    outcome.success &&
    outcome.action === "ai_creator_discovery" &&
    outcome.hostname &&
    allowedHostnames().includes(outcome.hostname),
  );
}

function isJpeg(photo: File, bytes: Uint8Array): boolean {
  return photo.type === "image/jpeg" &&
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function prompt(): string {
  return "根据这张照片的面部特点，联网搜索 3 到 5 位长相特征相近、适合参考妆容的美妆博主。只返回博主名字，不要解释。不要识别人物，也不要分析博主照片。";
}

async function recordAiInvocation(
  admin: SupabaseClient,
  input: AiInvocationLog,
): Promise<void> {
  try {
    const { error } = await admin.from("ai_creator_discovery_logs").insert({
      content_filter: input.contentFilter,
      duration_ms: input.durationMs,
      error_code: input.errorCode ?? null,
      provider_status: input.providerStatus ?? null,
      reference_audience: input.referenceAudience,
      status: input.status,
    });
    if (error) console.error("AI invocation log write failed", { code: error.code });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "unknown";
    console.error("AI invocation log write failed", { code });
  }
}

function invocationErrorCode(error: unknown): "timeout" | "unexpected_error" {
  if (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return "timeout";
  }
  return "unexpected_error";
}

Deno.serve(async (request) => {
  const origin = resolveOrigin(request);
  if (!origin) return reply("null", 403, "origin_not_allowed");
  if (request.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  if (request.method !== "POST") return reply(origin, 405, "method_not_allowed");

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) return reply(origin, 413, "request_too_large");

  const arkApiKey = Deno.env.get("ARK_API_KEY");
  const arkModel = Deno.env.get("ARK_MODEL");
  const turnstileSecret = Deno.env.get("CLOUDFLARE_SECRET_KEY");
  const rateLimitSalt = Deno.env.get("RATE_LIMIT_SALT");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const adminKey = secretKey();
  if (
    !arkApiKey ||
    !arkModel ||
    !turnstileSecret ||
    !rateLimitSalt ||
    !supabaseUrl ||
    !adminKey
  ) {
    return reply(origin, 503, "service_not_configured");
  }

  try {
    const formData = await request.formData();
    const photo = formData.get("photo");
    const referenceAudience = requiredText(formData, "referenceAudience", 20);
    const contentFilter = requiredText(formData, "contentFilter", 20);
    const turnstileToken = requiredText(formData, "turnstileToken", 4096);
    const consentVersion = requiredText(formData, "consentVersion", 40);
    if (
      !(photo instanceof File) ||
      photo.size === 0 ||
      photo.size > MAX_PHOTO_BYTES ||
      !referenceAudience ||
      !ALLOWED_REFERENCE_AUDIENCES.has(referenceAudience) ||
      !contentFilter ||
      !ALLOWED_CONTENT_FILTERS.has(contentFilter) ||
      (referenceAudience === "women" && contentFilter !== "all") ||
      !turnstileToken ||
      consentVersion !== AI_DISCOVERY_CONSENT_VERSION
    ) {
      return reply(origin, 400, "invalid_request");
    }

    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const clientIp = request.headers.get("cf-connecting-ip") ?? forwardedFor;
    if (!clientIp) return reply(origin, 400, "client_address_missing");
    if (!await verifyTurnstile(turnstileToken, turnstileSecret, clientIp)) {
      return reply(origin, 403, "captcha_failed");
    }

    const admin = createClient(supabaseUrl, adminKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const rateKey = await hashRateKey(`ip:${clientIp}`, rateLimitSalt);
    const { data: allowed, error: rateError } = await admin.rpc(
      "consume_ai_creator_discovery_rate_limit",
      { rate_key: rateKey },
    );
    if (rateError) return reply(origin, 500, "rate_limit_failed");
    if (!allowed) return reply(origin, 429, "rate_limited");

    const photoBytes = new Uint8Array(await photo.arrayBuffer());
    if (!isJpeg(photo, photoBytes)) return reply(origin, 400, "invalid_request");
    const imageUrl = `data:image/jpeg;base64,${toBase64(photoBytes)}`;
    const providerStartedAt = Date.now();
    let providerResponse: Response;
    try {
      providerResponse = await fetch(ARK_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${arkApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: arkModel,
          store: false,
          input: [{
            role: "user",
            content: [
              { type: "input_text", text: prompt() },
              { type: "input_image", detail: "high", image_url: imageUrl },
            ],
          }],
          tools: [{ type: "web_search", max_keyword: 2 }],
          thinking: { type: "disabled" },
          max_output_tokens: 300,
          text: {
            format: {
              type: "json_schema",
              name: "creator_names",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  names: {
                    type: "array",
                    minItems: 1,
                    maxItems: 5,
                    items: { type: "string", minLength: 1, maxLength: 60 },
                  },
                },
                required: ["names"],
              },
            },
          },
        }),
        signal: AbortSignal.timeout(70_000),
      });
    } catch (error) {
      const errorCode = invocationErrorCode(error);
      await recordAiInvocation(admin, {
        contentFilter,
        durationMs: Date.now() - providerStartedAt,
        errorCode,
        referenceAudience,
        status: "failed",
      });
      const code = error instanceof Error ? error.message : "unknown";
      console.error("AI creator discovery failed", { code });
      return reply(origin, 500, "unexpected_error");
    }

    if (!providerResponse.ok) {
      const providerError = await providerResponse
        .clone()
        .json()
        .catch(() => undefined) as { error?: { code?: unknown } } | undefined;
      const providerCode = typeof providerError?.error?.code === "string"
        ? providerError.error.code
        : undefined;
      const errorCode = providerCode === "ToolNotOpen"
        ? "web_search_not_configured"
        : "provider_request_failed";
      await recordAiInvocation(admin, {
        contentFilter,
        durationMs: Date.now() - providerStartedAt,
        errorCode,
        providerStatus: providerResponse.status,
        referenceAudience,
        status: "failed",
      });
      console.error("AI provider request failed", {
        code: providerCode,
        requestId: providerResponse.headers.get("x-request-id"),
        status: providerResponse.status,
      });
      return reply(
        origin,
        providerCode === "ToolNotOpen" ? 503 : 502,
        errorCode,
      );
    }

    try {
      const names = parseProviderCreatorNames(await providerResponse.json());
      await recordAiInvocation(admin, {
        contentFilter,
        durationMs: Date.now() - providerStartedAt,
        providerStatus: providerResponse.status,
        referenceAudience,
        status: "succeeded",
      });
      return new Response(JSON.stringify({ names }), {
        status: 200,
        headers: headers(origin),
      });
    } catch (error) {
      await recordAiInvocation(admin, {
        contentFilter,
        durationMs: Date.now() - providerStartedAt,
        errorCode: "invalid_provider_response",
        providerStatus: providerResponse.status,
        referenceAudience,
        status: "failed",
      });
      const code = error instanceof Error ? error.message : "unknown";
      console.error("AI creator discovery failed", { code });
      return reply(origin, 502, "unexpected_error");
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown";
    console.error("AI creator discovery failed", { code });
    return reply(origin, code === "invalid_provider_response" ? 502 : 500, "unexpected_error");
  }
});
