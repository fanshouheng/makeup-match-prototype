import { Check, Copy, KeyRound, LoaderCircle, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import { useState } from "react";
import {
  grantPoints,
  issuePlusInvite,
  type AdminIssuedPlusInvite,
  type AdminRewardStatus,
} from "./adminApi";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AdminPlusInvitesPanel() {
  const [issued, setIssued] = useState<AdminIssuedPlusInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [purchaseEmail, setPurchaseEmail] = useState("");
  const [pointAmount, setPointAmount] = useState("30");
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantedRewards, setGrantedRewards] = useState<AdminRewardStatus | null>(null);

  async function handleIssue() {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      setIssued(await issuePlusInvite());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "邀请码签发失败。");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.inviteCode);
      setCopied(true);
    } catch {
      setError("无法自动复制，请手动选中邀请码。");
    }
  }

  async function handleGrant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGrantBusy(true);
    setGrantedRewards(null);
    setError("");
    try {
      setGrantedRewards(await grantPoints(purchaseEmail, Number(pointAmount)));
      setPurchaseEmail("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "积分发放失败。");
    } finally {
      setGrantBusy(false);
    }
  }

  return (
    <section className="admin-plus-invites" aria-labelledby="admin-plus-invites-title">
      <div className="admin-plus-invites-heading">
        <div>
          <p className="admin-kicker">POINTS / ENTITLEMENTS</p>
          <h2 id="admin-plus-invites-title">积分与旧 Plus 权益</h2>
          <p>新购买只发积分。旧 Plus 邀请码仅用于完成此前已经承诺的权益，不再作为新订单交付方式。</p>
        </div>
      </div>

      <div className="admin-credit-grant">
        <div>
          <p className="admin-kicker">POINTS / MANUAL GRANT</p>
          <h3><WalletCards size={20} />发放积分</h3>
          <p>用于人工补发、客服补偿或已核验的线下付款。这里只保存账号、积分变化和发放时间，不保存付款凭证。</p>
        </div>
        <form onSubmit={handleGrant}>
          <label htmlFor="ai-credit-email">用户账号邮箱</label>
          <div>
            <input autoComplete="off" id="ai-credit-email" onChange={(event) => setPurchaseEmail(event.target.value)} required type="email" value={purchaseEmail} />
            <input aria-label="积分数量" max="100000" min="1" onChange={(event) => setPointAmount(event.target.value)} required step="1" type="number" value={pointAmount} />
            <button className="admin-primary-button" disabled={grantBusy} type="submit">
              {grantBusy ? <LoaderCircle className="admin-spin" size={16} /> : <Sparkles size={16} />}
              发放积分
            </button>
          </div>
        </form>
        {grantedRewards && (
          <p className="admin-credit-success" role="status">
            已发放，账号当前余额为 {grantedRewards.points} 积分。
          </p>
        )}
      </div>

      <details className="admin-legacy-plus">
        <summary>旧 Plus 邀请码兼容工具</summary>
        <div className="admin-plus-invites-policy">
          <ShieldCheck size={18} />
          <p>只为履行旧承诺使用。数据库只保存邀请码哈希；明文只在本次签发后显示，之后无法找回。</p>
        </div>
        <button className="admin-secondary-button" disabled={busy} onClick={() => void handleIssue()} type="button">
          {busy ? <LoaderCircle className="admin-spin" size={16} /> : <KeyRound size={16} />}
          生成旧 Plus 邀请码
        </button>
        {issued ? (
          <div className="admin-issued-invite" role="status">
            <div>
              <small>刚刚签发 · {formatDate(issued.expiresAt)} 到期</small>
              <strong>{issued.inviteCode}</strong>
            </div>
            <button className="admin-secondary-button" onClick={() => void handleCopy()} type="button">
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "已复制" : "复制邀请码"}
            </button>
          </div>
        ) : (
          <p className="admin-legacy-plus-empty">不会列出或恢复历史邀请码。</p>
        )}
      </details>

      {error && <div className="admin-alert" role="alert">{error}</div>}
    </section>
  );
}
