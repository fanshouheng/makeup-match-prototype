import type { AuthError, Session } from "@supabase/supabase-js";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Gift,
  LoaderCircle,
  LogIn,
  LogOut,
  Share2,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { contactWechatQrUrl } from "../config";
import { accountClient } from "../services/accountClient";
import {
  buildReferralUrl,
  captureReferralCode,
  claimReferral,
  clearPendingReferralCode,
  getRewardStatus,
  pendingReferralCode,
  type RewardStatus,
} from "../services/rewards";

interface RewardsPanelProps {
  embedded?: boolean;
  urgent?: boolean;
  onRewardsChange?: (rewards: RewardStatus) => void;
}

function authErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "status" in error) {
    const authError = error as AuthError;
    if (authError.code === "invalid_credentials") return "邮箱或密码不正确。";
    if (authError.code === "email_not_confirmed") return "请先打开确认邮件完成注册。";
    if (authError.code === "user_already_exists" || authError.code === "email_exists") {
      return "这个邮箱已经注册，请切换到登录。";
    }
    if (authError.code === "weak_password") return "密码强度不足，请至少输入 8 位。";
    if (authError.status === 429 || authError.code === "over_request_rate_limit") {
      return "尝试次数过多，请稍后再试。";
    }
  }
  return error instanceof Error ? error.message : "账号请求失败，请稍后重试。";
}

