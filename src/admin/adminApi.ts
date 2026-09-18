import type { Session } from "@supabase/supabase-js";
import type {
  CreatorContentType,
  CreatorPlatform,
  ReferenceAudience,
} from "../domain/creator";
import type { FaceFeatureVector, PoseMetrics } from "../domain/faceFeatures";
import { adminClient } from "./adminClient";

const ADMIN_CONSENT_VERSION = "2026-07-21";

export interface AdminCreatorSubmissionInput {
  name: string;
  contactEmail: string;
  platform: CreatorPlatform;
  profileUrl: string;
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
  platform: CreatorPlatform;
  profile_url: string;
  douyin_url: string | null;
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
  platform: CreatorPlatform;
  profile_url: string;
  douyin_url: string | null;
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
  plus_page_viewed?: number;
  plus_checkout_started?: number;
  points_page_viewed?: number;
  points_checkout_started?: number;
  membership_page_viewed?: number;
  membership_checkout_started?: number;
  membership_cycle_granted?: number;
  membership_payment_failed?: number;
  plus_invite_redeemed?: number;
  plus_job_created?: number;
  plus_job_succeeded?: number;
  plus_job_failed?: number;
  plus_credit_refunded?: number;
  plus_report_saved_local?: number;
  plus_usage_feedback?: number;
  ai_discovery_viewed?: number;
  ai_discovery_consent?: number;
  ai_discovery_requested?: number;
  ai_discovery_succeeded?: number;
  ai_discovery_failed?: number;
  ai_creator_name_clicked?: number;
  ai_discovery_feedback?: number;
  plus_offer_viewed: number;
  plus_offer_opened: number;
  plus_offer_configured: number;
  plus_intent_yes: number;
  plus_intent_price_high: number;
  plus_intent_not_needed: number;
  plus_by_variant: Record<AdminPlusVariant, AdminPlusVariantMetrics>;
  analysis_failures: {
    no_face: number;
    multiple_faces: number;
    too_dark: number;
    pose_issue: number;
    component_error: number;
  };
  negative_feedback: {
    valid_responses: number;
    reasons: {
      analysis_incorrect: number;
      creator_mismatch: number;
      style_mismatch: number;
      problem_not_solved: number;
      other: number;
    };
  };
}

export type AdminPlusVariant = "price_9_9" | "price_19_9" | "price_29_9";

export interface AdminPlusVariantMetrics {
  plus_offer_viewed: number;
  plus_offer_opened: number;
  plus_offer_configured: number;
  plus_intent_yes: number;
  plus_intent_price_high: number;
  plus_intent_not_needed: number;
}

export type AdminAiDiscoveryStatus = "succeeded" | "failed";

export interface AdminAiDiscoveryLog {
  id: string;
  status: AdminAiDiscoveryStatus;
  error_code: string | null;
  duration_ms: number;
  provider_status: number | null;
  reference_audience: ReferenceAudience;
  content_filter: "all" | "hair" | "makeup";
  locale?: "zh-CN" | "en-US" | "en-GB" | "ja-JP" | "ko-KR" | null;
  country_code?: "CN" | "JP" | "KR" | "US" | "GB" | null;
  platform?: "all" | "youtube" | "instagram" | "tiktok" | "xiaohongshu" | "douyin" | null;
  created_at: string;
}

export interface AdminAiDiscoveryData {
  period_start: string;
  total: number;
  succeeded: number;
  failed: number;
  dimensions_available: boolean;
  dimensions: {
    locale: Record<"zh-CN" | "en-US" | "en-GB" | "ja-JP" | "ko-KR", number>;
    country_code: Record<"global" | "CN" | "JP" | "KR" | "US" | "GB", number>;
    platform: Record<"all" | "youtube" | "instagram" | "tiktok" | "xiaohongshu" | "douyin", number>;
  };
  recent: AdminAiDiscoveryLog[];
}

export interface AdminPaymentSummary {
  available: boolean;
  period_start?: string;
  order_count?: number;
  by_status?: Record<string, number>;
  by_provider?: Record<string, number>;
  by_product?: Record<string, number>;
  paid_amounts_minor?: Record<string, number>;
  paid_points?: number;
  by_package?: Record<string, number>;
  subscription_count?: number;
  subscriptions_by_status?: Record<string, number>;
  subscriptions_by_plan?: Record<string, number>;
  subscription_cycles_granted?: number;
  subscription_points_granted?: number;
  point_activity?: {
    available: boolean;
    consumed_points: number;
    refunded_points: number;
    by_purpose: Record<"ai_discovery" | "makeup_report", {
      reserved: number;
      consumed: number;
      refunded: number;
    }>;
  };
}

