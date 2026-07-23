import {
  Turnstile,
  type TurnstileInstance,
} from "@marsidev/react-turnstile";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import { useRef, useState } from "react";
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
import { hasSupabaseConfig } from "../services/supabaseClient";

interface AiCreatorDiscoveryProps {
  contentFilter: CreatorContentFilter;
  referenceAudience: ReferenceAudience;
  userPhoto: HTMLImageElement;
}

export function AiCreatorDiscovery({
  contentFilter,
  referenceAudience,
  userPhoto,
}: AiCreatorDiscoveryProps) {
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined);
  const [expanded, setExpanded] = useState(false);
  const [consent, setConsent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiCreatorDiscoveryResult>();
  const [error, setError] = useState<string>();

  async function handleDiscover() {
    setError(undefined);
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

  return (
    <section className="ai-discovery" aria-labelledby="ai-discovery-title">
      <div className="ai-discovery-heading">
        <div>
          <p className="eyebrow">AI DISCOVERY / 联网推荐</p>
          <h3 id="ai-discovery-title">让 AI 再找几个参考</h3>
          <p>AI 会分析这张照片并联网查找，只返回博主名字。</p>
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
            <p>
              开始后，浏览器会生成一张去除照片元数据的压缩副本，并发送给第三方 AI 服务完成本次分析和联网推荐。副本不会写入 LOOK AI 数据库。
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
          </div>
        )
      )}
    </section>
  );
}
