import type { AuthError, Session } from "@supabase/supabase-js";
import {
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LogIn,
  LogOut,
  MessageCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { contactWechatQrUrl } from "../config";
import {
  getPlusMembership,
  getPlusSession,
  registerPlusAccount,
  redeemPlusInvite,
  signInPlusAccount,
  type PlusMembership,
} from "./plusAccess";
import { plusClient } from "./plusClient";
import "./plus.css";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "long" }).format(new Date(value));
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "status" in error) {
    const authError = error as AuthError;
    if (authError.code === "invalid_credentials") return "邮箱或密码不正确。";
    if (authError.code === "user_already_exists" || authError.code === "email_exists") {
      return "这个邮箱已经注册，请切换到登录。";
    }
    if (authError.code === "weak_password") return "密码强度不足，请至少输入 8 位。";
    if (authError.code === "signup_disabled") return "Plus 注册暂未开放。";
    if (authError.code === "email_not_confirmed") return "当前账号仍要求邮箱确认，请联系运营者。";
    if (authError.status === 429 || authError.code === "over_request_rate_limit") {
      return "尝试次数过多，请稍后再试。";
    }
  }
  return error instanceof Error ? error.message : "请求失败，请稍后重试。";
}

export default function PlusApp() {
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [session, setSession] = useState<Session | null>(null);
  const [membership, setMembership] = useState<PlusMembership | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loadingMembership, setLoadingMembership] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const authenticatingRef = useRef(false);

  const loadMembership = useCallback(async () => {
    setLoadingMembership(true);
    setError("");
    try {
      setMembership(await getPlusMembership());
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setLoadingMembership(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    getPlusSession()
      .then((nextSession) => {
        if (!mounted) return;
        setSession(nextSession);
        setAuthReady(true);
      })
      .catch((nextError) => {
        if (!mounted) return;
        setError(errorMessage(nextError));
        setAuthReady(true);
      });
    const { data: listener } = plusClient.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session && !authenticatingRef.current) void loadMembership();
    else setMembership(null);
  }, [loadMembership, session]);

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    authenticatingRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (authMode === "register") {
        await registerPlusAccount(email.trim(), password, inviteCode);
        setMembership(await getPlusMembership());
        setInviteCode("");
      } else {
        await signInPlusAccount(email.trim(), password);
        setMembership(await getPlusMembership());
      }
      setPassword("");
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      authenticatingRef.current = false;
      setBusy(false);
    }
  }

  async function handleRedeem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setMembership(await redeemPlusInvite(inviteCode));
      setInviteCode("");
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  function switchAuthMode(nextMode: "register" | "login") {
    setAuthMode(nextMode);
    setPassword("");
    setInviteCode("");
    setError("");
  }

  const activeMembership = membership?.status === "active" &&
    new Date(membership.benefitExpiresAt).getTime() > Date.now();

  return (
    <div className="plus-account-shell">
      <header className="plus-account-topbar">
        <a className="plus-account-brand" href="/" aria-label="返回 MAKE UP 首页">
          <strong>MAKE UP</strong>
          <span>PLUS EARLY ACCESS</span>
        </a>
        <a className="plus-account-free-link" href="/">免费匹配</a>
      </header>

      <main className="plus-account-main">
        <section className="plus-account-heading" aria-labelledby="plus-account-title">
          <div>
            <p className="eyebrow">PLUS / 邀请制内测</p>
            <h1 id="plus-account-title">准备购买后，先添加微信</h1>
            <p>付款前会在微信确认本期名额、交付内容、时间和退款方式。确认后付款，运营者会发送一个一次性邀请码。</p>
          </div>
          <div className="plus-beta-price" aria-label="付费内测价格 9.9 元每次">
            <span>限量付费内测</span>
            <strong>¥9.9</strong>
            <small>/ 次</small>
          </div>
        </section>

        <section className="plus-purchase-flow" aria-label="Plus 购买和激活">
          <div className="plus-purchase-copy">
            <div className="plus-flow-step">
              <span>01</span>
              <div>
                <h2>添加运营者微信</h2>
                <p>添加时备注“Plus”。网页不会展示付款码，也不会自动判断你是否付款。</p>
              </div>
            </div>
            <div className="plus-flow-step">
              <span>02</span>
              <div>
                <h2>确认后付款并领取邀请码</h2>
                <p>运营者人工确认付款后发送邀请码。每个邀请码只能激活一个邮箱账号。</p>
              </div>
            </div>
            <div className="plus-flow-step">
              <span>03</span>
              <div>
                <h2>输入邀请码，注册后直接登录</h2>
                <p>首次填写邮箱、密码和邀请码；以后只用邮箱和密码登录。免费匹配仍然不需要登录。</p>
              </div>
            </div>
          </div>
          <figure className="plus-wechat-contact">
            <img alt="MAKE UP 运营者微信二维码" src={contactWechatQrUrl} />
            <figcaption><MessageCircle size={17} />准备购买，添加微信</figcaption>
          </figure>
        </section>

        <section className="plus-access-section" aria-labelledby="plus-access-title">
          <div className="plus-access-intro">
            <p className="eyebrow">ACCOUNT / 账号激活</p>
            <h2 id="plus-access-title">邮箱密码注册与登录</h2>
            <p>首次注册需要邀请码，成功后立即登录。密码由 Supabase Auth 负责认证，业务表不会保存密码明文，也不会保存照片、面部比例、报告或博主结果。</p>
            <div className="plus-benefits">
              <p><Sparkles size={17} /><span><strong>早期用户资格</strong>后续 Plus 功能优先体验</span></p>
              <p><CheckCircle2 size={17} /><span><strong>3 次体验额度</strong>自激活起 180 天内有效</span></p>
              <p><ShieldCheck size={17} /><span><strong>免费功能不变</strong>不登录也能继续匹配</span></p>
            </div>
          </div>

          <div className="plus-access-tool">
            {!authReady ? (
              <div className="plus-access-loading"><LoaderCircle className="spin" size={22} />正在确认登录状态…</div>
            ) : !session ? (
              <>
                <div className="plus-auth-tabs" aria-label="Plus 账号方式" role="tablist">
                  <button
                    aria-selected={authMode === "register"}
                    onClick={() => switchAuthMode("register")}
                    role="tab"
                    type="button"
                  >
                    注册并激活
                  </button>
                  <button
                    aria-selected={authMode === "login"}
                    onClick={() => switchAuthMode("login")}
                    role="tab"
                    type="button"
                  >
                    登录
                  </button>
                </div>
                <form className="plus-access-form" onSubmit={handleAuthSubmit}>
                  <label htmlFor="plus-email">邮箱</label>
                  <input
                    autoComplete="email"
                    id="plus-email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@example.com"
                    required
                    type="email"
                    value={email}
                  />
                  <label htmlFor="plus-password">密码</label>
                  <div className="plus-password-field">
                    <input
                      autoComplete={authMode === "register" ? "new-password" : "current-password"}
                      id="plus-password"
                      minLength={8}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="至少 8 位"
                      required
                      type={showPassword ? "text" : "password"}
                      value={password}
                    />
                    <button
                      aria-label={showPassword ? "隐藏密码" : "显示密码"}
                      onClick={() => setShowPassword((current) => !current)}
                      title={showPassword ? "隐藏密码" : "显示密码"}
                      type="button"
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  {authMode === "register" && (
                    <>
                      <label htmlFor="plus-register-invite">一次性邀请码</label>
                      <input
                        autoCapitalize="characters"
                        autoComplete="off"
                        id="plus-register-invite"
                        onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                        placeholder="MAKEUP-XXXX-XXXX-XXXX"
                        required
                        type="text"
                        value={inviteCode}
                      />
                    </>
                  )}
                  <button className="button button-primary" disabled={busy} type="submit">
                    {busy ? <LoaderCircle className="spin" size={17} /> : authMode === "register" ? <KeyRound size={17} /> : <LogIn size={17} />}
                    {authMode === "register" ? "注册并登录" : "登录"}
                  </button>
                </form>
              </>
            ) : loadingMembership ? (
              <div className="plus-access-loading"><LoaderCircle className="spin" size={22} />正在读取 Plus 权益…</div>
            ) : activeMembership && membership ? (
              <div className="plus-membership-active">
                <div className="plus-membership-title"><Check size={22} /><div><small>PLUS EARLY ACCESS</small><h3>账号已激活</h3></div></div>
                <dl>
                  <div><dt>登录邮箱</dt><dd>{session.user.email}</dd></div>
                  <div><dt>体验额度</dt><dd>{membership.trialCredits} 次</dd></div>
                  <div><dt>权益有效期</dt><dd>至 {formatDate(membership.benefitExpiresAt)}</dd></div>
                </dl>
                <button className="button button-secondary" onClick={() => void plusClient.auth.signOut()} type="button">
                  <LogOut size={17} />退出登录
                </button>
              </div>
            ) : (
              <form className="plus-access-form" onSubmit={handleRedeem}>
                <div className="plus-signed-in">
                  <div><small>当前账号</small><strong>{session.user.email}</strong></div>
                  <button aria-label="退出登录" onClick={() => void plusClient.auth.signOut()} title="退出登录" type="button"><LogOut size={17} /></button>
                </div>
                <label htmlFor="plus-invite">一次性邀请码</label>
                <input
                  autoCapitalize="characters"
                  autoComplete="off"
                  id="plus-invite"
                  onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                  placeholder="MAKEUP-XXXX-XXXX-XXXX"
                  required
                  type="text"
                  value={inviteCode}
                />
                <button className="button button-primary" disabled={busy} type="submit">
                  {busy ? <LoaderCircle className="spin" size={17} /> : <KeyRound size={17} />}
                  激活 Plus
                </button>
              </form>
            )}
            {error && <p className="plus-access-error" role="alert">{error}</p>}
          </div>
        </section>
      </main>
    </div>
  );
}
