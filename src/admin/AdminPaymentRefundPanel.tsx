import { LoaderCircle, RotateCcw } from "lucide-react";
import { useState } from "react";
import { requestPaymentRefund } from "./adminApi";

interface AdminPaymentRefundPanelProps {
  onCompleted: () => Promise<void>;
}

export function AdminPaymentRefundPanel({ onCompleted }: AdminPaymentRefundPanelProps) {
  const [orderId, setOrderId] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await requestPaymentRefund(orderId.trim(), confirmation);
      setMessage(result.status === "refunded" ? "退款已确认，订单与权益已同步。" : "退款已提交，等待供应商确认。");
      setOrderId("");
      setConfirmation("");
      await onCompleted();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "退款请求失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="admin-refund-tool">
      <summary><RotateCcw size={16} />退款处理</summary>
      <form onSubmit={submit}>
        <label htmlFor="refund-order-id">
          内部订单 ID
          <input
            autoComplete="off"
            id="refund-order-id"
            onChange={(event) => setOrderId(event.target.value)}
            pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            required
            value={orderId}
          />
        </label>
        <label htmlFor="refund-confirmation">
          输入 REFUND 确认全额退款
          <input
            autoComplete="off"
            id="refund-confirmation"
            onChange={(event) => setConfirmation(event.target.value.toUpperCase())}
            required
            value={confirmation}
          />
        </label>
        <button className="admin-danger-button" disabled={busy || confirmation !== "REFUND"} type="submit">
          {busy ? <LoaderCircle className="admin-spin" size={16} /> : <RotateCcw size={16} />}
          发起全额退款
        </button>
      </form>
      <p>只处理已支付的 Stripe/支付宝订单。供应商确认成功后才回滚权益；重复提交不会重复扣减。</p>
      {message && <p className="admin-refund-success" role="status">{message}</p>}
      {error && <p className="admin-refund-error" role="alert">{error}</p>}
    </details>
  );
}
