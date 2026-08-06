import {
  Turnstile,
  type TurnstileInstance,
} from "@marsidev/react-turnstile";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  LogIn,
  LogOut,
  Sparkles,
  UserPlus,
} from "lucide-react";
import type { AuthError, Session } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import {
  hasTurnstileConfig,
  turnstileSiteKey,
} from "../config";
import type {
  CreatorContentFilter,
  ReferenceAudience,
} from "../domain/creator";
import {
  discoverCreatorsWithAi,
  type AiCreatorDiscoveryResult,
} from "../services/aiCreatorDiscovery";
import { accountClient } from "../services/accountClient";
import { hasSupabaseConfig } from "../services/supabaseClient";

interface AiCreatorDiscoveryProps {
  contentFilter: CreatorContentFilter;
  referenceAudience: ReferenceAudience;
  userPhoto: HTMLImageElement;
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

export function AiCreatorDiscovery({
  contentFilter,
  referenceAudience,
  userPhoto,
}: AiCreatorDiscoveryProps) {
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined);
  const [expanded, setExpanded] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authNotice, setAuthNotice] = useState("");
  const [consent, setConsent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiCreatorDiscoveryResult>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!accountClient) {
      setAuthReady(true);
      return;
    }
    let mounted = true;
    accountClient.auth.getSession().then(({ data }) => {
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

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountClient) {
      setError("账号服务尚未完成配置。");
      return;
    }
    setAuthBusy(true);
    setError(undefined);
    setAuthNotice("");
    try {
      if (authMode === "register") {
        const { data, error: signUpError } = await accountClient.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setAuthNotice("确认邮件已发送。完成确认后回到 MAKE UP 即可使用。");
        }
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
      setAuthBusy(false);
    }
  }

  async function handleDiscover() {
    setError(undefined);
    if (!session) {
      setError("请先登录免费账号，再使用 AI 推荐。");
      return;
    }
    if (!consent) {
      setError("请先确认照片处理说明。");
      return;
    }
    if (!hasSupabaseConfig || !hasTurnstileConfig) {
      setError("AI 推荐尚未完成服务配置。");
      return;
    }
    if (!turnstileToken) {
      setError("请先完成安全验证。");
      return;
    }

    setLoading(true);
    try {
      setResult(await discoverCreatorsWithAi({
        accessToken: session.access_token,
        contentFilter,
        image: userPhoto,
        referenceAudience,
        turnstileToken,
      }));
    } catch (discoveryError) {
      setError(
        discoveryError instanceof Error
          ? discoveryError.message
          : "AI 推荐暂时不可用，请稍后重试。",
      );
    } finally {
      setLoading(false);
      setTurnstileToken("");
      turnstileRef.current?.reset();
    }
  }

  function switchAuthMode(nextMode: "register" | "login") {
    setAuthMode(nextMode);
    setError(undefined);
    setAuthNotice("");
  }

  return (
    <section className="ai-discovery" aria-labelledby="ai-discovery-title">
      <div className="ai-discovery-heading">
        <div>
          <p className="eyebrow">AI DISCOVERY / 联网推荐</p>
          <h3 id="ai-discovery-title">让 AI 再找几个参考</h3>
          <p>登录免费账号后，AI 会分析这张照片并联网查找，只返回博主名字。</p>
        </div>
        <button
          aria-controls="ai-discovery-content"
          aria-expanded={expanded}
          className="button button-secondary"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          <Sparkles size={16} />
          {expanded ? "收起" : "AI 找更多参考"}
        </button>
      </div>

      {expanded && (
        result ? (
          <div className="ai-discovery-result" id="ai-discovery-content" role="status">
            <div className="ai-discovery-result-heading">
              <CheckCircle2 size={19} />
              <div>
                <h4>可以搜索这些名字</h4>
                <p>AI 联网推荐，尚未完成主页与授权核验。</p>
              </div>
            </div>
            <ol className="ai-name-list">
              {result.names.map((name) => <li key={name}>{name}</li>)}
            </ol>
          </div>
        ) : (
          <div className="ai-discovery-consent" id="ai-discovery-content">
            {!authReady ? (
              <div className="ai-auth-loading">
                <LoaderCircle className="spin" size={18} />正在确认登录状态…
              </div>
            ) : !session ? (
              <div className="ai-auth-panel">
                <div className="ai-auth-tabs" aria-label="免费账号方式" role="tablist">
                  <button aria-selected={authMode === "register"} onClick={() => switchAuthMode("register")} role="tab" type="button">注册</button>
                  <button aria-selected={authMode === "login"} onClick={() => switchAuthMode("login")} role="tab" type="button">登录</button>
                </div>
                <form className="ai-auth-form" onSubmit={handleAuth}>
                  <label htmlFor="ai-account-email">邮箱</label>
                  <input
                    autoComplete="email"
                    id="ai-account-email"
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    type="email"
                    value={email}
                  />
                  <label htmlFor="ai-account-password">密码</label>
                  <div className="ai-auth-password">
                    <input
                      autoComplete={authMode === "register" ? "new-password" : "current-password"}
                      id="ai-account-password"
                      minLength={8}
                      onChange={(event) => setPassword(event.target.value)}
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
                  <button className="button button-primary" disabled={authBusy} type="submit">
                    {authBusy ? <LoaderCircle className="spin" size={16} /> : authMode === "register" ? <UserPlus size={16} /> : <LogIn size={16} />}
                    {authBusy ? "请稍候" : authMode === "register" ? "注册免费账号" : "登录"}
                  </button>
                </form>
                {authNotice && <p className="ai-auth-notice" role="status">{authNotice}</p>}
              </div>
            ) : (
              <div className="ai-auth-session">
                <div><small>当前免费账号</small><strong>{session.user.email}</strong></div>
                <button
                  aria-label="退出登录"
                  onClick={() => void accountClient?.auth.signOut()}
                  title="退出登录"
                  type="button"
                >
                  <LogOut size={17} />
                </button>
              </div>
            )}
            {authReady && session && (
              <>
                <p>
                  开始后，浏览器会生成一张去除照片元数据的压缩副本，并发送给第三方 AI 服务完成本次分析和联网推荐。副本不会写入 MAKE UP 数据库。
                </p>
                <label className="consent-field ai-consent-field">
                  <input
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                    type="checkbox"
                  />
                  <span>我已了解并同意上述照片处理方式。</span>
                </label>
                <p className="consent-policy-link">
                  详细说明见<a href="#privacy" rel="noreferrer" target="_blank">隐私说明</a>。
                </p>
                {hasTurnstileConfig ? (
                  <Turnstile
                    ref={turnstileRef}
                    className="turnstile-widget"
                    siteKey={turnstileSiteKey}
                    onSuccess={setTurnstileToken}
                    onExpire={() => setTurnstileToken("")}
                    onError={() => {
                      setTurnstileToken("");
                      setError("安全验证加载失败，请刷新后重试。");
                    }}
                    options={{
                      action: "ai_creator_discovery",
                      language: "zh-cn",
                      size: "compact",
                      theme: "light",
                    }}
                  />
                ) : (
                  <div className="notice notice-warning compact">
                    <AlertCircle size={16} />
                    <p>AI 推荐正在进行安全配置，暂时无法使用。</p>
                  </div>
                )}
                {error && (
                  <div className="notice notice-error compact" role="alert">
                    <AlertCircle size={16} />
                    <p>{error}</p>
                  </div>
                )}
                <button
                  className="button button-primary ai-discovery-submit"
                  disabled={loading || !consent || !hasSupabaseConfig || !hasTurnstileConfig || !turnstileToken}
                  onClick={() => void handleDiscover()}
                  type="button"
                >
                  {loading ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
                  {loading ? "AI 正在查找" : "开始 AI 推荐"}
                </button>
              </>
            )}
            {!session && error && (
              <div className="notice notice-error compact" role="alert">
                <AlertCircle size={16} />
                <p>{error}</p>
              </div>
            )}
          </div>
        )
      )}
    </section>
  );
}
