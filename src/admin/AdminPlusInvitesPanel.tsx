import { Check, Copy, KeyRound, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import {
  grantPurchasedAiCredits,
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
      setGrantedRewards(await grantPurchasedAiCredits(purchaseEmail));
      setPurchaseEmail("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "AI 次数发放失败。");
    } finally {
      setGrantBusy(false);
    }
  }

  return (
    <section className="admin-plus-invites" aria-labelledby="admin-plus-invites-title">
      <div className="admin-plus-invites-heading">
        <div>
          <p className="admin-kicker">PLUS / INVITE ACCESS</p>
          <h2 id="admin-plus-invites-title">签发一次性邀请码</h2>
          <p>仅在微信内确认付款后签发。邀请码 30 天内有效，只能激活一个邮箱账号。</p>
        </div>
        <button className="admin-primary-button" disabled={busy} onClick={() => void handleIssue()} type="button">
          {busy ? <LoaderCircle className="admin-spin" size={16} /> : <KeyRound size={16} />}
          生成邀请码
        </button>
      </div>

      <div className="admin-plus-invites-policy">
        <ShieldCheck size={18} />
        <p>数据库只保存邀请码哈希。明文只在本次签发后显示，请立即发送给对应用户；管理台之后无法找回。</p>
      </div>

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
        <div className="admin-plus-invites-empty">
          <KeyRound size={26} />
          <p>本页不会列出或恢复历史邀请码。</p>
        </div>
      )}

      {error && <div className="admin-alert" role="alert">{error}</div>}

      <div className="admin-credit-grant">
        <div>
          <p className="admin-kicker">AI CREDITS / MANUAL PAYMENT</p>
          <h3>发放 10 次 AI 推荐</h3>
          <p>仅在微信人工确认 ¥9.9 到账后操作。这里只保存账号、次数变化和发放时间，不保存付款凭证。</p>
        </div>
        <form onSubmit={handleGrant}>
          <label htmlFor="ai-credit-email">用户账号邮箱</label>
          <div>
            <input autoComplete="off" id="ai-credit-email" onChange={(event) => setPurchaseEmail(event.target.value)} required type="email" value={purchaseEmail} />
            <button className="admin-primary-button" disabled={grantBusy} type="submit">
              {grantBusy ? <LoaderCircle className="admin-spin" size={16} /> : <Sparkles size={16} />}
              发放 10 次
            </button>
          </div>
        </form>
        {grantedRewards && (
          <p className="admin-credit-success" role="status">
            已发放，账号当前共有 {grantedRewards.aiCredits} 次 AI 推荐。
          </p>
        )}
      </div>
    </section>
  );
}
