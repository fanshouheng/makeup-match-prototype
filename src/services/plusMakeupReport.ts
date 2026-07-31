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
}

export type PlusMakeupJobStatus = "processing" | "succeeded" | "failed";

export interface PlusMakeupJob {
  id: string;
  status: PlusMakeupJobStatus;
  createdAt: string;
  expiresAt: string;
  scenes: PlusMakeupScene[];
  customScene: string;
  direction: PlusMakeupDirection;
  report?: PlusMakeupReport;
  errorCode?: string;
}

export interface PlusMakeupJobResponse {
  job: PlusMakeupJob | null;
  remainingCredits: number;
}

function disclosedFeatures(features: FaceFeatureVector): FaceFeatureVector {
  return Object.fromEntries(
    Object.entries(features).map(([key, value]) => [key, Number(value.toFixed(6))]),
  ) as FaceFeatureVector;
}

export function buildPlusMakeupReportRequest(input: PlusMakeupReportInput) {
  const customScene = input.customScene.trim();
  if (!input.consent) throw new Error("请先同意发送本次生成所需的数据。");
  if (input.scenes.length + (customScene ? 1 : 0) === 0) {
    throw new Error("请至少选择或填写一个场景。");
  }
  return {
    action: "start",
    consentVersion: PLUS_MAKEUP_REPORT_CONSENT_VERSION,
    customScene,
    direction: input.direction,
    features: disclosedFeatures(input.features),
    scenes: input.scenes,
  };
}

function parseJob(value: unknown): PlusMakeupJob | null {
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("报告任务状态无法识别。");
  }
  const job = value as Record<string, unknown>;
  if (
    typeof job.id !== "string" ||
    !["processing", "succeeded", "failed"].includes(String(job.status)) ||
    typeof job.createdAt !== "string" ||
    typeof job.expiresAt !== "string" ||
    !Array.isArray(job.scenes) ||
    typeof job.customScene !== "string" ||
    typeof job.direction !== "string"
  ) {
    throw new Error("报告任务状态无法识别。");
  }
  const status = job.status as PlusMakeupJobStatus;
  return {
    id: job.id,
    status,
    createdAt: job.createdAt,
    expiresAt: job.expiresAt,
    scenes: job.scenes as PlusMakeupScene[],
    customScene: job.customScene,
    direction: job.direction as PlusMakeupDirection,
    report: status === "succeeded" ? parsePlusMakeupReport(job.report) : undefined,
    errorCode: status === "failed" && typeof job.errorCode === "string"
      ? job.errorCode
      : undefined,
  };
}

async function invokeReport(body: Record<string, unknown>): Promise<PlusMakeupJobResponse> {
  const { data, error } = await plusClient.functions.invoke("plus-makeup-report", { body });
  if (!error) {
    const value = data as { job?: unknown; remainingCredits?: unknown };
    if (!Number.isInteger(value.remainingCredits) || Number(value.remainingCredits) < 0) {
      throw new Error("报告返回了无法识别的额度状态。");
    }
    return {
      job: parseJob(value.job ?? null),
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
  if (code === "auth_required") throw new Error("登录状态已失效，请重新登录。");
  if (code === "membership_inactive") throw new Error("Plus 权益当前不可用，请联系运营者。");
  if (code === "no_credits") throw new Error("体验额度已经用完，请联系运营者。");
  if (code === "service_not_configured") throw new Error("报告功能尚未完成服务配置。");
  if (code === "invalid_request") throw new Error("本次配置无法生成报告，请检查后重试。");
  throw new Error("报告任务暂时不可用，请稍后重试。");
}

export function plusMakeupJobFailureMessage(code?: string): string {
  if (code === "web_search_not_configured") return "博主查找尚未完成配置，额度已退回。";
  if (code === "invalid_provider_response") return "返回内容不完整，额度已退回，请重新生成。";
  if (code === "timeout") return "生成超时，额度已退回，请重新生成。";
  if (code === "service_not_configured") return "报告服务尚未完成配置，额度已退回。";
  return "报告生成失败，额度已退回，请重新生成。";
}

export async function startPlusMakeupReport(
  input: PlusMakeupReportInput,
): Promise<PlusMakeupJobResponse> {
  return invokeReport(buildPlusMakeupReportRequest(input));
}

export async function getPlusMakeupReportJob(): Promise<PlusMakeupJobResponse> {
  return invokeReport({ action: "status" });
}

export async function acknowledgePlusMakeupReportJob(jobId: string): Promise<void> {
  const { error } = await plusClient.functions.invoke("plus-makeup-report", {
    body: { action: "ack", jobId },
  });
  if (error) throw new Error("本机已保存报告，但临时服务端副本删除失败，请稍后刷新重试。");
}

export type {
  PlusMakeupDirection,
  PlusMakeupReport,
  PlusMakeupScene,
};
