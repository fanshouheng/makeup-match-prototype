import {
  CalendarClock,
  Check,
  ExternalLink,
  MessageCircle,
  Pencil,
  Plus,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import type {
  AdminOutreach,
  AdminOutreachInput,
  AdminOutreachStatus,
} from "./adminApi";

const STATUS_OPTIONS: Array<{ value: AdminOutreachStatus; label: string }> = [
  { value: "contacted", label: "已联系" },
  { value: "replied", label: "已回复" },
  { value: "interested", label: "有意愿" },
  { value: "submitted", label: "已提交" },
  { value: "approved", label: "已批准" },
  { value: "active", label: "已上线" },
  { value: "declined", label: "已拒绝" },
  { value: "no_reply", label: "未回复" },
];
const STATUS_LABELS = Object.fromEntries(
  STATUS_OPTIONS.map((option) => [option.value, option.label]),
) as Record<AdminOutreachStatus, string>;
const REPLIED_STATUSES = new Set<AdminOutreachStatus>([
  "replied", "interested", "submitted", "approved", "active", "declined",
]);
const SUBMITTED_STATUSES = new Set<AdminOutreachStatus>([
  "submitted", "approved", "active",
]);
const TERMINAL_STATUSES = new Set<AdminOutreachStatus>(["declined", "no_reply"]);

function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" })
    .format(new Date(`${value}T00:00:00`));
}

