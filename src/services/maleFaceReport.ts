import type { FaceFeatureVector } from "../domain/faceFeatures";
import type {
  MaleReportMode,
  MaleReportStyle,
} from "../domain/maleReportStyles";
import {
  parseMaleFaceReport,
  type MaleFaceReport,
} from "../../supabase/functions/_shared/maleFaceReport";
import { getSupabaseClient } from "./supabaseClient";

export const MALE_FACE_REPORT_CONSENT_VERSION = "2026-07-25";

interface MaleFaceReportInput {
  consent: boolean;
  features: FaceFeatureVector;
  mode: MaleReportMode;
  style: MaleReportStyle;
  turnstileToken: string;
}

export function disclosedMaleFaceFeatures(
  features: FaceFeatureVector,
): FaceFeatureVector {
  return Object.fromEntries(
    Object.entries(features).map(([key, value]) => [key, Number(value.toFixed(6))]),
  ) as FaceFeatureVector;
}

export function buildMaleFaceReportRequest({
  consent,
  features,
  mode,
  style,
  turnstileToken,
}: MaleFaceReportInput) {
  if (!consent) throw new Error("请先同意将本次面部比例发送给第三方 AI 服务。");
  if (!turnstileToken) throw new Error("请先完成安全验证。");
  return {
    consentVersion: MALE_FACE_REPORT_CONSENT_VERSION,
    features: disclosedMaleFaceFeatures(features),
    mode,
    style,
    turnstileToken,
  };
}

export async function generateMaleFaceReport(
  input: MaleFaceReportInput,
): Promise<MaleFaceReport> {
  const body = buildMaleFaceReportRequest(input);
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("male-face-report", {
    body,
  });
  if (!error) return parseMaleFaceReport(data);

  let code: string | undefined;
  if ("context" in error && error.context instanceof Response) {
    const payload = await error.context
      .clone()
      .json()
      .catch(() => undefined) as { code?: string } | undefined;
    code = payload?.code;
  }

  if (code === "rate_limited") {
    throw new Error("AI 报告次数较多，请一小时后再试。");
  }
  if (code === "captcha_failed") {
    throw new Error("安全验证已失效，请重新验证后重试。");
  }
  if (code === "service_not_configured") {
    throw new Error("AI 报告尚未完成服务配置。");
  }
  if (code === "invalid_request") {
    throw new Error("本次面部比例无法生成报告，请重新分析后再试。");
  }
  if (code === "invalid_provider_response") {
    throw new Error("AI 报告生成不完整，请重新生成。");
  }
  throw new Error("AI 报告暂时不可用，请稍后重试。");
}

export type { MaleFaceReport };
