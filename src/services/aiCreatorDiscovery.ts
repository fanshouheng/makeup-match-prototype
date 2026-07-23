import type {
  CreatorContentFilter,
  ReferenceAudience,
} from "../domain/creator";
import { getSupabaseClient } from "./supabaseClient";

const AI_DISCOVERY_CONSENT_VERSION = "2026-07-23";
const MAX_AI_PHOTO_BYTES = 1.5 * 1024 * 1024;
const MAX_AI_PHOTO_DIMENSION = 1024;

export interface AiCreatorDiscoveryResult {
  names: string[];
}

interface AiCreatorDiscoveryInput {
  contentFilter: CreatorContentFilter;
  image: HTMLImageElement;
  referenceAudience: ReferenceAudience;
  turnstileToken: string;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("照片压缩失败，请重试。")),
      "image/jpeg",
      quality,
    );
  });
}

export async function prepareAiPhoto(image: HTMLImageElement): Promise<Blob> {
  const scale = Math.min(
    1,
    MAX_AI_PHOTO_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法处理照片，请更换浏览器后重试。");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const photo = await canvasToJpeg(canvas, 0.82);
  if (photo.size <= MAX_AI_PHOTO_BYTES) return photo;

  const compactCanvas = document.createElement("canvas");
  const compactScale = Math.min(1, 768 / Math.max(canvas.width, canvas.height));
  compactCanvas.width = Math.max(1, Math.round(canvas.width * compactScale));
  compactCanvas.height = Math.max(1, Math.round(canvas.height * compactScale));
  const compactContext = compactCanvas.getContext("2d");
  if (!compactContext) throw new Error("当前浏览器无法处理照片，请更换浏览器后重试。");
  compactContext.fillStyle = "#ffffff";
  compactContext.fillRect(0, 0, compactCanvas.width, compactCanvas.height);
  compactContext.drawImage(canvas, 0, 0, compactCanvas.width, compactCanvas.height);

  const compactPhoto = await canvasToJpeg(compactCanvas, 0.74);
  if (compactPhoto.size > MAX_AI_PHOTO_BYTES) {
    throw new Error("照片压缩后仍然过大，请换一张照片后重试。");
  }
  return compactPhoto;
}

export function parseAiCreatorDiscoveryResult(
  value: unknown,
): AiCreatorDiscoveryResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("AI 推荐返回了无法识别的结果，请重试。");
  }

  const names = (value as Record<string, unknown>).names;
  if (
    !Array.isArray(names) ||
    names.length === 0 ||
    names.length > 5 ||
    names.some((name) => typeof name !== "string" || !name.trim() || name.length > 60)
  ) {
    throw new Error("AI 推荐返回了无法识别的结果，请重试。");
  }

  return { names: names.map((name) => name.trim()) };
}

export async function discoverCreatorsWithAi({
  contentFilter,
  image,
  referenceAudience,
  turnstileToken,
}: AiCreatorDiscoveryInput): Promise<AiCreatorDiscoveryResult> {
  const photo = await prepareAiPhoto(image);
  const body = new FormData();
  body.set("photo", photo, "ai-reference.jpg");
  body.set("referenceAudience", referenceAudience);
  body.set("contentFilter", contentFilter);
  body.set("turnstileToken", turnstileToken);
  body.set("consentVersion", AI_DISCOVERY_CONSENT_VERSION);

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("ai-creator-discovery", {
    body,
  });
  if (!error) return parseAiCreatorDiscoveryResult(data);

  let code: string | undefined;
  if ("context" in error && error.context instanceof Response) {
    const payload = await error.context
      .clone()
      .json()
      .catch(() => undefined) as { code?: string } | undefined;
    code = payload?.code;
  }

  if (code === "rate_limited") {
    throw new Error("AI 推荐次数较多，请一小时后再试。");
  }
  if (code === "captcha_failed") {
    throw new Error("安全验证已失效，请重新验证后重试。");
  }
  if (code === "service_not_configured") {
    throw new Error("AI 推荐尚未完成服务配置。");
  }
  if (code === "web_search_not_configured") {
    throw new Error("AI 联网搜索尚未完成配置。");
  }
  if (code === "invalid_request") {
    throw new Error("这张照片暂时无法用于 AI 推荐，请重新选择后再试。");
  }
  throw new Error("AI 推荐暂时不可用，请稍后重试。");
}