function candidateCode(value: number): string {
  return `B${String(value).padStart(3, "0")}`;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isOverdue(record: AdminOutreach): boolean {
  return Boolean(
    record.next_follow_up_at &&
    record.next_follow_up_at < today() &&
    !TERMINAL_STATUSES.has(record.status) &&
    record.status !== "active",
  );
}

function emptyInput(): AdminOutreachInput {
  return {
    displayName: "",
    profileUrl: "",
    firstContactedAt: today(),
    outreachStatus: "contacted",
    nextFollowUpAt: null,
    lossReason: "",
    notes: "",
  };
}

function inputFromRecord(record: AdminOutreach): AdminOutreachInput {
  return {
    outreachId: record.id,
    displayName: record.display_name,
    profileUrl: record.profile_url,
    firstContactedAt: record.first_contacted_at,
    outreachStatus: record.status,
    nextFollowUpAt: record.next_follow_up_at,
    lossReason: record.loss_reason ?? "",
    notes: record.notes ?? "",
  };
}

function OutreachDialog({
  initial,
  busy,
  onClose,
  onSubmit,
}: {
  initial: AdminOutreachInput;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: AdminOutreachInput) => Promise<void>;
}) {
  const [input, setInput] = useState(initial);
  const [error, setError] = useState("");
  const editing = Boolean(initial.outreachId);

  function setField<Key extends keyof AdminOutreachInput>(
    key: Key,
    value: AdminOutreachInput[Key],
  ) {
    setInput((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!input.displayName.trim()) return setError("请填写博主称呼。");
    if (!isHttpsUrl(input.profileUrl.trim())) return setError("主页链接必须是有效的 HTTPS 地址。");
    if (!input.firstContactedAt) return setError("请选择首次联系日期。");
    if (input.nextFollowUpAt && input.nextFollowUpAt < input.firstContactedAt) {
      return setError("下次跟进日期不能早于首次联系日期。");
    }
    if (TERMINAL_STATUSES.has(input.outreachStatus) && !input.lossReason.trim()) {
      return setError("拒绝或未回复需要填写主要原因。");
    }
    try {
      await onSubmit({
        ...input,
        displayName: input.displayName.trim(),
        profileUrl: input.profileUrl.trim(),
        nextFollowUpAt: input.nextFollowUpAt || null,
        lossReason: input.lossReason.trim(),
        notes: input.notes.trim(),
      });
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "保存失败，请稍后重试。");
    }
  }

  return (
    <div className="admin-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="admin-dialog admin-outreach-dialog" role="dialog" aria-modal="true" aria-labelledby="outreach-dialog-title">
        <div className="admin-outreach-dialog-heading">
          <div><p className="admin-kicker">PRIVATE LEDGER</p><h2 id="outreach-dialog-title">{editing ? "编辑跟进记录" : "新增跟进记录"}</h2></div>
          <button className="admin-icon-button" type="button" onClick={onClose} aria-label="关闭" disabled={busy}><X size={17} /></button>
        </div>
        <form className="admin-outreach-form" onSubmit={(event) => void handleSubmit(event)}>
          <label><span>博主称呼</span><input required maxLength={60} value={input.displayName} onChange={(event) => setField("displayName", event.target.value)} /></label>
          <label><span>当前阶段</span><select value={input.outreachStatus} onChange={(event) => {
            const status = event.target.value as AdminOutreachStatus;
            setInput((current) => ({
              ...current,
              outreachStatus: status,
              nextFollowUpAt: TERMINAL_STATUSES.has(status) || status === "active" ? null : current.nextFollowUpAt,
            }));
          }}>{STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="admin-field-wide"><span>主页链接</span><input required type="url" inputMode="url" maxLength={2048} placeholder="https://www.douyin.com/user/..." value={input.profileUrl} onChange={(event) => setField("profileUrl", event.target.value)} /></label>
          <label><span>首次联系日期</span><input required type="date" value={input.firstContactedAt} onChange={(event) => setField("firstContactedAt", event.target.value)} /></label>
          <label><span>下次跟进日期 <small>选填</small></span><input type="date" min={input.firstContactedAt} value={input.nextFollowUpAt ?? ""} onChange={(event) => setField("nextFollowUpAt", event.target.value || null)} disabled={TERMINAL_STATUSES.has(input.outreachStatus) || input.outreachStatus === "active"} /></label>
          <label className="admin-field-wide"><span>流失原因 {TERMINAL_STATUSES.has(input.outreachStatus) ? "（必填）" : "（选填）"}</span><input maxLength={200} value={input.lossReason} onChange={(event) => setField("lossReason", event.target.value)} placeholder="例如：两次私信均未回复" /></label>
          <label className="admin-field-wide"><span>简短备注 <small>选填，仅管理台可见</small></span><textarea rows={4} maxLength={1000} value={input.notes} onChange={(event) => setField("notes", event.target.value)} /></label>
          {error && <p className="admin-form-error admin-field-wide" role="alert">{error}</p>}
          <div className="admin-dialog-actions admin-field-wide">
            <button className="admin-secondary-button" type="button" onClick={onClose} disabled={busy}>取消</button>
            <button className="admin-primary-button" type="submit" disabled={busy}><Check size={16} />{busy ? "正在保存" : "保存记录"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function AdminOutreachPanel({
  records,
  onSave,
  onDelete,
}: {
  records: AdminOutreach[];
  onSave: (input: AdminOutreachInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState<"all" | "overdue" | AdminOutreachStatus>("all");
  const [dialogInput, setDialogInput] = useState<AdminOutreachInput>();
  const [deleteRecord, setDeleteRecord] = useState<AdminOutreach>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const visibleRecords = useMemo(() => records.filter((record) => {
    if (filter === "all") return true;
    if (filter === "overdue") return isOverdue(record);
    return record.status === filter;
  }), [filter, records]);
  const replied = records.filter((record) => REPLIED_STATUSES.has(record.status)).length;
  const submitted = records.filter((record) => SUBMITTED_STATUSES.has(record.status)).length;
  const active = records.filter((record) => record.status === "active").length;
  const overdue = records.filter(isOverdue).length;

  async function save(input: AdminOutreachInput) {
    setBusy(true);
    setError("");
    try {
      await onSave(input);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleteRecord) return;
    setBusy(true);
    setError("");
    try {
      await onDelete(deleteRecord.id);
      setDeleteRecord(undefined);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-outreach" aria-labelledby="admin-outreach-title">
      <div className="admin-outreach-heading">
        <div><p className="admin-kicker">PRIVATE OUTREACH</p><h2 id="admin-outreach-title">博主跟进</h2><p>只记录阶段和下一步，不保存聊天截图。</p></div>
        <div className="admin-outreach-controls">
          <label><span className="visually-hidden">筛选跟进状态</span><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">全部状态</option><option value="overdue">待跟进</option>{STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <button className="admin-primary-button" type="button" onClick={() => setDialogInput(emptyInput())}><Plus size={16} />新增跟进</button>
        </div>
      </div>
      <div className="admin-outreach-summary" aria-label="博主跟进汇总">
        <div><span>已联系</span><strong>{records.length}</strong></div>
        <div><span>已回复</span><strong>{replied}</strong></div>
        <div><span>已提交</span><strong>{submitted}</strong></div>
        <div><span>已上线</span><strong>{active}</strong></div>
        <div data-alert={overdue > 0}><span>待跟进</span><strong>{overdue}</strong></div>
      </div>
      {error && <div className="admin-alert" role="alert"><X size={17} />{error}</div>}
      {visibleRecords.length === 0 ? (
        <div className="admin-empty"><MessageCircle size={28} /><h3>{records.length === 0 ? "还没有跟进记录" : "没有符合筛选条件的记录"}</h3><p>{records.length === 0 ? "联系第一位博主后，从这里开始记录。" : "切换筛选条件查看其他阶段。"}</p></div>
      ) : (
        <div className="admin-outreach-table-wrap">
          <table className="admin-outreach-table">
            <thead><tr><th>候选</th><th>当前阶段</th><th>首次联系</th><th>下次跟进</th><th>记录</th><th><span className="visually-hidden">操作</span></th></tr></thead>
            <tbody>{visibleRecords.map((record) => <tr key={record.id} data-overdue={isOverdue(record)}>
              <td data-label="候选"><div className="admin-outreach-person"><span className="admin-outreach-code">{candidateCode(record.candidate_no)}</span><div><strong>{record.display_name}</strong><a href={record.profile_url} target="_blank" rel="noreferrer">打开主页 <ExternalLink size={12} /></a></div></div></td>
              <td data-label="当前阶段"><span className={`admin-status admin-outreach-status-${record.status}`}>{STATUS_LABELS[record.status]}</span></td>
              <td data-label="首次联系">{formatDate(record.first_contacted_at)}</td>
              <td data-label="下次跟进"><span className={isOverdue(record) ? "admin-outreach-overdue" : ""}>{isOverdue(record) && <CalendarClock size={14} />}{formatDate(record.next_follow_up_at)}</span></td>
              <td data-label="记录"><p className="admin-outreach-note">{record.loss_reason || record.notes || "—"}</p></td>
              <td className="admin-outreach-actions"><button className="admin-icon-button" type="button" onClick={() => setDialogInput(inputFromRecord(record))} aria-label={`编辑 ${record.display_name}`} title="编辑"><Pencil size={15} /></button><button className="admin-icon-button admin-icon-button-danger" type="button" onClick={() => setDeleteRecord(record)} aria-label={`删除 ${record.display_name}`} title="删除"><Trash2 size={15} /></button></td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
      {dialogInput && <OutreachDialog initial={dialogInput} busy={busy} onClose={() => setDialogInput(undefined)} onSubmit={save} />}
      {deleteRecord && <div className="admin-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setDeleteRecord(undefined); }}><section className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-outreach-title"><div className="admin-dialog-icon"><UserRound size={20} /></div><h2 id="delete-outreach-title">删除 {candidateCode(deleteRecord.candidate_no)}？</h2><p>只会删除这条私有跟进记录，不会删除投稿申请或公开创作者。</p><div className="admin-dialog-actions"><button className="admin-secondary-button" type="button" onClick={() => setDeleteRecord(undefined)} disabled={busy}>取消</button><button className="admin-danger-button" type="button" onClick={() => void remove()} disabled={busy}><Trash2 size={16} />确认删除</button></div></section></div>}
    </section>
  );
}
