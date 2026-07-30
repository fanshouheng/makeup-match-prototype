import type { FaceFeatureVector } from "../domain/faceFeatures";
import {
  parsePlusMakeupReport,
  PLUS_MAKEUP_REPORT_CONSENT_VERSION,
  type PlusMakeupDirection,
  type PlusMakeupReport,
  type PlusMakeupScene,
} from "../../supabase/functions/_shared/plusMakeupReport";
import { plusClient } from "../plus/plusClient";

interface PlusMakeupReportInput {
  consent: boolean;
  customScene: string;
  direction: PlusMakeupDirection;
  features: FaceFeatureVector;
  scenes: PlusMakeupScene[];
  turnstileToken: string;
}

export interface PlusMakeupReportResponse {
  report: PlusMakeupReport;
  remainingCredits: number;
}

function disclosedFeatures(features: FaceFeatureVector): FaceFeatureVector {
  return Object.fromEntries(
    Object.entries(features).map(([key, value]) => [key, Number(value.toFixed(6))]),
  ) as FaceFeatureVector;
}

export function buildPlusMakeupReportRequest(input: PlusMakeupReportInput) {
  const customScene = input.customScene.trim();
  if (!input.consent) throw new Error("请先同意发送本次生成所需的数据。" );
  if (!input.turnstileToken) throw new Error("请先完成安全验证。" );
  if (input.scenes.length + (customScene ? 1 : 0) === 0) {
    throw new Error("请至少选择或填写一个场景。" );
  }
  return {
    consentVersion: PLUS_MAKEUP_REPORT_CONSENT_VERSION,
    customScene,
    direction: input.direction,
    features: disclosedFeatures(input.features),
    scenes: input.scenes,
    turnstileToken: input.turnstileToken,
  };
}

export async function generatePlusMakeupReport(
  input: PlusMakeupReportInput,
): Promise<PlusMakeupReportResponse> {
  const body = buildPlusMakeupReportRequest(input);
  const { data, error } = await plusClient.functions.invoke("plus-makeup-report", { body });
  if (!error) {
    const value = data as { report?: unknown; remainingCredits?: unknown };
    if (!Number.isInteger(value.remainingCredits) || Number(value.remainingCredits) < 0) {
      throw new Error("报告返回了无法识别的额度状态。" );
    }
    return {
      report: parsePlusMakeupReport(value.report),
      remainingCredits: Number(value.remainingCredits),
    };
  }

  let code: string | undefined;
  if ("context" in error && error.context instanceof Response) {
    const payload = await error.context.clone().json().catch(() => undefined) as
      | { code?: string }
      | undefined;
    code = payload?.code;
  }
  if (code === "auth_required") throw new Error("登录状态已失效，请重新登录。" );
  if (code === "membership_inactive") throw new Error("Plus 权益当前不可用，请联系运营者。" );
  if (code === "no_credits") throw new Error("体验额度已经用完，请联系运营者。" );
  if (code === "captcha_failed") throw new Error("安全验证已失效，请重新验证后重试。" );
  if (code === "web_search_not_configured") throw new Error("博主查找尚未完成配置。" );
  if (code === "service_not_configured") throw new Error("报告功能尚未完成服务配置。" );
  if (code === "invalid_request") throw new Error("本次配置无法生成报告，请检查后重试。" );
  if (code === "invalid_provider_response") throw new Error("返回内容不完整，请重新生成。" );
  if (code === "timeout") throw new Error("生成超时，本次不会扣减额度，请重试。" );
  throw new Error("报告暂时不可用，本次不会扣减额度。" );
}

export type {
  PlusMakeupDirection,
  PlusMakeupReport,
  PlusMakeupScene,
};