export function RewardsPanel({ embedded = false, urgent = false, onRewardsChange }: RewardsPanelProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [rewards, setRewards] = useState<RewardStatus>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      captureReferralCode(window.location.search, window.localStorage);
    } catch {
      // Referral persistence is best-effort when browser storage is unavailable.
    }
    if (!accountClient) {
      setAuthReady(true);
      return;
    }
    let mounted = true;
    void accountClient.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: listener } = accountClient.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) {
        setSession(nextSession);
        setAuthReady(true);
      }
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setRewards(undefined);
      return;
    }
    let active = true;
    setBusy(true);
    setError("");
    void (async () => {
      try {
        let code: string | undefined;
        try {
          code = pendingReferralCode(window.localStorage);
        } catch {
          code = undefined;
        }
        const next = code ? await claimReferral(code) : await getRewardStatus();
        if (!active) return;
        if (code) {
          clearPendingReferralCode(window.localStorage);
          setNotice("邀请已接受。完成一次成功匹配后，双方会自动获得奖励。");
        }
        setRewards(next);
        onRewardsChange?.(next);
      } catch (nextError) {
        if (active) setError(nextError instanceof Error ? nextError.message : "权益读取失败。");
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [session, onRewardsChange]);

  const referralUrl = useMemo(
    () => rewards ? buildReferralUrl(window.location.origin, rewards.referralCode) : "",
    [rewards],
  );
  const canShare = typeof navigator.share === "function";

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountClient) {
      setError("账号服务尚未完成配置。");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (authMode === "register") {
        let redirect = `${window.location.origin}/#start`;
        try {
          const code = pendingReferralCode(window.localStorage);
          if (code) redirect = buildReferralUrl(window.location.origin, code);
        } catch {
          // Keep the normal callback when browser storage is unavailable.
        }
        const { data, error: signUpError } = await accountClient.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: redirect },
        });
        if (signUpError) throw signUpError;
        if (!data.session) setNotice("确认邮件已发送。确认后回来完成一次匹配即可生效。");
      } else {
        const { error: signInError } = await accountClient.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
      }
      setPassword("");
    } catch (authError) {
      setError(authErrorMessage(authError));
    } finally {
      setBusy(false);
    }
  }

  async function shareInvite() {
    if (!referralUrl) return;
    setError("");
    try {
      if (canShare) {
        await navigator.share({
          title: "MAKE UP 妆容参考",
          text: "我在用 MAKE UP 找妆容参考，完成一次匹配后我们都能获得 AI 推荐次数。",
          url: referralUrl,
        });
      } else {
        await navigator.clipboard.writeText(referralUrl);
        setCopied(true);
      }
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === "AbortError") return;
      setError("分享失败，请稍后重试。");
    }
  }

  return (
    <section className={`rewards-panel ${urgent ? "is-urgent" : ""} ${embedded ? "is-embedded" : ""}`} aria-labelledby="rewards-title">
      <div className="rewards-heading">
        <div>
          <p className="eyebrow">INVITE / 邀请权益</p>
          <h2 id="rewards-title">邀请朋友，继续免费匹配</h2>
          <p>好友确认邮箱并成功完成一次匹配后，你获得 3 次匹配和 1 次 AI 推荐，好友获得 1 次 AI 推荐。</p>
        </div>
        <Gift size={24} />
      </div>

      {!authReady ? (
        <div className="rewards-loading"><LoaderCircle className="spin" size={18} />正在确认登录状态</div>
      ) : !session ? (
        <div className="rewards-auth">
          <div className="ai-auth-tabs" aria-label="账号方式" role="tablist">
            <button aria-selected={authMode === "register"} onClick={() => setAuthMode("register")} role="tab" type="button">注册</button>
            <button aria-selected={authMode === "login"} onClick={() => setAuthMode("login")} role="tab" type="button">登录</button>
          </div>
          <form className="ai-auth-form" onSubmit={handleAuth}>
            <label htmlFor="reward-account-email">邮箱</label>
            <input autoComplete="email" id="reward-account-email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
            <label htmlFor="reward-account-password">密码</label>
            <div className="ai-auth-password">
              <input autoComplete={authMode === "register" ? "new-password" : "current-password"} id="reward-account-password" minLength={8} onChange={(event) => setPassword(event.target.value)} required type={showPassword ? "text" : "password"} value={password} />
              <button aria-label={showPassword ? "隐藏密码" : "显示密码"} onClick={() => setShowPassword((current) => !current)} title={showPassword ? "隐藏密码" : "显示密码"} type="button">
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            <button className="button button-primary" disabled={busy} type="submit">
              {busy ? <LoaderCircle className="spin" size={16} /> : authMode === "register" ? <UserPlus size={16} /> : <LogIn size={16} />}
              {busy ? "请稍候" : authMode === "register" ? "注册账号" : "登录"}
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="rewards-session">
            <div><small>当前账号</small><strong>{session.user.email}</strong></div>
            <button aria-label="退出登录" onClick={() => void accountClient?.auth.signOut()} title="退出登录" type="button"><LogOut size={17} /></button>
          </div>
          {busy && !rewards ? (
            <div className="rewards-loading"><LoaderCircle className="spin" size={18} />正在读取权益</div>
          ) : rewards && (
            <>
              <div className="reward-balances" aria-label="当前权益">
                <div><span>匹配次数</span><strong>{rewards.matchCredits}</strong></div>
                <div><span>AI 推荐次数</span><strong>{rewards.aiCredits}</strong></div>
                <div><span>成功邀请</span><strong>{rewards.successfulInvites}</strong></div>
              </div>
              {rewards.pendingReferral && <p className="reward-pending">完成下一次成功匹配后，邀请奖励自动到账。</p>}
              <div className="reward-invite-link">
                <input aria-label="邀请链接" readOnly value={referralUrl} />
                <button className="button button-primary" onClick={() => void shareInvite()} type="button">
                  {copied ? <Check size={16} /> : canShare ? <Share2 size={16} /> : <Copy size={16} />}
                  {copied ? "已复制" : "邀请朋友"}
                </button>
              </div>
              <div className="reward-purchase">
                <div>
                  <Sparkles size={18} />
                  <p><strong>¥9.9 获得 10 次 AI 推荐</strong><span>微信确认后，由运营者发放到当前邮箱账号。基础匹配次数不出售。</span></p>
                </div>
                <img alt="MAKE UP 微信联系二维码" src={contactWechatQrUrl} />
              </div>
            </>
          )}
        </>
      )}
      {notice && <p className="rewards-notice" role="status">{notice}</p>}
      {error && <p className="rewards-error" role="alert">{error}</p>}
    </section>
  );
}
