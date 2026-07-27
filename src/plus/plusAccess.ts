import type { Session } from "@supabase/supabase-js";
import { plusClient } from "./plusClient";

export interface PlusMembership {
  userId: string;
  tier: "early_access";
  status: "active" | "revoked";
  trialCredits: number;
  activatedAt: string;
  benefitExpiresAt: string;
}

interface MembershipResponse {
  membership: PlusMembership | null;
}

async function invokePlus<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await plusClient.functions.invoke("plus-access", { body });
  if (!error) return data as T;

  let code: string | undefined;
  if ("context" in error && error.context instanceof Response) {
    const payload = await error.context
      .clone()
      .json()
      .catch(() => undefined) as { code?: string } | undefined;
    code = payload?.code;
  }

  if (code === "invite_invalid") throw new Error("邀请码格式不正确或不存在。");
  if (code === "invite_expired") throw new Error("这个邀请码已过期，请在微信中联系运营者。");
  if (code === "invite_redeemed") throw new Error("这个邀请码已经被其他账号使用。");
  if (code === "email_exists") throw new Error("这个邮箱已经注册，请切换到登录。");
  if (code === "invalid_email") throw new Error("请输入有效的邮箱地址。");
  if (code === "invalid_password") throw new Error("密码需要为 8 至 72 位。");
  if (code === "auth_required") throw new Error("登录状态已失效，请重新登录。");
  if (code === "service_not_configured") throw new Error("Plus 账号服务尚未完成配置。");
  throw new Error("Plus 账号请求失败，请稍后重试。");
}

export async function getPlusSession(): Promise<Session | null> {
  const { data, error } = await plusClient.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function registerPlusAccount(
  email: string,
  password: string,
  inviteCode: string,
): Promise<Session> {
  await invokePlus<{ registered: true }>({
    action: "register",
    email,
    password,
    inviteCode,
  });
  return signInPlusAccount(email, password);
}

export async function signInPlusAccount(email: string, password: string): Promise<Session> {
  const { data, error } = await plusClient.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data.session;
}

export async function getPlusMembership(): Promise<PlusMembership | null> {
  return (await invokePlus<MembershipResponse>({ action: "status" })).membership;
}

export async function redeemPlusInvite(inviteCode: string): Promise<PlusMembership> {
  const response = await invokePlus<MembershipResponse>({
    action: "redeem",
    inviteCode,
  });
  if (!response.membership) throw new Error("邀请码已兑换，但权益状态读取失败，请刷新页面。");
  return response.membership;
}
