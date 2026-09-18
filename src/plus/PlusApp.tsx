import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { AuthError, Session } from "@supabase/supabase-js";
import {
  AlertCircle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  ImagePlus,
  KeyRound,
  LoaderCircle,
  LogIn,
  LogOut,
  Palette,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { ProductHeader } from "../components/ProductHeader";
import { extractFaceAnalysis } from "../domain/faceFeatures";
import { FEATURE_LABELS } from "../domain/featureLabels";
import { assessPhotoQuality } from "../domain/quality";
import { MALE_REPORT_STYLES } from "../domain/maleReportStyles";
import {
  buildLocalAnalysisRecord,
  claimPendingMemberData,
  deletePendingMemberData,
  deleteLocalMemberProfile,
  hasPendingMemberData,
  loadLocalMemberProfile,
  saveLatestLocalAnalysis,
  saveLocalPlusMakeupReport,
  type LocalPlusMakeupReport,
  type LocalMemberProfile,
} from "../services/localMemberProfile";
import { analysisComponentErrorMessage } from "../services/browserCompatibility";
import { detectFace } from "../services/faceLandmarker";
import { loadImageBlob } from "../services/imageFile";
import { measureAverageLuminance } from "../services/imageQuality";
import type {
  PlusMakeupDirection,
  PlusMakeupReport,
  PlusMakeupScene,
} from "../services/plusMakeupReport";
import {
  PLUS_MAKEUP_DIRECTIONS,
  PLUS_MAKEUP_SCENES,
} from "../../supabase/functions/_shared/plusMakeupReport";
import {
  getPlusMembership,
  getPlusSession,
  isActivePlusMembership,
  registerPlusAccount,
  redeemPlusInvite,
  signInPlusAccount,
  type PlusMembership,
} from "./plusAccess";
import { plusClient } from "./plusClient";
import { PlusMakeupReportGenerator } from "./PlusMakeupReportGenerator";
import { PaymentCheckout } from "../components/PaymentCheckout";
import { FacePreview } from "../components/FacePreview";
import { getCommercialPaymentStatus, getCommercialSubscriptionStatus, type CommercialSubscriptionStatus } from "../services/paymentStatus";
import { recordProductEvent } from "../services/productMetrics";
import { getRewardStatus } from "../services/rewards";
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
  return MALE_REPORT_STYLES.find((style) => style.value === value)?.label ?? "默认文风";
}

function plusMakeupConfiguration(report: LocalPlusMakeupReport): string {
  const scenes: string[] = report.scenes.map((value) =>
    PLUS_MAKEUP_SCENES.find((scene) => scene.value === value)?.label ?? value
  );
  if (report.customScene) scenes.push(report.customScene);
  const direction = report.direction === "auto"
    ? "帮我选择"
    : PLUS_MAKEUP_DIRECTIONS.find(
      (option) => option.value === report.direction,
    )?.label ?? report.direction;
  return `${scenes.join("、")} · ${direction}`;
}

function subscriptionPlanLabel(planCode: string): string {
  if (planCode === "pro_monthly") return "MAKE UP Pro 月卡";
  if (planCode === "pro_annual") return "MAKE UP Pro 年卡";
  return "MAKE UP Pro";
}