export interface AdminMembershipPlan {
  code: "pro_monthly";
  provider: "stripe" | "zpay";
  name: string;
  monthlyAmountMinor: number;
  currency: "CNY" | "USD";
  monthlyPoints: number;
  stripePriceIdConfigured: boolean;
  isActive: boolean;
}

export interface AdminCommerceOverview {
  available: boolean;
  generatedAt?: string;
  registrations?: {
    total: number;
    confirmed: number;
    last30Days: number;
  };
  users?: Array<{
    email: string | null;
    createdAt: string;
    confirmedAt: string | null;
    lastSignInAt: string | null;
  }>;
  payments?: {
    total: number;
    paid: number;
    pending: number;
    refunded: number;
    paidCnyMinor: number;
    paidUsdMinor: number;
  };
  orders?: Array<{
    id: string;
    email: string | null;
    provider: "stripe" | "zpay" | "manual";
    productCode: string;
    planCode: string | null;
    amountMinor: number;
    currency: string;
    status: string;
    paidAt: string | null;
    refundedAt: string | null;
    createdAt: string;
  }>;
  memberships?: {
    total: number;
    active: number;
    expiring7Days: number;
  };
  members?: Array<{
    email: string | null;
    provider: "stripe" | "zpay";
    planCode: string;
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    managementSource: "admin" | "payment";
    createdAt: string;
  }>;
}

export interface AdminMembershipStatus {
  userId: string;
  email: string;
  points: number;
  subscription: null | {
    id: string;
    provider: "stripe" | "zpay";
    planCode: string;
    status: "active" | "trialing" | "past_due" | "unpaid" | "canceled" | "incomplete" | "incomplete_expired";
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    managementSource: "admin" | "payment";
    cancelAtPeriodEnd: boolean;
  };
}

export interface AdminMembershipPlanInput {
  name: string;
  monthlyPoints: number;
  zpayAmountMinor: number;
  stripeAmountMinor: number;
  isActive: boolean;
}

export interface AdminListResponse {
  submissions: AdminSubmission[];
  creators: AdminCreator[];
  outreach: AdminOutreach[];
  product_metrics: AdminProductMetrics;
  ai_discovery: AdminAiDiscoveryData;
  payment_summary: AdminPaymentSummary;
  commerce_overview: AdminCommerceOverview;
}

export interface AdminIssuedPlusInvite {
  inviteCode: string;
  expiresAt: string;
}

export interface AdminRewardStatus {
  referralCode: string;
  matchCredits: number;
  aiCredits: number;
  points: number;
  successfulMatchCount: number;
  successfulInvites: number;
  pendingReferral: boolean;
}

interface AdminRequest {
  action: "list" | "verify" | "approve" | "reject" | "cleanup" | "set_active" | "delete_creator" | "save_outreach" | "delete_outreach" | "get_membership_catalog" | "lookup_membership" | "grant_membership_month" | "cancel_membership" | "update_membership_plan";
  metricsStartDate?: string;
  metricsEndDate?: string;
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
  email?: string;
  idempotencyKey?: string;
  planName?: string;
  monthlyPoints?: number;
  zpayAmountMinor?: number;
  stripeAmountMinor?: number;
  planActive?: boolean;
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
  if (code === "invalid_metrics_range") {
    throw new Error("日期范围无效，请检查开始和结束日期。");
  }
  if (code === "account_not_found") throw new Error("没有找到这个已确认邮箱账号。");
  if (code === "email_not_confirmed") throw new Error("这个账号尚未完成邮箱确认。");
  if (code === "membership_not_found") throw new Error("这个账号当前没有可停止的会员。");
  if (code === "membership_plan_not_found") throw new Error("MAKE UP Pro 套餐尚未完成配置。");
  if (code === "external_subscription_requires_provider") throw new Error("这是 Stripe 自动订阅，请先在 Stripe 后台取消，避免状态被下一次回调覆盖。");
  if (code === "invalid_membership_action") throw new Error("会员操作参数无效，请刷新后重试。");
  if (code === "invalid_membership_plan") throw new Error("套餐参数无效，请检查名称、积分和价格。");
  if (code === "idempotency_key_reused") throw new Error("这次操作编号已用于其他账号，请刷新后重试。");
  if (code === "membership_not_ready") throw new Error("会员管理迁移尚未部署。");
  throw new Error("管理台请求失败，请稍后重试。");
}

export async function getAdminMembershipCatalog(): Promise<AdminMembershipPlan[]> {
  const result = await invokeAdmin<{ plans: AdminMembershipPlan[] }>({ action: "get_membership_catalog" });
  return result.plans;
}

export async function lookupAdminMembership(email: string): Promise<AdminMembershipStatus> {
  const result = await invokeAdmin<{ membership: AdminMembershipStatus }>({
    action: "lookup_membership",
    email: email.trim().toLowerCase(),
  });
  return result.membership;
}

