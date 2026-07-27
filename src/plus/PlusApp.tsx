import type { AuthError, Session } from "@supabase/supabase-js";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  LoaderCircle,
  LogIn,
  LogOut,
  MessageCircle,
  ScanFace,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { contactWechatQrUrl } from "../config";
import { FEATURE_LABELS } from "../domain/featureLabels";
import { MALE_REPORT_STYLES } from "../domain/maleReportStyles";
import {
  claimPendingMemberData,
  deleteLocalMemberProfile,
  loadLocalMemberProfile,
  type LocalMemberProfile,
} from "../services/localMemberProfile";
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

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function reportStyleLabel(value: string): string {
  return MALE_REPORT_STYLES.find((style) => style.value === value)?.label ?? "AI 评价人";
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
  const [membershipChecked, setMembershipChecked] = useState(false);
  const [localProfile, setLocalProfile] = useState<LocalMemberProfile>();
  const [localProfileLoading, setLocalProfileLoading] = useState(false);
  const [localProfileError, setLocalProfileError] = useState("");
  const [localPhotoUrl, setLocalPhotoUrl] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const authenticatingRef = useRef(false);
  const activeMembership = membership?.status === "active" &&
    new Date(membership.benefitExpiresAt).getTime() > Date.now();

  const loadMembership = useCallback(async () => {
    setLoadingMembership(true);
    setError("");
    try {
      setMembership(await getPlusMembership());
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setLoadingMembership(false);
      setMembershipChecked(true);
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
    if (!session) {
      setMembership(null);
      setMembershipChecked(false);
    } else if (!authenticatingRef.current) {
      void loadMembership();
    }
  }, [loadMembership, session]);

  useEffect(() => {
    if (!session || !activeMembership) {
      setLocalProfile(undefined);
      setLocalProfileError("");
      return;
    }

    let mounted = true;
    setLocalProfileLoading(true);
    setLocalProfileError("");
    claimPendingMemberData(session.user.id)
      .then(() => loadLocalMemberProfile(session.user.id))
      .then((profile) => {
        if (mounted) setLocalProfile(profile);
      })
      .catch((profileError) => {
        console.error(profileError);
        if (mounted) setLocalProfileError("本机档案暂时无法读取，请刷新后重试。");
      })
      .finally(() => {
        if (mounted) setLocalProfileLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [activeMembership, session]);

  useEffect(() => {
    if (!localProfile?.analysis) {
      setLocalPhotoUrl("");
      return;
    }
    const nextPhotoUrl = URL.createObjectURL(localProfile.analysis.photo);
    setLocalPhotoUrl(nextPhotoUrl);
    return () => URL.revokeObjectURL(nextPhotoUrl);
  }, [localProfile?.analysis]);

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
      setMembershipChecked(true);
      setPassword("");
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      authenticatingRef.current = false;
      setMembershipChecked(true);
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

  async function clearLocalProfile() {
    if (!session || !window.confirm("确定清除这台设备保存的照片、面部数据和报告吗？此操作无法撤销。")) {
      return;
    }
    setLocalProfileLoading(true);
    setLocalProfileError("");
    try {
      await deleteLocalMemberProfile(session.user.id);
      setLocalProfile({ reports: [] });
    } catch (profileError) {
      console.error(profileError);
      setLocalProfileError("本机档案清除失败，请稍后重试。");
    } finally {
      setLocalProfileLoading(false);
    }
  }

  const showMemberSurface = Boolean(
    session && (!membershipChecked || loadingMembership || activeMembership),
  );

  return (
    <div className="plus-account-shell">
      <header className="plus-account-topbar">
        <a
          aria-label={activeMembership ? "返回 Plus 会员页" : "返回 MAKE UP 首页"}
          className="plus-account-brand"
          href={activeMembership ? "/plus" : "/"}
        >
          <strong>MAKE UP</strong>
          <span>PLUS EARLY ACCESS</span>
        </a>
        <a className="plus-account-free-link" href="/#start">
          {activeMembership ? "继续分析" : "免费匹配"}
        </a>
      </header>

      <main className={`plus-account-main ${showMemberSurface ? "plus-member-main" : ""}`}>
        {showMemberSurface && session ? (
          !membershipChecked || loadingMembership || !membership ? (
            <section className="plus-member-loading" aria-live="polite">
              <LoaderCircle className="spin" size={28} />
              <p>正在载入会员中心…</p>
            </section>
          ) : (
            <>
              <section className="plus-member-heading" aria-labelledby="plus-member-title">
                <div>
                  <p className="eyebrow">MEMBER / 会员中心</p>
                  <h1 id="plus-member-title">你的 Plus 会员页</h1>
                  <p>{session.user.email}</p>
                </div>
                <div className="plus-member-status" aria-label={`剩余体验额度 ${membership.trialCredits} 次`}>
                  <span>剩余体验额度</span>
                  <strong>{membership.trialCredits}</strong>
                  <small>次</small>
                </div>
              </section>

              <section className="plus-member-summary" aria-label="会员权益与本地档案说明">
                <div>
                  <ShieldCheck size={20} />
                  <p><strong>只保存在这台设备</strong>照片、面部比例和报告不会上传到会员数据库，也不会跨设备同步。</p>
                </div>
                <dl>
                  <div><dt>会员状态</dt><dd>已激活</dd></div>
                  <div><dt>权益有效期</dt><dd>{formatDate(membership.benefitExpiresAt)}</dd></div>
                </dl>
              </section>

              <section className="plus-member-section" aria-labelledby="member-analysis-title">
                <div className="plus-member-section-heading">
                  <div>
                    <p className="eyebrow">ANALYSIS / 我的识别信息</p>
                    <h2 id="member-analysis-title">最近一次面部分析</h2>
                  </div>
                  <a className="button button-secondary" href="/#start">
                    <ScanFace size={17} />继续分析
                  </a>
                </div>

                {localProfileLoading ? (
                  <div className="plus-member-empty"><LoaderCircle className="spin" size={24} /><p>正在读取本机档案…</p></div>
                ) : localProfile?.analysis ? (
                  <div className="plus-member-analysis-layout">
                    <figure className="plus-member-photo">
                      {localPhotoUrl && <img alt="最近一次分析的照片" src={localPhotoUrl} />}
                      <figcaption>
                        <span>{localProfile.analysis.fileName}</span>
                        <small><CalendarDays size={14} />{formatDateTime(localProfile.analysis.savedAt)}</small>
                      </figcaption>
                    </figure>
                    <div className="plus-member-features">
                      <div className="plus-member-analysis-meta">
                        <span>{localProfile.analysis.referenceAudience === "women" ? "女生妆容参考" : "男生面部报告"}</span>
                        <small>环境亮度 {Math.round(localProfile.analysis.luminance)} / 255</small>
                      </div>
                      <dl>
                        {Object.entries(localProfile.analysis.analysis.features).map(([key, value]) => (
                          <div key={key}>
                            <dt>{FEATURE_LABELS[key as keyof typeof FEATURE_LABELS]}</dt>
                            <dd>{value.toFixed(3)}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </div>
                ) : (
                  <div className="plus-member-empty">
                    <ScanFace size={26} />
                    <div><h3>还没有本机分析档案</h3><p>上传并完成一次有效分析后，这里会显示照片和九项面部结构数据。</p></div>
                    <a className="button button-primary" href="/#start">开始分析<ArrowRight size={17} /></a>
                  </div>
                )}
              </section>

              <section className="plus-member-section" aria-labelledby="member-report-title">
                <div className="plus-member-section-heading">
                  <div>
                    <p className="eyebrow">REPORTS / 已生成内容</p>
                    <h2 id="member-report-title">我的报告</h2>
                  </div>
                  <span className="plus-member-count">{localProfile?.reports.length ?? 0} 份</span>
                </div>

                {localProfileLoading ? (
                  <div className="plus-member-empty"><LoaderCircle className="spin" size={24} /><p>正在读取报告…</p></div>
                ) : localProfile?.reports.length ? (
                  <div className="plus-member-reports">
                    {localProfile.reports.map((savedReport) => (
                      <details key={savedReport.id}>
                        <summary>
                          <FileText size={19} />
                          <span><strong>{savedReport.report.title}</strong><small>{formatDateTime(savedReport.createdAt)} · {savedReport.mode === "roast" ? "锐评" : "夸夸"} · {reportStyleLabel(savedReport.style)}</small></span>
                        </summary>
                        <div className="plus-member-report-body">
                          <p>{savedReport.report.summary}</p>
                          {savedReport.report.observations.map((observation) => (
                            <article key={observation.feature}>
                              <small>{observation.label}</small>
                              <p>{observation.fact}</p>
                              <blockquote>{observation.comment}</blockquote>
                            </article>
                          ))}
                          <p className="plus-member-report-closing">{savedReport.report.closing}</p>
                        </div>
                      </details>
                    ))}
                  </div>
                ) : (
                  <div className="plus-member-empty">
                    <FileText size={26} />
                    <div><h3>暂时没有已生成报告</h3><p>真实生成成功的 AI 报告会保存在这台设备，并显示在这里。</p></div>
                  </div>
                )}
              </section>

              {localProfileError && <p className="plus-access-error" role="alert">{localProfileError}</p>}

              <section className="plus-member-account" aria-labelledby="member-account-title">
                <div>
                  <p className="eyebrow">ACCOUNT / 账号</p>
                  <h2 id="member-account-title">会员与本机数据</h2>
                </div>
                <div className="plus-member-account-actions">
                  <button className="button button-secondary" disabled={localProfileLoading} onClick={() => void clearLocalProfile()} type="button">
                    <Trash2 size={17} />清除本机档案
                  </button>
                  <button className="button button-secondary" onClick={() => void plusClient.auth.signOut()} type="button">
                    <LogOut size={17} />退出登录
                  </button>
                </div>
              </section>
            </>
          )
        ) : (
          <>
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
          </>
        )}
      </main>
    </div>
  );
}
