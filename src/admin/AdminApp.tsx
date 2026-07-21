import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  ImageOff,
  LoaderCircle,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { adminClient } from "./adminClient";
import {
  getAdminSession,
  invokeAdmin,
  type AdminCreator,
  type AdminListResponse,
  type AdminSubmission,
} from "./adminApi";
import "./admin.css";

type View = "pending" | "creators";
type ConfirmAction =
  | { type: "verify" | "approve" | "reject" | "cleanup"; submission: AdminSubmission }
  | null;

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
      setError("无法发送登录链接。请确认这个邮箱已被授权为管理员。");
      return;
    }
    setSent(true);
  }

  return (
    <main className="admin-auth-shell">
      <section className="admin-auth-panel" aria-labelledby="admin-login-title">
        <div className="admin-brand-mark" aria-hidden="true"><ShieldCheck size={22} /></div>
        <p className="admin-kicker">LOOK AI / PRIVATE CONSOLE</p>
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
          <div><dt>教程链接</dt><dd>{submission.tutorial_url ? "已提供" : "未提供"}</dd></div>
          <div><dt>公开主页</dt><dd><a href={submission.douyin_url} target="_blank" rel="noreferrer">打开主页 <ExternalLink size={13} /></a></dd></div>
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

function CreatorRow({ creator }: { creator: AdminCreator }) {
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
          <div><dt>主页</dt><dd><a href={creator.douyin_url} target="_blank" rel="noreferrer">打开主页 <ExternalLink size={13} /></a></dd></div>
          <div><dt>代表教程</dt><dd>{creator.tutorial_url ? <a href={creator.tutorial_url} target="_blank" rel="noreferrer">打开链接 <ExternalLink size={13} /></a> : "未设置"}</dd></div>
        </dl>
      </div>
    </article>
  );
}

function ConfirmDialog({
  action,
  busy,
  reviewNote,
  setReviewNote,
  onCancel,
  onConfirm,
}: {
  action: Exclude<ConfirmAction, null>;
  busy: boolean;
  reviewNote: string;
  setReviewNote: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isReject = action.type === "reject";
  const titles = { verify: "确认完成归属核验？", approve: "确认批准入库？", reject: "确认拒绝申请？", cleanup: "确认重试照片清理？" };
  const descriptions = {
    verify: "请确认你已经核验主页归属、本人照片和授权范围。",
    approve: "批准后，这条申请会进入公开创作者库。联系邮箱不会公开。",
    reject: "拒绝后申请不会进入公开库，系统会尝试删除申请照片。",
    cleanup: "系统会再次删除这条已拒绝申请的 Storage 照片。",
  };
  return (
    <div className="admin-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onCancel(); }}>
      <section className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title">
        <div className="admin-dialog-icon"><ShieldCheck size={20} /></div>
        <h2 id="admin-dialog-title">{titles[action.type]}</h2>
        <p>{descriptions[action.type]}</p>
        {isReject && (
          <label className="admin-dialog-label" htmlFor="review-note">
            拒绝原因（必填）
            <textarea id="review-note" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={500} rows={3} placeholder="例如：无法核验主页归属" />
          </label>
        )}
        <div className="admin-dialog-actions">
          <button className="admin-secondary-button" type="button" onClick={onCancel} disabled={busy}>取消</button>
          <button className={isReject ? "admin-danger-button" : "admin-primary-button"} type="button" onClick={onConfirm} disabled={busy || (isReject && !reviewNote.trim())}>
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
  const [actionBusy, setActionBusy] = useState(false);

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

  async function handleConfirm() {
    if (!confirmAction) return;
    setActionBusy(true);
    setError("");
    try {
      await invokeAdmin({
        action: confirmAction.type,
        submissionId: confirmAction.submission.id,
        reviewNote: confirmAction.type === "reject" ? reviewNote.trim() : undefined,
      });
      setConfirmAction(null);
      setReviewNote("");
      await loadDashboard();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setActionBusy(false);
    }
  }

  function openAction(action: ConfirmAction) {
    setReviewNote("");
    setConfirmAction(action);
  }

  if (!authReady) {
    return <main className="admin-loading"><LoaderCircle className="admin-spin" size={24} />正在确认管理台权限…</main>;
  }
  if (!session) return <LoginScreen />;

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-topbar-brand"><div className="admin-brand-mark" aria-hidden="true"><ShieldCheck size={20} /></div><div><p className="admin-kicker">LOOK AI / PRIVATE CONSOLE</p><h1>创作者管理台</h1></div></div>
        <div className="admin-topbar-actions"><span className="admin-user-email">{session.user.email}</span><button className="admin-icon-button" type="button" onClick={() => void loadDashboard()} aria-label="刷新数据" title="刷新数据"><RefreshCw size={17} /></button><button className="admin-icon-button" type="button" onClick={() => void adminClient.auth.signOut()} aria-label="退出登录" title="退出登录"><LogOut size={17} /></button></div>
      </header>
      <section className="admin-content" aria-label="创作者审核与库管理">
        <div className="admin-page-intro"><div><p className="admin-kicker">PRODUCTION DATA</p><h2>先核验，再公开</h2><p>申请资料只在管理台可见，公开库只展示已批准的创作者。</p></div><div className="admin-data-badge"><Database size={18} /><span>{pending.length} 条待审核<br /><small>{creators.length} 条库内记录</small></span></div></div>
        <nav className="admin-tabs" aria-label="管理台视图"><button className={view === "pending" ? "admin-tab admin-tab-active" : "admin-tab"} type="button" onClick={() => setView("pending")}><Clock3 size={16} />待审核 <span>{pending.length}</span></button><button className={view === "creators" ? "admin-tab admin-tab-active" : "admin-tab"} type="button" onClick={() => setView("creators")}><Database size={16} />公开博主库 <span>{creators.length}</span></button></nav>
        {error && <div className="admin-alert" role="alert"><X size={17} />{error}</div>}
        {loading ? <div className="admin-loading admin-loading-inline"><LoaderCircle className="admin-spin" size={22} />正在读取受保护数据…</div> : view === "pending" ? (
          <div className="admin-list">{pending.length === 0 ? <div className="admin-empty"><CheckCircle2 size={28} /><h3>当前没有待审核申请</h3><p>新的投稿会先停留在这里，不会自动公开。</p></div> : pending.map((submission) => <PendingRow key={submission.id} submission={submission} onAction={openAction} />)}</div>
        ) : (
          <div className="admin-list">{creators.length === 0 ? <div className="admin-empty"><Database size={28} /><h3>公开库暂无记录</h3></div> : creators.map((creator) => <CreatorRow key={creator.id} creator={creator} />)}</div>
        )}
      </section>
      {confirmAction && <ConfirmDialog action={confirmAction} busy={actionBusy} reviewNote={reviewNote} setReviewNote={setReviewNote} onCancel={() => setConfirmAction(null)} onConfirm={() => void handleConfirm()} />}
    </main>
  );
}