function MakeupReportContent({ savedReport }: { savedReport: LocalPlusMakeupReport }) {
  return (
    <div className="plus-member-report-body plus-saved-makeup-report">
      <section>
        <h4>面容结构报告</h4>
        <p>{savedReport.report.faceProfile.summary}</p>
        <ul>{savedReport.report.faceProfile.focusAreas.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      {savedReport.report.plans.map((plan, index) => (
        <article key={plan.name}>
          <small>方案 {index + 1}</small>
          <h4>{plan.name}</h4>
          <p>{plan.sceneFit} {plan.effect}</p>
          <ol>{plan.steps.map((step) => <li key={`${step.area}-${step.instruction}`}><strong>{step.area}</strong>{step.instruction}</li>)}</ol>
          <p><strong>建议准备：</strong>{plan.products.join("、")}</p>
          <p><strong>尽量避免：</strong>{plan.avoid.join("、")}</p>
        </article>
      ))}
      <section>
        <h4>公开博主名字</h4>
        <p>{savedReport.report.creatorNames.join("、")}</p>
        <small>AI 联网发现的公开线索，主页归属、合作关系和照片授权尚未核验。</small>
      </section>
      <p className="plus-member-report-closing">{savedReport.report.disclaimer}</p>
    </div>
  );
}

function SavedReports({
  loading,
  profile,
}: {
  loading: boolean;
  profile?: LocalMemberProfile;
}) {
  if (loading) {
    return <div className="plus-member-empty"><LoaderCircle className="spin" size={24} /><p>正在读取报告…</p></div>;
  }
  if (!profile?.reports.length) {
    return (
      <div className="plus-member-empty">
        <FileText size={26} />
        <div><h3>还没有报告</h3><p>生成成功后，报告会保存在这台设备。</p></div>
      </div>
    );
  }

  return (
    <div className="plus-member-reports">
      {profile.reports.map((savedReport) => savedReport.kind === "plus_makeup" ? (
        <details key={savedReport.id}>
          <summary>
            <Palette size={19} />
            <span><strong>{savedReport.report.title}</strong><small>{formatDateTime(savedReport.createdAt)} · {plusMakeupConfiguration(savedReport)}</small></span>
          </summary>
          <MakeupReportContent savedReport={savedReport} />
        </details>
      ) : (
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
  );
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "status" in error) {
    const authError = error as AuthError;
    if (authError.code === "invalid_credentials") return "邮箱或密码不正确。";
    if (authError.code === "user_already_exists" || authError.code === "email_exists") {
      return "这个邮箱已经注册，请切换到登录。";
    }
    if (authError.code === "weak_password") return "密码强度不足，请至少输入 8 位。";
    if (authError.code === "signup_disabled") return "账号注册暂未开放。";
    if (authError.code === "email_not_confirmed") return "当前账号仍要求邮箱确认，请联系运营者。";
    if (authError.status === 429 || authError.code === "over_request_rate_limit") {
      return "尝试次数过多，请稍后再试。";
    }
  }
  return error instanceof Error ? error.message : "请求失败，请稍后重试。";
}

interface ReportPhoto {
  blob: Blob;
  fileName: string;
  image: HTMLImageElement;
  objectUrl: string;
}

type ReportPhotoStatus = "idle" | "loading" | "ready" | "error";

function accountReturnPath(): string {
  const returnTo = new URLSearchParams(window.location.search).get("returnTo");
  return returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/report";
}

export default function PlusApp() {
  const isAccountPage = window.location.pathname === "/account" || window.location.pathname.startsWith("/account/");
  const isSubscriptionPage = window.location.pathname === "/subscription" || window.location.pathname.startsWith("/subscription/");
  const subscriptionPreview = import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("preview") === "member";
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [session, setSession] = useState<Session | null>(null);
  const [membership, setMembership] = useState<PlusMembership | null>(null);
  const [points, setPoints] = useState(0);
  const [subscription, setSubscription] = useState<CommercialSubscriptionStatus | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loadingMembership, setLoadingMembership] = useState(false);
  const [localProfile, setLocalProfile] = useState<LocalMemberProfile>();
  const [localProfileLoading, setLocalProfileLoading] = useState(false);
  const [localProfileError, setLocalProfileError] = useState("");
  const [pendingDataAvailable, setPendingDataAvailable] = useState(false);
  const [localPhotoUrl, setLocalPhotoUrl] = useState("");
  const [reportPhoto, setReportPhoto] = useState<ReportPhoto>();
  const [reportLandmarks, setReportLandmarks] = useState<NormalizedLandmark[]>();
  const [reportAnalysis, setReportAnalysis] = useState<LocalMemberProfile["analysis"]>();
  const [reportPhotoStatus, setReportPhotoStatus] = useState<ReportPhotoStatus>("idle");
  const [reportPhotoError, setReportPhotoError] = useState("");
  const [latestGeneratedReport, setLatestGeneratedReport] = useState<LocalPlusMakeupReport>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const latestReportRef = useRef<HTMLElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const authenticatingRef = useRef(false);
  const membershipViewedRef = useRef(false);
  const activeMembership = isActivePlusMembership(membership);
  const activeSubscription = subscription?.status === "active";

  const loadMembership = useCallback(async () => {
    setLoadingMembership(true);
    setError("");
    try {
      const [nextMembership, rewards, nextSubscription] = await Promise.all([
        getPlusMembership(),
        getRewardStatus(),
        getCommercialSubscriptionStatus().catch(() => null),
      ]);
      setMembership(nextMembership);
      setPoints(rewards.points);
      setSubscription(nextSubscription);
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
    const params = new URLSearchParams(window.location.search);
    const zpayOrderId = params.get("out_trade_no");
    const paymentState = params.get("payment") ?? (zpayOrderId ? "success" : null);
    const orderId = params.get("order");
    const lookup = orderId ?? (zpayOrderId ? { provider: "zpay" as const, providerOrderId: zpayOrderId } : null);
    if (!paymentState || !lookup || !session) return;
    let active = true;
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const order = await getCommercialPaymentStatus(lookup);
        if (!active) return;
        if (order.status === "paid") {
          setNotice(`支付已确认，${order.points} 积分已经到账。`);
          await loadMembership();
          window.history.replaceState({}, "", "/report");
          return;
        }
        if (["failed", "cancelled", "refunded"].includes(order.status) || attempts >= 6) {
          setNotice(order.status === "pending" ? "支付已提交，权益确认可能需要一点时间，请稍后刷新。" : "支付尚未完成，当前没有发放权益。");
          window.history.replaceState({}, "", "/report");
          return;
        }
      } catch (nextError) {
        if (active && attempts >= 2) setError(errorMessage(nextError));
      }
      if (active && attempts < 6) window.setTimeout(() => void poll(), 2000);
    };
    void poll();
    return () => { active = false; };
  }, [loadMembership, session]);

  useEffect(() => {
    if (!session) {
      setMembership(null);
    } else if (!authenticatingRef.current) {
      void loadMembership();
    }
  }, [loadMembership, session]);

  useEffect(() => {
    if (!session) {
      setLocalProfile(undefined);
      setLocalProfileError("");
      setPendingDataAvailable(false);
      return;
    }

    let mounted = true;
    setLocalProfileLoading(true);
    setLocalProfileError("");
    Promise.all([
      loadLocalMemberProfile(session.user.id),
      hasPendingMemberData(),
    ])
      .then(([profile, hasPending]) => {
        if (mounted) {
          setLocalProfile(profile);
          setPendingDataAvailable(hasPending);
        }
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
  }, [session]);

  useEffect(() => {
    if (!localProfile?.analysis) {
      setLocalPhotoUrl("");
      return;
    }
    const nextPhotoUrl = URL.createObjectURL(localProfile.analysis.photo);
    setLocalPhotoUrl(nextPhotoUrl);
    return () => URL.revokeObjectURL(nextPhotoUrl);
  }, [localProfile?.analysis]);

  useEffect(() => {
    return () => {
      if (reportPhoto) URL.revokeObjectURL(reportPhoto.objectUrl);
    };
  }, [reportPhoto]);

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    authenticatingRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (authMode === "register") {
        const nextSession = await registerPlusAccount(email.trim(), password);
        if (!nextSession) {
          setNotice("确认邮件已发送。请在邮箱中完成确认，再返回登录即可生成报告。");
          setAuthMode("login");
          setPassword("");
          return;
        }
        window.location.assign(accountReturnPath());
        return;
      } else {
        await signInPlusAccount(email.trim(), password);
        window.location.assign(accountReturnPath());
        return;
      }
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
      void recordProductEvent("plus_invite_redeemed");
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
    setNotice("");
  }

  async function importPendingData() {
    if (!session) return;
    setLocalProfileLoading(true);
    setLocalProfileError("");
    try {
      await claimPendingMemberData(session.user.id);
      setLocalProfile(await loadLocalMemberProfile(session.user.id));
      setPendingDataAvailable(false);
    } catch (profileError) {
      console.error(profileError);
      setLocalProfileError("访客资料导入失败，请稍后重试。");
    } finally {
      setLocalProfileLoading(false);
    }
  }

  async function discardPendingData() {
    if (!window.confirm("确定删除这台设备上未归属账号的访客照片、面部数据和报告吗？")) return;
    setLocalProfileLoading(true);
    setLocalProfileError("");
    try {
      await deletePendingMemberData();
      setPendingDataAvailable(false);
    } catch (profileError) {
      console.error(profileError);
      setLocalProfileError("访客资料删除失败，请稍后重试。");
    } finally {
      setLocalProfileLoading(false);
    }
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
      setReportPhoto(undefined);
      setReportLandmarks(undefined);
      setReportAnalysis(undefined);
      setReportPhotoStatus("idle");
    } catch (profileError) {
      console.error(profileError);
      setLocalProfileError("本机档案清除失败，请稍后重试。");
    } finally {
      setLocalProfileLoading(false);
    }
  }

  async function handlePlusMakeupGenerated(value: {
    createdAt: string;
    customScene: string;
    direction: PlusMakeupDirection;
    id: string;
    remainingPoints: number;
    report: PlusMakeupReport;
    scenes: PlusMakeupScene[];
  }) {
    if (!session) return;
    const savedReport = await saveLocalPlusMakeupReport({
      createdAt: value.createdAt,
      customScene: value.customScene,
      direction: value.direction,
      id: value.id,
      report: value.report,
      scenes: value.scenes,
    }, session.user.id);
    setLatestGeneratedReport(savedReport);
    setLocalProfile((current) => ({
      analysis: current?.analysis,
      reports: [
        savedReport,
        ...(current?.reports ?? []).filter((report) => report.id !== savedReport.id),
      ],
    }));
    setPoints(value.remainingPoints);
    window.requestAnimationFrame(() => latestReportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function handleReportPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setReportPhoto(undefined);
    setReportLandmarks(undefined);
    setReportAnalysis(undefined);
    setReportPhotoError("");
    setReportPhotoStatus("loading");

    try {
      const loaded = await loadImageBlob(file);
      const nextPhoto: ReportPhoto = {
        blob: file,
        fileName: file.name,
        image: loaded.image,
        objectUrl: loaded.objectUrl,
      };
      setReportPhoto(nextPhoto);

      const detection = await detectFace(loaded.image);
      const faceCount = detection.faceLandmarks.length;
      const landmarks = faceCount === 1 ? detection.faceLandmarks[0] : undefined;
      const luminance = measureAverageLuminance(loaded.image, landmarks);
      const analysis = landmarks
        ? extractFaceAnalysis(landmarks, {
            height: loaded.image.naturalHeight,
            width: loaded.image.naturalWidth,
          })
        : undefined;
      const issues = assessPhotoQuality({
        averageLuminance: luminance,
        faceCount,
        pose: analysis?.pose,
      });

      if (!analysis || issues.length > 0) {
        setReportLandmarks(landmarks);
        setReportPhotoError(issues.map((issue) => issue.message).join(" ") || "这张照片暂时无法分析，请换一张清晰正脸照。");
        setReportPhotoStatus("error");
        return;
      }

      const savedAt = new Date().toISOString();
      const input = {
        analysis,
        fileName: file.name,
        luminance,
        photo: file,
        referenceAudience: "women" as const,
        savedAt,
      };
      await saveLatestLocalAnalysis(input, session?.user.id);
      const record = buildLocalAnalysisRecord(input, session?.user.id);
      setReportLandmarks(landmarks);
      setReportAnalysis(record);
      setReportPhotoStatus("ready");
      if (session) {
        setLocalProfile((current) => ({
          analysis: record,
          reports: current?.reports ?? [],
        }));
      }
    } catch (photoError) {
      console.error(photoError);
      setReportPhotoError(
        photoError instanceof Error && photoError.message.includes("照片无法读取")
          ? photoError.message
          : analysisComponentErrorMessage(window.navigator.userAgent),
      );
      setReportPhotoStatus("error");
    }
  }

  function openPersonalCenter() {
    window.location.assign("/account?returnTo=/report#my-reports");
  }

  function openLatestReport() {
    latestReportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function signOutAccount() {
    void plusClient.auth.signOut();
  }

  const activeAnalysis = reportPhoto ? reportAnalysis : localProfile?.analysis;
  const activePhotoUrl = reportPhoto?.objectUrl ?? localPhotoUrl;
  const activePhotoName = reportPhoto?.fileName ?? localProfile?.analysis?.fileName;
  const photoIsReady = Boolean(activeAnalysis?.referenceAudience === "women");

  useEffect(() => {
    if (!isSubscriptionPage || membershipViewedRef.current) return;
    membershipViewedRef.current = true;
    void recordProductEvent("points_page_viewed");
    void recordProductEvent("membership_page_viewed");
  }, [isSubscriptionPage]);

  if (isAccountPage) {
    return (
      <div className="plus-account-shell">
        <ProductHeader current="account" />
        <main className="plus-account-main account-page-main">
          <section className="account-page-heading">
            <p className="eyebrow">ACCOUNT / 个人中心</p>
            <h1>{session ? "个人中心" : "登录 MAKE UP"}</h1>
            <p>{session ? "管理账号、积分和保存在这台设备上的报告。" : "登录后查看积分与已生成报告；新账号完成邮箱确认即可使用。"}</p>
          </section>

          {!authReady ? (
            <section className="plus-member-loading" aria-live="polite">
              <LoaderCircle className="spin" size={28} />
              <p>正在确认登录状态…</p>
            </section>
          ) : session ? (
            <>
              <section className="account-status-panel" aria-label="当前账号">
                <div>
                  <span>当前账号</span>
                  <strong>{session.user.email}</strong>
                </div>
                <div>
                  <span>可用积分</span>
                  <strong>{loadingMembership ? "读取中" : points}</strong>
                </div>
                <div className="account-status-actions">
                  <a className="button button-primary" href="/report#report-create">生成报告<ArrowRight size={17} /></a>
                  <button className="button button-secondary" disabled={localProfileLoading} onClick={() => void clearLocalProfile()} type="button">
                    <Trash2 size={17} />清除本机档案
                  </button>
                  <button className="button button-secondary" onClick={signOutAccount} type="button">
                    <LogOut size={17} />退出登录
                  </button>
                </div>
                {!activeMembership && (
                  <details className="plus-legacy-invite">
                    <summary>旧 Plus 权益兑换</summary>
                    <form className="plus-access-form" onSubmit={handleRedeem}>
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
                      <button className="button button-secondary" disabled={busy} type="submit">
                        {busy ? <LoaderCircle className="spin" size={17} /> : <KeyRound size={17} />}
                        兑换旧 Plus 权益
                      </button>
                    </form>
                  </details>
                )}
                {localProfileError && <p className="plus-access-error" role="alert">{localProfileError}</p>}
              </section>

              <section className="account-reports-section" id="my-reports" aria-labelledby="my-reports-title">
                <div className="account-reports-heading">
                  <div><p className="eyebrow">REPORTS / 本机报告</p><h2 id="my-reports-title">我的报告</h2></div>
                  <strong>{localProfile?.reports.length ?? 0} 份</strong>
                </div>
                <SavedReports loading={localProfileLoading} profile={localProfile} />
              </section>
            </>
          ) : (
            <section className="report-auth account-auth-panel" aria-label="登录或注册">
              <div className="plus-auth-tabs" aria-label="账号方式" role="tablist">
                <button aria-selected={authMode === "login"} onClick={() => switchAuthMode("login")} role="tab" type="button">登录</button>
                <button aria-selected={authMode === "register"} onClick={() => switchAuthMode("register")} role="tab" type="button">注册账号</button>
              </div>
              <form className="plus-access-form" onSubmit={handleAuthSubmit}>
                <label htmlFor="plus-email">邮箱</label>
                <input autoComplete="email" id="plus-email" onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required type="email" value={email} />
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
                  <button aria-label={showPassword ? "隐藏密码" : "显示密码"} onClick={() => setShowPassword((current) => !current)} title={showPassword ? "隐藏密码" : "显示密码"} type="button">
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                <button className="button button-primary" disabled={busy} type="submit">
                  {busy ? <LoaderCircle className="spin" size={17} /> : authMode === "register" ? <KeyRound size={17} /> : <LogIn size={17} />}
                  {authMode === "register" ? "发送确认邮件" : "登录"}
                </button>
              </form>
              {notice && <p className="plus-access-notice" role="status">{notice}</p>}
              {error && <p className="plus-access-error" role="alert">{error}</p>}
            </section>
          )}
        </main>
      </div>
    );
  }

  if (isSubscriptionPage) {
    const hasSubscriptionViewer = Boolean(session) || subscriptionPreview;
    return (
      <div className="plus-account-shell">
        <ProductHeader current="subscription" />
        <main className="plus-account-main subscription-page-main">
          <section className="account-page-heading">
            <p className="eyebrow">MEMBERSHIP / 订阅方案</p>
            <h1>MAKE UP Pro</h1>
            <p>按需要购买单次报告、月卡或年卡。积分永久有效，普通匹配权益随会员有效期生效。</p>
          </section>

          <section className="subscription-status-section" aria-labelledby="subscription-status-title">
            <div className="subscription-section-heading">
              <div><p className="eyebrow">YOUR PLAN / 当前状态</p><h2 id="subscription-status-title">{hasSubscriptionViewer ? activeSubscription ? "MAKE UP Pro 已开通" : "尚未订阅" : "登录后查看订阅状态"}</h2></div>
              {subscriptionPreview ? <strong>本地临时预览</strong> : session && <strong>{loadingMembership ? "读取中" : `${points} 积分`}</strong>}
            </div>
            {hasSubscriptionViewer ? (
              <div className="report-membership-summary">
                <div><span>当前订阅</span><strong>{activeSubscription && subscription?.currentPeriodEnd ? `${subscriptionPlanLabel(subscription.planCode)} · 至 ${formatDate(subscription.currentPeriodEnd)}` : "尚未订阅"}</strong></div>
                <div><span>可用积分</span><strong>{subscriptionPreview ? "0 积分" : loadingMembership ? "读取中" : `${points} 积分`}</strong></div>
                <div><span>续费方式</span><strong>{activeSubscription && subscription ? subscription.cancelAtPeriodEnd ? "本期结束后停止" : subscription.provider === "stripe" ? "Stripe 自动续费" : "支付宝手动续费" : "订阅后显示"}</strong></div>
                <div><span>旧 Plus 权益</span><strong>{activeMembership && membership ? `普通匹配至 ${formatDate(membership.benefitExpiresAt)}` : "无"}</strong></div>
              </div>
            ) : authReady ? (
              <div className="subscription-login-panel">
                <p>支付前需要先登录。购买成功后的积分只发放到当前登录账号。</p>
                <a className="button button-primary" href="/account?returnTo=/subscription">登录后订阅</a>
              </div>
            ) : (
              <p className="report-session-status" role="status">正在确认账号状态…</p>
            )}
          </section>

          <section className="subscription-plan-section" aria-labelledby="subscription-plan-title">
            <div className="subscription-plan-intro">
              <div>
                <p className="eyebrow">CHOOSE / 购买方案</p>
                <h2 id="subscription-plan-title">从一份报告到全年不限匹配</h2>
                <p>报告每份 100 积分。月卡每天刷新 50 次普通匹配；年卡有效期内普通匹配不限次数，积分按月发放。</p>
              </div>
            </div>
            <div className="subscription-plan-summary">
              <div><span>单次报告</span><strong>¥19.9 / US$2.99 · 100 积分</strong></div>
              <div><span>月卡</span><strong>1000 积分 / 月 · 每天 50 次匹配</strong></div>
              <div><span>年卡</span><strong>每月 2000 积分 · 普通匹配不限次</strong></div>
            </div>

            {hasSubscriptionViewer && <PaymentCheckout preview={subscriptionPreview} />}
            {notice && <p className="plus-access-notice" role="status">{notice}</p>}
            {error && <p className="plus-access-error" role="alert">{error}</p>}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="plus-account-shell">
      <ProductHeader current="report" />

      <main className="plus-account-main report-page-main">
        <section className="report-create-stage" id="report-create" aria-labelledby="report-page-title">
          <header className="report-create-heading">
            <div>
              <p className="eyebrow">REPORT / 妆容报告</p>
              <h1 id="report-page-title">生成你的美妆报告</h1>
              <p>准备照片和使用场景，生成面容结构说明、3 套妆造方案和公开美妆博主线索。</p>
            </div>
            <div className="report-heading-tools">
              <p className="report-points-summary"><strong>{session ? points : "100"}</strong><span>{session ? "可用积分" : "积分 / 次"}</span></p>
              <a href="/account?returnTo=/report#my-reports">历史报告</a>
            </div>
          </header>

          {session && pendingDataAvailable && (
            <section className="plus-pending-import" aria-labelledby="pending-import-title">
              <div>
                <ShieldCheck size={20} />
                <div>
                  <h2 id="pending-import-title">这台设备有一份访客资料</h2>
                  <p>导入后，当前账号才能继续使用其中的照片、面部数据和报告。</p>
                </div>
              </div>
              <div>
                <button className="button button-primary" disabled={localProfileLoading} onClick={() => void importPendingData()} type="button">
                  <ArrowRight size={17} />导入当前账号
                </button>
                <button className="button button-secondary" disabled={localProfileLoading} onClick={() => void discardPendingData()} type="button">
                  <Trash2 size={17} />删除访客资料
                </button>
              </div>
            </section>
          )}

          <div className="report-create-grid">
            <section className="report-photo-step" aria-labelledby="report-photo-title">
              <div className="report-step-heading">
                <span>01</span>
                <div><h2 id="report-photo-title">上传正脸照片</h2><p>选好后会自动在当前浏览器分析。</p></div>
              </div>

              <input ref={fileInputRef} aria-label="从相册选择照片" className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void handleReportPhoto(event)} />
              <input ref={cameraInputRef} aria-label="拍摄正脸照片" className="visually-hidden" type="file" accept="image/*" capture="user" onChange={(event) => void handleReportPhoto(event)} />

              {activePhotoUrl ? (
                <div className="report-photo-preview">
                  {reportPhoto ? (
                    <FacePreview image={reportPhoto.image} landmarks={reportLandmarks} />
                  ) : (
                    <img alt="本次报告使用的照片" src={activePhotoUrl} />
                  )}
                  <div className="report-photo-meta">
                    <span>{activePhotoName}</span>
                    {reportPhotoStatus === "loading" ? (
                      <strong><LoaderCircle className="spin" size={15} />正在本机分析</strong>
                    ) : photoIsReady ? (
                      <strong><CheckCircle2 size={15} />分析完成</strong>
                    ) : (
                      <strong><AlertCircle size={15} />需要更换照片</strong>
                    )}
                  </div>
                </div>
              ) : (
                <button className="report-photo-empty" onClick={() => fileInputRef.current?.click()} type="button">
                  <span><ImagePlus size={28} /></span>
                  <strong>{localProfileLoading ? "正在读取本机照片" : "选择一张照片"}</strong>
                  <small>正面、无遮挡、光线均匀</small>
                </button>
              )}

              <div className="report-photo-actions">
                <button className="button button-primary" disabled={reportPhotoStatus === "loading"} onClick={() => fileInputRef.current?.click()} type="button">
                  <ImagePlus size={17} />{activePhotoUrl ? "更换照片" : "选择照片"}
                </button>
                <button className="button button-secondary" disabled={reportPhotoStatus === "loading"} onClick={() => cameraInputRef.current?.click()} type="button">
                  <Camera size={17} />拍照
                </button>
              </div>

              <p className="report-photo-privacy"><ShieldCheck size={16} />照片只在当前浏览器分析，不会上传。</p>
              {reportPhotoError && <p className="report-photo-error" role="alert">{reportPhotoError}</p>}
              {activeAnalysis && (
                <details className="report-ratios">
                  <summary>查看本机分析数据</summary>
                  <div className="plus-member-features">
                    <dl>
                      {Object.entries(activeAnalysis.analysis.features).map(([key, value]) => (
                        <div key={key}>
                          <dt>{FEATURE_LABELS[key as keyof typeof FEATURE_LABELS]}</dt>
                          <dd>{value.toFixed(3)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </details>
              )}
            </section>

            <PlusMakeupReportGenerator
              faceFeatures={photoIsReady ? activeAnalysis?.analysis.features : undefined}
              isAuthenticated={Boolean(session)}
              loginHref="/account?returnTo=/report#report-create"
              onPointsChanged={setPoints}
              onGenerated={handlePlusMakeupGenerated}
              onViewReports={openLatestReport}
              photoStatus={reportPhotoStatus === "loading" ? "loading" : photoIsReady ? "ready" : "missing"}
              remainingPoints={points}
            />
          </div>
        </section>

        {latestGeneratedReport && (
          <section className="report-latest-result" id="latest-report" ref={latestReportRef} aria-labelledby="latest-report-title">
            <header>
              <div>
                <p className="eyebrow">RESULT / 本次报告</p>
                <h2 id="latest-report-title">{latestGeneratedReport.report.title}</h2>
                <p>{formatDateTime(latestGeneratedReport.createdAt)} · {plusMakeupConfiguration(latestGeneratedReport)}</p>
              </div>
              <div className="report-result-actions">
                <a className="button button-secondary" href="#report-create">修改后重新生成</a>
                <button className="button button-secondary" onClick={openPersonalCenter} type="button">查看历史报告</button>
              </div>
            </header>
            <MakeupReportContent savedReport={latestGeneratedReport} />
          </section>
        )}

        <div className="report-workspace">
          {!authReady && <p className="report-session-status" role="status">正在确认账号状态…</p>}
          {notice && <p className="plus-access-notice" role="status">{notice}</p>}
          {error && <p className="plus-access-error" role="alert">{error}</p>}
          {localProfileError && <p className="plus-access-error" role="alert">{localProfileError}</p>}
        </div>
      </main>
    </div>
  );
}
