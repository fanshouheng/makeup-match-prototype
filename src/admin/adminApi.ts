import type { Session } from "@supabase/supabase-js";
import type { FaceFeatureVector, PoseMetrics } from "../domain/faceFeatures";
import { adminClient } from "./adminClient";

const ADMIN_CONSENT_VERSION = "2026-07-21";

export interface AdminCreatorSubmissionInput {
  name: string;
  contactEmail: string;
  douyinUrl: string;
  tutorialUrl: string;
  referencePhoto: File;
  featureVector: FaceFeatureVector;
  qualityMetrics: {
    averageLuminance: number;
    pose: PoseMetrics;
  };
}

export interface AdminSubmission {
  id: string;
  name: string;
  contact_email: string;
  douyin_url: string;
  tutorial_url: string | null;
  quality_metrics: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  ownership_verified_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  reference_photo_url: string | null;
}

export interface AdminCreator {
  id: string;
  submission_id: string;
  name: string;
  douyin_url: string;
  tutorial_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  reference_photo_url: string | null;
}

export interface AdminListResponse {
  submissions: AdminSubmission[];
  creators: AdminCreator[];
}

interface AdminRequest {
  action: "list" | "verify" | "approve" | "reject" | "cleanup" | "set_active" | "delete_creator";
  submissionId?: string;
  creatorId?: string;
  isActive?: boolean;
  confirmName?: string;
  reviewNote?: string;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function invokeAdmin<T>(request: AdminRequest, retryList = true): Promise<T> {
  const { data, error } = await adminClient.functions.invoke("admin-review", {
    body: request,
  });

  if (!error) return data as T;

  let code: string | undefined;
  let status: number | undefined;
  if ("context" in error && error.context instanceof Response) {
    status = error.context.status;
    const payload = await error.context
      .clone()
      .json()
      .catch(() => undefined) as { code?: string } | undefined;
    code = payload?.code;
  }

  if (request.action === "list" && retryList && (status === 500 || code === "unexpected_error")) {
    await wait(600);
    return invokeAdmin<T>(request, false);
  }

  if (code === "not_admin") {
    throw new Error("这个账号没有管理台权限。");
  }
  if (code === "auth_required") {
    throw new Error("登录状态已失效，请重新登录。");
  }
  if (code === "service_not_configured") {
    throw new Error("管理台服务配置不完整，请联系维护者。");
  }
  throw new Error("管理台请求失败，请稍后重试。");
}

export async function createAdminSubmission(
  input: AdminCreatorSubmissionInput,
): Promise<void> {
  const body = new FormData();
  body.set("action", "create");
  body.set("name", input.name);
  body.set("contactEmail", input.contactEmail);
  body.set("douyinUrl", input.douyinUrl);
  body.set("tutorialUrl", input.tutorialUrl);
  body.set("referencePhoto", input.referencePhoto);
  body.set("featureVector", JSON.stringify(input.featureVector));
  body.set("qualityMetrics", JSON.stringify(input.qualityMetrics));
  body.set("consentVersion", ADMIN_CONSENT_VERSION);

  const { error } = await adminClient.functions.invoke("admin-review", { body });
  if (!error) return;

  let code: string | undefined;
  if ("context" in error && error.context instanceof Response) {
    const payload = await error.context
      .clone()
      .json()
      .catch(() => undefined) as { code?: string } | undefined;
    code = payload?.code;
  }
  if (code === "duplicate_submission") {
    throw new Error("这个主页或联系邮箱已有待审申请。");
  }
  if (code === "invalid_submission") {
    throw new Error("录入资料格式不完整，请检查后重试。");
  }
  throw new Error("创建待审申请失败，请稍后重试。");
}

export async function getAdminSession(): Promise<Session | null> {
  const { data, error } = await adminClient.auth.getSession();
  if (error) throw error;
  return data.session;
}
