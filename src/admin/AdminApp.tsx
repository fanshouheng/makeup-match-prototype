import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthError, Session } from "@supabase/supabase-js";
import {
  ArrowUpRight,
  BarChart3,
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  Database,
  Eye,
  ExternalLink,
  ImageOff,
  LoaderCircle,
  LogOut,
  MessageCircle,
  MousePointerClick,
  Plus,
  Power,
  RefreshCw,
  Share2,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { adminClient } from "./adminClient";
import { CREATOR_PLATFORM_LABELS } from "../domain/creator";
import { AdminCreateSubmissionDialog } from "./AdminCreateSubmissionDialog";
import { AdminOutreachPanel } from "./AdminOutreachPanel";
import {
  createAdminSubmission,
  getAdminSession,
  invokeAdmin,
  type AdminCreator,
  type AdminCreatorSubmissionInput,
  type AdminAiDiscoveryData,
  type AdminAiDiscoveryLog,
  type AdminListResponse,
  type AdminOutreachInput,
  type AdminProductMetrics,
  type AdminSubmission,
} from "./adminApi";
import "./admin.css";

type View = "pending" | "creators" | "outreach" | "metrics" | "ai";
type ConfirmAction =
  | { type: "verify" | "approve" | "reject" | "cleanup"; submission: AdminSubmission }
  | { type: "set_active" | "delete_creator"; creator: AdminCreator }
  | null;

const REFERENCE_AUDIENCE_LABELS = {
  women: "女生妆容",
  men: "男生形象参考",
} as const;
const CONTENT_TYPE_LABELS = {
  appearance: "形象参考",
  hair: "发型",
  makeup: "妆容",
} as const;

function formatContentTypes(contentTypes: AdminSubmission["content_types"]): string {
  return contentTypes.map((type) => CONTENT_TYPE_LABELS[type]).join("、");
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "请求失败，请稍后重试。";
}

function loginErrorMessage(error: AuthError): string {
  if (
    error.status === 429 ||
    error.code === "over_email_send_rate_limit" ||
    error.code === "over_request_rate_limit"
  ) {
    return "登录邮件发送过于频繁。管理员邮箱仍已授权，请使用最近一封邮件中的链接，或约 1 小时后再试。";
  }
  return "无法发送登录链接。请稍后重试；如果持续失败，请联系维护者检查邮件服务。";
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: signInError } = await adminClient.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/admin`,
      },
    });
    setBusy(false);
    if (signInError) {
      setError(loginErrorMessage(signInError));
      return;
    }
    setSent(true);
  }

  return (
    <main className="admin-auth-shell">
      <section className="admin-auth-panel" aria-labelledby="admin-login-title">
        <div className="admin-auth-brand" aria-label="LOOK AI 管理台">
          <span className="admin-wordmark">LOOK</span>
          <span className="admin-wordmark-product">MAKEUP REFERENCE<br />PRIVATE CONSOLE</span>
        </div>
        <p className="admin-kicker">ADMIN ACCESS</p>
        <h1 id="admin-login-title">进入管理台</h1>
        {sent ? (
          <div className="admin-auth-success" role="status">
            <CheckCircle2 size={20} />
            <div>
              <strong>登录链接已发送</strong>
              <p>请打开邮箱中的链接。链接只对已授权的管理员邮箱有效。</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="admin-auth-form">
            <label htmlFor="admin-email">管理员邮箱</label>
            <input
              id="admin-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
            />
            {error && <p className="admin-form-error" role="alert">{error}</p>}
            <button className="admin-primary-button" type="submit" disabled={busy}>
              {busy ? <LoaderCircle className="admin-spin" size={17} /> : <ArrowUpRight size={17} />}
              发送登录链接
            </button>
          </form>
        )}
        <p className="admin-auth-note">仅限受邀管理员。普通用户无需注册或登录。</p>
      </section>
    </main>
  );
}

function SubmissionPhoto({ submission }: { submission: AdminSubmission }) {
  if (!submission.reference_photo_url) {
    return <div className="admin-photo-placeholder"><ImageOff size={18} />暂无照片</div>;
  }
  return (
    <img
      className="admin-submission-photo"
      src={submission.reference_photo_url}
      alt={`${submission.name} 的申请照片`}
    />
  );
}

function PendingRow({
  submission,
  onAction,
}: {
  submission: AdminSubmission;
  onAction: (action: ConfirmAction) => void;
}) {
  const verified = Boolean(submission.ownership_verified_at);
  return (
    <article className="admin-review-row">
      <div className="admin-photo-frame"><SubmissionPhoto submission={submission} /></div>
      <div className="admin-review-main">
        <div className="admin-row-heading">
          <div>
            <p className="admin-row-eyebrow">待审核申请</p>
            <h2>{submission.name}</h2>
          </div>
          <span className={verified ? "admin-status admin-status-ok" : "admin-status admin-status-pending"}>
            {verified ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
            {verified ? "已核验" : "待核验"}
          </span>
        </div>
        <dl className="admin-meta-grid">
          <div><dt>提交时间</dt><dd>{formatDate(submission.submitted_at)}</dd></div>
          <div><dt>联系邮箱</dt><dd>{submission.contact_email}</dd></div>
          <div><dt>参考页面</dt><dd>{REFERENCE_AUDIENCE_LABELS[submission.reference_audience]}</dd></div>
          <div><dt>内容方向</dt><dd>{formatContentTypes(submission.content_types)}</dd></div>
          <div><dt>主平台</dt><dd>{CREATOR_PLATFORM_LABELS[submission.platform]}</dd></div>
          <div><dt>代表内容</dt><dd>{submission.tutorial_url ? "已提供" : "未提供"}</dd></div>
          <div><dt>公开主页</dt><dd><a href={submission.profile_url} target="_blank" rel="noreferrer">打开主页 <ExternalLink size={13} /></a></dd></div>
        </dl>
        {submission.review_note && <p className="admin-review-note">备注：{submission.review_note}</p>}
        <div className="admin-row-actions">
          <button className="admin-secondary-button" type="button" onClick={() => onAction({ type: "verify", submission })} disabled={verified}>
            <ShieldCheck size={16} />{verified ? "已完成归属核验" : "确认已核验归属"}
          </button>
          <button className="admin-primary-button" type="button" onClick={() => onAction({ type: "approve", submission })} disabled={!verified}>
            <Check size={16} />批准入库
          </button>
          <button className="admin-danger-button" type="button" onClick={() => onAction({ type: "reject", submission })}>
            <X size={16} />拒绝申请
          </button>
        </div>
      </div>
    </article>
  );
}

function CreatorRow({
  creator,
  onAction,
}: {
  creator: AdminCreator;
  onAction: (action: ConfirmAction) => void;
}) {
  return (
    <article className="admin-creator-row">
      {creator.reference_photo_url ? (
        <img className="admin-creator-photo" src={creator.reference_photo_url} alt={`${creator.name} 的公开参考照片`} />
      ) : (
        <div className="admin-photo-placeholder"><ImageOff size={18} /></div>
      )}
      <div className="admin-creator-main">
        <div className="admin-row-heading">
          <div><p className="admin-row-eyebrow">公开创作者</p><h2>{creator.name}</h2></div>
          <span className={creator.is_active ? "admin-status admin-status-ok" : "admin-status admin-status-muted"}>
            {creator.is_active ? "展示中" : "已下架"}
          </span>
        </div>
        <dl className="admin-meta-grid">
          <div><dt>加入时间</dt><dd>{formatDate(creator.created_at)}</dd></div>
          <div><dt>更新时间</dt><dd>{formatDate(creator.updated_at)}</dd></div>
          <div><dt>参考页面</dt><dd>{REFERENCE_AUDIENCE_LABELS[creator.reference_audience]}</dd></div>
          <div><dt>内容方向</dt><dd>{formatContentTypes(creator.content_types)}</dd></div>
          <div><dt>主平台</dt><dd>{CREATOR_PLATFORM_LABELS[creator.platform]}</dd></div>
          <div><dt>主页</dt><dd><a href={creator.profile_url} target="_blank" rel="noreferrer">打开主页 <ExternalLink size={13} /></a></dd></div>
          <div><dt>代表内容</dt><dd>{creator.tutorial_url ? <a href={creator.tutorial_url} target="_blank" rel="noreferrer">打开链接 <ExternalLink size={13} /></a> : "未设置"}</dd></div>
        </dl>
        <div className="admin-row-actions">
          <button className="admin-secondary-button" type="button" onClick={() => onAction({ type: "set_active", creator })}>
            <Power size={16} />{creator.is_active ? "下架" : "恢复展示"}
          </button>
          <button className="admin-danger-button" type="button" onClick={() => onAction({ type: "delete_creator", creator })}>
            <Trash2 size={16} />永久删除
          </button>
        </div>
      </div>
    </article>
  );
}

function formatRate(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return new Intl.NumberFormat("zh-CN", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(numerator / denominator);
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) return `${milliseconds} ms`;
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

const AI_ERROR_LABELS: Record<string, string> = {
  web_search_not_configured: "联网搜索未开通",
  provider_request_failed: "AI 服务请求失败",
  invalid_provider_response: "AI 返回格式异常",
  timeout: "AI 响应超时",
  unexpected_error: "未分类异常",
};

function aiModeLabel(log: AdminAiDiscoveryLog): string {
  if (log.reference_audience === "women") return "女生妆容";
  const filters = { all: "综合", hair: "发型", makeup: "妆容" } as const;
  return `男生·${filters[log.content_filter]}`;
}

function AiDiscoveryPanel({ data }: { data: AdminAiDiscoveryData }) {
  const averageDuration = data.recent.length === 0
    ? 0
    : Math.round(data.recent.reduce((total, log) => total + log.duration_ms, 0) / data.recent.length);
  return (
    <section className="admin-ai" aria-labelledby="admin-ai-title">
      <div className="admin-metrics-heading">
        <div>
          <p className="admin-kicker">LAST 7 DAYS</p>
          <h2 id="admin-ai-title">AI 调用</h2>
        </div>
        <p>只记录调用状态和性能数据，不保存照片、面部数据、AI 返回名字、排名或原始 IP。</p>
      </div>
      <div className="admin-metric-grid">
        <article className="admin-metric">
          <Sparkles size={19} />
          <span>调用总数</span>
          <strong>{data.total}</strong>
          <p>实际发送到 AI 服务的请求</p>
        </article>
        <article className="admin-metric">
          <CheckCircle2 size={19} />
          <span>成功率</span>
          <strong>{formatRate(data.succeeded, data.total)}</strong>
          <p>{data.succeeded} 次成功 · {data.failed} 次失败</p>
        </article>
        <article className="admin-metric">
          <Clock3 size={19} />
          <span>最近记录平均耗时</span>
          <strong>{averageDuration ? formatDuration(averageDuration) : "—"}</strong>
          <p>按下方最近 {data.recent.length} 条记录计算</p>
        </article>
        <article className="admin-metric">
          <X size={19} />
          <span>失败次数</span>
          <strong>{data.failed}</strong>
          <p>固定错误分类，不保存原始异常文本</p>
        </article>
      </div>
      <div className="admin-ai-heading">
        <div>
          <span>RECENT INVOCATIONS</span>
          <h3>最近调用记录</h3>
        </div>
        <p>最多显示最近 50 条</p>
      </div>
      {data.recent.length === 0 ? (
        <div className="admin-empty"><Sparkles size={28} /><h3>还没有 AI 调用记录</h3></div>
      ) : (
        <div className="admin-ai-table-wrap">
          <table className="admin-ai-table">
            <thead><tr><th>时间</th><th>状态</th><th>耗时</th><th>参考模式</th><th>结果</th></tr></thead>
            <tbody>
              {data.recent.map((log) => (
                <tr key={log.id}>
                  <td data-label="时间">{formatDate(log.created_at)}</td>
                  <td data-label="状态"><span className={log.status === "succeeded" ? "admin-status admin-status-ok" : "admin-status admin-status-error"}>{log.status === "succeeded" ? "成功" : "失败"}</span></td>
                  <td data-label="耗时">{formatDuration(log.duration_ms)}</td>
                  <td data-label="参考模式">{aiModeLabel(log)}</td>
                  <td data-label="结果">{log.error_code ? `${AI_ERROR_LABELS[log.error_code] ?? log.error_code}${log.provider_status ? ` · HTTP ${log.provider_status}` : ""}` : "正常返回"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="admin-metrics-note">记录窗口从 {formatDate(data.period_start)} 起；这里只统计真正发送到第三方 AI 服务的调用，安全验证失败、限流和无效图片不会计入。</p>
    </section>
  );
}

function MetricsPanel({ metrics }: { metrics: AdminProductMetrics }) {
  const feedbackTotal = metrics.feedback_yes + metrics.feedback_no;
  const failureReasons = [
    ["未检测到人脸", metrics.analysis_failures.no_face],
    ["检测到多张人脸", metrics.analysis_failures.multiple_faces],
    ["照片过暗", metrics.analysis_failures.too_dark],
    ["角度或画面问题", metrics.analysis_failures.pose_issue],
    ["分析组件异常", metrics.analysis_failures.component_error],
  ] as const;
  const classifiedFailures = failureReasons.reduce((total, [, count]) => total + count, 0);
  const unclassifiedFailures = Math.max(metrics.analysis_failed - classifiedFailures, 0);
  return (
    <section className="admin-metrics" aria-labelledby="admin-metrics-title">
      <div className="admin-metrics-heading">
        <div>
          <p className="admin-kicker">LAST 7 DAYS</p>
          <h2 id="admin-metrics-title">产品数据</h2>
        </div>
        <p>按匿名浏览器标签页会话去重，不代表可识别的真实用户人数。</p>
      </div>
      <div className="admin-metric-grid">
        <article className="admin-metric">
          <Eye size={19} />
          <span>有效访问</span>
          <strong>{metrics.landing_view}</strong>
          <p>进入公开产品的匿名会话</p>
        </article>
        <article className="admin-metric">
          <Camera size={19} />
          <span>选择照片率</span>
          <strong>{formatRate(metrics.photo_selected, metrics.landing_view)}</strong>
          <p>{metrics.photo_selected} 次选择 · {metrics.landing_view} 次访问</p>
        </article>
        <article className="admin-metric">
          <Sparkles size={19} />
          <span>女生模式选图会话</span>
          <strong>{metrics.women_photo_selected}</strong>
          <p>{formatRate(metrics.women_photo_selected, metrics.photo_selected)} 的选图会话使用过女生模式</p>
        </article>
        <article className="admin-metric">
          <UserRound size={19} />
          <span>男生模式选图会话</span>
          <strong>{metrics.men_photo_selected}</strong>
          <p>{formatRate(metrics.men_photo_selected, metrics.photo_selected)} 的选图会话使用过男生模式</p>
        </article>
        <article className="admin-metric">
          <CheckCircle2 size={19} />
          <span>分析完成率</span>
          <strong>{formatRate(metrics.analysis_succeeded, metrics.photo_selected)}</strong>
          <p>{metrics.analysis_succeeded} 次成功 · {metrics.analysis_failed} 次失败</p>
        </article>
        <article className="admin-metric">
          <BarChart3 size={19} />
          <span>结果到达率</span>
          <strong>{formatRate(metrics.match_result_view, metrics.analysis_succeeded)}</strong>
          <p>{metrics.match_result_view} 次结果展示</p>
        </article>
        <article className="admin-metric">
          <MessageCircle size={19} />
          <span>反馈率</span>
          <strong>{formatRate(feedbackTotal, metrics.match_result_view)}</strong>
          <p>{feedbackTotal} 次反馈 · {metrics.match_result_view} 次结果展示</p>
        </article>
        <article className="admin-metric">
          <ThumbsUp size={19} />
          <span>结果符合率</span>
          <strong>{formatRate(metrics.feedback_yes, feedbackTotal)}</strong>
          <p>{metrics.feedback_yes} 次符合 · {metrics.feedback_no} 次不符合</p>
        </article>
        <article className="admin-metric">
          <MousePointerClick size={19} />
          <span>博主点击率</span>
          <strong>{formatRate(metrics.creator_link_clicked, metrics.match_result_view)}</strong>
          <p>{metrics.creator_link_clicked} 次点击 · {metrics.match_result_view} 次结果展示</p>
        </article>
        <article className="admin-metric">
          <Share2 size={19} />
          <span>分享率</span>
          <strong>{formatRate(metrics.share_succeeded, metrics.match_result_view)}</strong>
          <p>{metrics.share_succeeded} 次分享 · {metrics.match_result_view} 次结果展示</p>
        </article>
      </div>
      <section className="admin-failure-breakdown" aria-labelledby="admin-failure-title">
        <div className="admin-failure-heading">
          <div>
            <span>ANALYSIS FAILURES</span>
            <h3 id="admin-failure-title">失败原因</h3>
          </div>
          <p>
            已分类 {classifiedFailures} 次
            {unclassifiedFailures > 0 ? ` · 旧版本未分类 ${unclassifiedFailures} 次` : ""}
          </p>
        </div>
        <div className="admin-failure-grid">
          {failureReasons.map(([label, count]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{count}</strong>
              <small>{formatRate(count, metrics.analysis_failed)}</small>
            </div>
          ))}
        </div>
      </section>
      <p className="admin-metrics-note">
        统计窗口从 {formatDate(metrics.period_start)} 起；同一会话重复触发同一动作只计一次，同时体验两种模式会分别计入两项。失败原因只记录固定分类，不含照片、面部或异常详情。
      </p>
    </section>
  );
}

function ConfirmDialog({
  action,
  busy,
  reviewNote,
  setReviewNote,
  confirmText,
  setConfirmText,
  onCancel,
  onConfirm,
}: {
  action: Exclude<ConfirmAction, null>;
  busy: boolean;
  reviewNote: string;
  setReviewNote: (value: string) => void;
  confirmText: string;
  setConfirmText: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isReject = action.type === "reject";
  const isDelete = action.type === "delete_creator";
  const isSetActive = action.type === "set_active";
  const creatorName = "creator" in action ? action.creator.name : "";
  const titles = { verify: "确认完成归属核验？", approve: "确认批准入库？", reject: "确认拒绝申请？", cleanup: "确认重试照片清理？", set_active: "确认修改展示状态？", delete_creator: "确认永久删除？" };
  const descriptions = {
    verify: "请确认你已经核验主页归属、本人照片、内容方向和授权范围。",
    approve: "批准后，这条申请会进入公开创作者库。联系邮箱不会公开。",
    reject: "拒绝后申请不会进入公开库，系统会尝试删除申请照片。",
    cleanup: "系统会再次删除这条已拒绝申请的 Storage 照片。",
    set_active: "下架后会立即停止公开展示和匹配；已下架的创作者可随时恢复。",
    delete_creator: "系统会先下架，再删除授权照片、公开记录和原申请。此操作不可恢复。",
  };
  return (
    <div className="admin-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onCancel(); }}>
      <section className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title">
        <div className="admin-dialog-icon"><ShieldCheck size={20} /></div>
        <h2 id="admin-dialog-title">{titles[action.type]}</h2>
        <p>{isSetActive && "creator" in action
          ? action.creator.is_active
            ? "下架后会立即停止公开展示和匹配，之后可以恢复。"
            : "恢复后会重新进入公开展示和匹配。"
          : descriptions[action.type]}</p>
        {isReject && (
          <label className="admin-dialog-label" htmlFor="review-note">
            拒绝原因（必填）
            <textarea id="review-note" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={500} rows={3} placeholder="例如：无法核验主页归属" />
          </label>
        )}
        {isDelete && (
          <label className="admin-dialog-label" htmlFor="delete-confirm-name">
            输入“{creatorName}”确认删除
            <input id="delete-confirm-name" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} autoComplete="off" />
          </label>
        )}
        <div className="admin-dialog-actions">
          <button className="admin-secondary-button" type="button" onClick={onCancel} disabled={busy}>取消</button>
          <button className={isReject || isDelete ? "admin-danger-button" : "admin-primary-button"} type="button" onClick={onConfirm} disabled={busy || (isReject && !reviewNote.trim()) || (isDelete && confirmText !== creatorName)}>
            {busy ? <LoaderCircle className="admin-spin" size={16} /> : <Check size={16} />}
            确认执行
          </button>
        </div>
      </section>
    </div>
  );
}

export default function AdminApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [view, setView] = useState<View>("pending");
  const [data, setData] = useState<AdminListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    let mounted = true;
    getAdminSession()
      .then((nextSession) => { if (mounted) { setSession(nextSession); setAuthReady(true); } })
      .catch((nextError) => { if (mounted) { setError(errorMessage(nextError)); setAuthReady(true); } });
    const { data: listener } = adminClient.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await invokeAdmin<AdminListResponse>({ action: "list" }));
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) void loadDashboard();
    else setData(null);
  }, [loadDashboard, session]);

  const pending = data?.submissions ?? [];
  const creators = useMemo(() => data?.creators ?? [], [data]);
  const outreach = useMemo(() => data?.outreach ?? [], [data]);

  async function handleConfirm() {
    if (!confirmAction) return;
    setActionBusy(true);
    setError("");
    try {
      if ("submission" in confirmAction) {
        await invokeAdmin({
          action: confirmAction.type,
          submissionId: confirmAction.submission.id,
          reviewNote: confirmAction.type === "reject" ? reviewNote.trim() : undefined,
        });
      } else {
        await invokeAdmin({
          action: confirmAction.type,
          creatorId: confirmAction.creator.id,
          isActive: confirmAction.type === "set_active" ? !confirmAction.creator.is_active : undefined,
          confirmName: confirmAction.type === "delete_creator" ? confirmText : undefined,
        });
      }
      setConfirmAction(null);
      setReviewNote("");
      setConfirmText("");
      await loadDashboard();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setActionBusy(false);
    }
  }

  function openAction(action: ConfirmAction) {
    setReviewNote("");
    setConfirmText("");
    setConfirmAction(action);
  }

  async function handleCreate(input: AdminCreatorSubmissionInput) {
    await createAdminSubmission(input);
    await loadDashboard();
  }

  async function handleOutreachSave(input: AdminOutreachInput) {
    await invokeAdmin({ action: "save_outreach", ...input });
    await loadDashboard();
  }

  async function handleOutreachDelete(outreachId: string) {
    await invokeAdmin({ action: "delete_outreach", outreachId });
    await loadDashboard();
  }

  if (!authReady) {
    return <main className="admin-loading"><LoaderCircle className="admin-spin" size={24} />正在确认管理台权限…</main>;
  }
  if (!session) return <LoginScreen />;

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-topbar-brand"><span className="admin-wordmark">LOOK</span><div><p className="admin-kicker">MAKEUP REFERENCE</p><h1>管理台</h1></div></div>
        <div className="admin-topbar-actions"><span className="admin-user-email">{session.user.email}</span><button className="admin-icon-button" type="button" onClick={() => void loadDashboard()} aria-label="刷新数据" title="刷新数据"><RefreshCw size={17} /></button><button className="admin-icon-button" type="button" onClick={() => void adminClient.auth.signOut()} aria-label="退出登录" title="退出登录"><LogOut size={17} /></button></div>
      </header>
      <section className="admin-content" aria-label="产品数据、创作者审核与库管理">
        <div className="admin-page-intro"><div><p className="admin-kicker">PRODUCTION DATA</p><h2>先核验，再公开</h2><p>申请资料只在管理台可见；产品数据与 AI 调用记录不包含照片或推荐结果。</p></div><div className="admin-intro-actions"><button className="admin-primary-button" type="button" onClick={() => setShowCreate(true)}><Plus size={16} />新建待审申请</button><div className="admin-data-badge"><Database size={18} /><span>{pending.length} 条待审核<br /><small>{creators.length} 条库内记录</small></span></div></div></div>
        <nav className="admin-tabs" aria-label="管理台视图"><button className={view === "pending" ? "admin-tab admin-tab-active" : "admin-tab"} type="button" onClick={() => setView("pending")}><Clock3 size={16} />待审核 <span>{pending.length}</span></button><button className={view === "creators" ? "admin-tab admin-tab-active" : "admin-tab"} type="button" onClick={() => setView("creators")}><Database size={16} />创作者库 <span>{creators.length}</span></button><button className={view === "outreach" ? "admin-tab admin-tab-active" : "admin-tab"} type="button" onClick={() => setView("outreach")}><MessageCircle size={16} />博主跟进 <span>{outreach.length}</span></button><button className={view === "metrics" ? "admin-tab admin-tab-active" : "admin-tab"} type="button" onClick={() => setView("metrics")}><BarChart3 size={16} />产品数据</button><button className={view === "ai" ? "admin-tab admin-tab-active" : "admin-tab"} type="button" onClick={() => setView("ai")}><Sparkles size={16} />AI 调用 <span>{data?.ai_discovery.total ?? 0}</span></button></nav>
        {error && <div className="admin-alert" role="alert"><X size={17} />{error}</div>}
        {loading ? <div className="admin-loading admin-loading-inline"><LoaderCircle className="admin-spin" size={22} />正在读取受保护数据…</div> : view === "pending" ? (
          <div className="admin-list">{pending.length === 0 ? <div className="admin-empty"><CheckCircle2 size={28} /><h3>当前没有待审核申请</h3><p>新的投稿会先停留在这里，不会自动公开。</p></div> : pending.map((submission) => <PendingRow key={submission.id} submission={submission} onAction={openAction} />)}</div>
        ) : view === "creators" ? (
          <div className="admin-list">{creators.length === 0 ? <div className="admin-empty"><Database size={28} /><h3>公开库暂无记录</h3></div> : creators.map((creator) => <CreatorRow key={creator.id} creator={creator} onAction={openAction} />)}</div>
        ) : view === "outreach" ? (
          <AdminOutreachPanel records={outreach} onSave={handleOutreachSave} onDelete={handleOutreachDelete} />
        ) : view === "metrics" && data?.product_metrics ? (
          <MetricsPanel metrics={data.product_metrics} />
        ) : data?.ai_discovery ? <AiDiscoveryPanel data={data.ai_discovery} /> : null}
      </section>
      {showCreate && <AdminCreateSubmissionDialog onClose={() => setShowCreate(false)} onSubmit={handleCreate} />}
      {confirmAction && <ConfirmDialog action={confirmAction} busy={actionBusy} reviewNote={reviewNote} setReviewNote={setReviewNote} confirmText={confirmText} setConfirmText={setConfirmText} onCancel={() => setConfirmAction(null)} onConfirm={() => void handleConfirm()} />}
    </main>
  );
}
