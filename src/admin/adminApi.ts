import type { Session } from "@supabase/supabase-js";
import type {
  CreatorContentType,
  ReferenceAudience,
} from "../domain/creator";
import type { FaceFeatureVector, PoseMetrics } from "../domain/faceFeatures";
import { adminClient } from "./adminClient";

const ADMIN_CONSENT_VERSION = "2026-07-21";

export interface AdminCreatorSubmissionInput {
  name: string;
  contactEmail: string;
  douyinUrl: string;
  tutorialUrl: string;
  referenceAudience: ReferenceAudience;
  contentTypes: CreatorContentType[];
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
  reference_audience: ReferenceAudience;
  content_types: CreatorContentType[];
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
  reference_audience: ReferenceAudience;
  content_types: CreatorContentType[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  reference_photo_url: string | null;
}

export type AdminOutreachStatus =
  | "contacted"
  | "replied"
  | "interested"
  | "submitted"
  | "approved"
  | "active"
  | "declined"
  | "no_reply";

export interface AdminOutreach {
  id: string;
  candidate_no: number;
  display_name: string;
  profile_url: string;
  first_contacted_at: string;
  status: AdminOutreachStatus;
  next_follow_up_at: string | null;
  loss_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminOutreachInput {
  outreachId?: string;
  displayName: string;
  profileUrl: string;
  firstContactedAt: string;
  outreachStatus: AdminOutreachStatus;
  nextFollowUpAt: string | null;
  lossReason: string;
  notes: string;
}

export interface AdminProductMetrics {
  period_start: string;
  landing_view: number;
  photo_selected: number;
  women_photo_selected: number;
  men_photo_selected: number;
  analysis_succeeded: number;
  analysis_failed: number;
  match_result_view: number;
  feedback_yes: number;
  feedback_no: number;
  creator_link_clicked: number;
  share_succeeded: number;
  analysis_failures: {
    no_face: number;
    multiple_faces: number;
    too_dark: number;
    pose_issue: number;
    component_error: number;
  };
}

export interface AdminListResponse {
  submissions: AdminSubmission[];
  creators: AdminCreator[];
  outreach: AdminOutreach[];
  product_metrics: AdminProductMetrics;
}

interface AdminRequest {
  action: "list" | "verify" | "approve" | "reject" | "cleanup" | "set_active" | "delete_creator" | "save_outreach" | "delete_outreach";
  submissionId?: string;
  creatorId?: string;
  outreachId?: string;
  isActive?: boolean;
  confirmName?: string;
  reviewNote?: string;
  displayName?: string;
  profileUrl?: string;
  firstContactedAt?: string;
  outreachStatus?: AdminOutreachStatus;
  nextFollowUpAt?: string | null;
  lossReason?: string;
  notes?: string;
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
  if (code === "duplicate_outreach") {
    throw new Error("这个主页已经存在跟进记录。");
  }
  if (code === "invalid_outreach") {
    throw new Error("跟进资料不完整，请检查日期、链接和流失原因。");
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
  body.set("referenceAudience", input.referenceAudience);
  body.set("contentTypes", JSON.stringify(input.contentTypes));
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
