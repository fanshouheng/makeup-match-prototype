import { getAccountClient } from "./accountClient";

export const FREE_SUCCESSFUL_MATCH_LIMIT = 3;
const LOCAL_MATCH_COUNT_KEY = "make-up-free-successful-matches-v1";
const PENDING_REFERRAL_KEY = "make-up-pending-referral-v1";
const REFERRAL_CODE_PATTERN = /^[A-F0-9]{10}$/;

interface StorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface RewardStatus {
  referralCode: string;
  matchCredits: number;
  aiCredits: number;
  successfulMatchCount: number;
  successfulInvites: number;
  pendingReferral: boolean;
}

interface RewardResponse {
  rewards: RewardStatus;
}

export function readLocalSuccessfulMatches(storage: StorageLike): number {
  const parsed = Number.parseInt(storage.getItem(LOCAL_MATCH_COUNT_KEY) ?? "0", 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), FREE_SUCCESSFUL_MATCH_LIMIT) : 0;
}

export function recordLocalSuccessfulMatch(storage: StorageLike): number {
  const next = Math.min(readLocalSuccessfulMatches(storage) + 1, FREE_SUCCESSFUL_MATCH_LIMIT);
  storage.setItem(LOCAL_MATCH_COUNT_KEY, String(next));
  return next;
}

export function freeSuccessfulMatchesRemaining(used: number): number {
  return Math.max(FREE_SUCCESSFUL_MATCH_LIMIT - used, 0);
}

export function normalizeReferralCode(value: string | null | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized && REFERRAL_CODE_PATTERN.test(normalized) ? normalized : undefined;
}

export function captureReferralCode(search: string, storage: StorageLike): string | undefined {
  const code = normalizeReferralCode(new URLSearchParams(search).get("ref"));
  if (code) storage.setItem(PENDING_REFERRAL_KEY, code);
  return code;
}

export function pendingReferralCode(storage: StorageLike): string | undefined {
  return normalizeReferralCode(storage.getItem(PENDING_REFERRAL_KEY));
}

export function clearPendingReferralCode(storage: StorageLike): void {
  storage.removeItem(PENDING_REFERRAL_KEY);
}

export function buildReferralUrl(origin: string, referralCode: string): string {
  const url = new URL(origin);
  url.searchParams.set("ref", referralCode);
  url.hash = "start";
  return url.toString();
}

async function invokeRewards(body: Record<string, unknown>): Promise<RewardStatus> {
  const client = getAccountClient();
  const { data, error } = await client.functions.invoke("rewards-access", { body });
  if (!error) return (data as RewardResponse).rewards;

  let code: string | undefined;
  if ("context" in error && error.context instanceof Response) {
    const payload = await error.context.clone().json().catch(() => undefined) as { code?: string } | undefined;
    code = payload?.code;
  }
  if (code === "auth_required") throw new Error("请先登录账号。");
  if (code === "email_not_confirmed") throw new Error("请先完成邮箱确认。");
  if (code === "referral_invalid") throw new Error("邀请链接无效或已经失效。");
  if (code === "self_referral") throw new Error("不能使用自己的邀请链接。");
  if (code === "referral_already_claimed") throw new Error("这个账号已经接受过其他邀请。");
  if (code === "no_match_credits") throw new Error("匹配次数已用完，请先邀请一位朋友完成匹配。");
  if (code === "account_not_found") throw new Error("没有找到这个已确认邮箱账号。");
  throw new Error("权益服务暂时不可用，请稍后重试。");
}

export function getRewardStatus(): Promise<RewardStatus> {
  return invokeRewards({ action: "status" });
}

export function claimReferral(referralCode: string): Promise<RewardStatus> {
  return invokeRewards({ action: "claimReferral", referralCode });
}

export function recordRewardMatchSuccess(
  successId: string,
  consumeBonus: boolean,
): Promise<RewardStatus> {
  return invokeRewards({ action: "recordMatchSuccess", successId, consumeBonus });
}
