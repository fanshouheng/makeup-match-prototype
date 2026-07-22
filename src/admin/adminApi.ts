import type { Session } from "@supabase/supabase-js";
import { adminClient } from "./adminClient";

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
  action: "list" | "verify" | "approve" | "reject" | "cleanup";
  submissionId?: string;
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

export async function getAdminSession(): Promise<Session | null> {
  const { data, error } = await adminClient.auth.getSession();
  if (error) throw error;
  return data.session;
}