export async function grantAdminMembershipMonth(
  email: string,
  idempotencyKey: string,
): Promise<AdminMembershipStatus> {
  const result = await invokeAdmin<{ membership: AdminMembershipStatus }>({
    action: "grant_membership_month",
    email: email.trim().toLowerCase(),
    idempotencyKey,
  });
  return result.membership;
}

export async function cancelAdminMembership(
  email: string,
  idempotencyKey: string,
): Promise<AdminMembershipStatus> {
  const result = await invokeAdmin<{ membership: AdminMembershipStatus }>({
    action: "cancel_membership",
    email: email.trim().toLowerCase(),
    idempotencyKey,
  });
  return result.membership;
}

export async function updateAdminMembershipPlan(
  input: AdminMembershipPlanInput,
  idempotencyKey: string,
): Promise<AdminMembershipPlan[]> {
  const result = await invokeAdmin<{ plans: AdminMembershipPlan[] }>({
    action: "update_membership_plan",
    idempotencyKey,
    planName: input.name.trim(),
    monthlyPoints: input.monthlyPoints,
    zpayAmountMinor: input.zpayAmountMinor,
    stripeAmountMinor: input.stripeAmountMinor,
    planActive: input.isActive,
  });
  return result.plans;
}

export async function createAdminSubmission(
  input: AdminCreatorSubmissionInput,
): Promise<void> {
  const body = new FormData();
  body.set("action", "create");
  body.set("name", input.name);
  body.set("contactEmail", input.contactEmail);
  body.set("platform", input.platform);
  body.set("profileUrl", input.profileUrl);
  if (input.platform === "douyin") body.set("douyinUrl", input.profileUrl);
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

export async function issuePlusInvite(): Promise<AdminIssuedPlusInvite> {
  const { data, error } = await adminClient.functions.invoke("plus-access", {
    body: { action: "issue" },
  });
  if (!error) return data as AdminIssuedPlusInvite;

  let code: string | undefined;
  if ("context" in error && error.context instanceof Response) {
    const payload = await error.context
      .clone()
      .json()
      .catch(() => undefined) as { code?: string } | undefined;
    code = payload?.code;
  }
  if (code === "not_admin") throw new Error("这个账号没有邀请码签发权限。");
  if (code === "auth_required") throw new Error("登录状态已失效，请重新登录。");
  if (code === "service_not_configured") throw new Error("Plus 账号服务配置不完整。");
  throw new Error("邀请码签发失败，请稍后重试。");
}

export async function grantPoints(email: string, points: number): Promise<AdminRewardStatus> {
  const { data, error } = await adminClient.functions.invoke("rewards-access", {
    body: { action: "grantPoints", email: email.trim().toLowerCase(), points },
  });
  if (!error) return (data as { rewards: AdminRewardStatus }).rewards;

  let code: string | undefined;
  if ("context" in error && error.context instanceof Response) {
    const payload = await error.context.clone().json().catch(() => undefined) as { code?: string } | undefined;
    code = payload?.code;
  }
  if (code === "account_not_found") throw new Error("没有找到这个已确认邮箱账号。");
  if (code === "not_admin") throw new Error("这个账号没有发放积分的权限。");
  if (code === "invalid_point_amount") throw new Error("积分数量必须是 1 到 100000 的整数。");
  if (code === "auth_required") throw new Error("登录状态已失效，请重新登录。");
  throw new Error("积分发放失败，请稍后重试。");
}

export async function requestPaymentRefund(
  orderId: string,
  confirmation: string,
): Promise<{ status: "pending" | "refunded" }> {
  const { data, error } = await adminClient.functions.invoke("refund-payment", {
    body: { confirmation, orderId },
  });
  if (!error) return data as { status: "pending" | "refunded" };

  let code: string | undefined;
  if ("context" in error && error.context instanceof Response) {
    const payload = await error.context.clone().json().catch(() => undefined) as { code?: string } | undefined;
    code = payload?.code;
  }
  if (code === "invalid_request") throw new Error("退款参数无效。");
  if (code === "payment_not_found") throw new Error("没有找到这笔订单。");
  if (code === "payment_not_refundable") throw new Error("这笔订单当前不能退款。");
  if (code === "payment_provider_not_refundable") throw new Error("人工订单需要在线下完成退款。");
  if (code === "points_already_used") throw new Error("这笔订单发放的积分已有部分被使用，不能自动全额退款。");
  if (code === "provider_refund_failed") throw new Error("支付供应商拒绝了退款，请到供应商后台核对订单。");
  if (code === "stripe_not_configured" || code === "zpay_not_configured") {
    throw new Error("对应支付供应商尚未完成服务器配置。");
  }
  if (code === "not_admin") throw new Error("这个账号没有退款权限。");
  if (code === "auth_required") throw new Error("登录状态已失效，请重新登录。");
  throw new Error("退款请求失败，请稍后重试。");
}
