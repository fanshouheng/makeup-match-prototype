import {
  Turnstile,
  type TurnstileInstance,
} from "@marsidev/react-turnstile";
import {
  AlertCircle,
  BrainCircuit,
  Flame,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useRef, useState } from "react";
import { hasTurnstileConfig, turnstileSiteKey } from "../config";
import type { FaceFeatureVector } from "../domain/faceFeatures";
import { FEATURE_LABELS } from "../domain/featureLabels";
import {
  MALE_REPORT_STYLES,
  type MaleReportMode,
  type MaleReportStyle,
} from "../domain/maleReportStyles";
import {
  generateMaleFaceReport,
  type MaleFaceReport as MaleFaceReportResult,
} from "../services/maleFaceReport";
import { hasSupabaseConfig } from "../services/supabaseClient";

interface MaleFaceReportProps {
  faceFeatures: FaceFeatureVector;
}

export function MaleFaceReport({ faceFeatures }: MaleFaceReportProps) {
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined);
  const [mode, setMode] = useState<MaleReportMode>("roast");
  const [style, setStyle] = useState<MaleReportStyle>("internet_bestie");
  const [consent, setConsent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<MaleFaceReportResult>();
  const [error, setError] = useState<string>();

  const changeMode = (nextMode: MaleReportMode) => {
    setMode(nextMode);
    setReport(undefined);
  };

  const changeStyle = (nextStyle: MaleReportStyle) => {
    setStyle(nextStyle);
    setReport(undefined);
  };

  async function handleGenerate() {
    setError(undefined);
    setLoading(true);
    try {
      setReport(await generateMaleFaceReport({
        consent,
        features: faceFeatures,
        mode,
        style,
        turnstileToken,
      }));
    } catch (reportError) {
      setError(
        reportError instanceof Error
          ? reportError.message
          : "AI 报告暂时不可用，请稍后重试。",
      );
    } finally {
      setLoading(false);
      setTurnstileToken("");
      turnstileRef.current?.reset();
    }
  }

  return (
    <section className="male-report" aria-labelledby="male-report-title">
      <div className="male-report-heading">
        <div>
          <p className="eyebrow">AI REPORT / 男生面部报告</p>
          <h2 id="male-report-title">选一个人来评价这张脸</h2>
        </div>
        <span><BrainCircuit size={17} />AI 生成</span>
      </div>

      <div className="male-report-mode" aria-label="报告模式" role="group">
        <button
          aria-pressed={mode === "roast"}
          onClick={() => changeMode("roast")}
          type="button"
        >
          <Flame size={17} />锐评模式
        </button>
        <button
          aria-pressed={mode === "praise"}
          onClick={() => changeMode("praise")}
          type="button"
        >
          <Sparkles size={17} />夸夸模式
        </button>
      </div>
      <p className="male-report-mode-note">测试阶段两种模式均免费体验。</p>

      <fieldset className="male-report-styles">
        <legend>选择评价人</legend>
        <div className="male-report-style-grid">
          {MALE_REPORT_STYLES.map((option) => (
            <label key={option.value}>
              <input
                checked={style === option.value}
                name="male-report-style"
                onChange={() => changeStyle(option.value)}
                type="radio"
              />
              <span><strong>{option.label}</strong><small>{option.description}</small></span>
            </label>
          ))}
        </div>
      </fieldset>

      {report ? (
        <div className="male-report-result" aria-live="polite">
          <div className="male-report-result-heading">
            <div>
              <p className="eyebrow">GENERATED / AI 生成内容</p>
              <h3>{report.title}</h3>
            </div>
            <button className="button button-ghost" onClick={() => setReport(undefined)} type="button">
              <RefreshCw size={16} />换个人
            </button>
          </div>
          <p className="male-report-summary">{report.summary}</p>
          <div className="male-report-observations">
            {report.observations.map((item) => (
              <article key={item.feature}>
                <small>{item.label}</small>
                <p>{item.fact}</p>
                <blockquote>{item.comment}</blockquote>
              </article>
            ))}
          </div>
          <p className="male-report-closing">{report.closing}</p>
        </div>
      ) : (
        <div className="male-report-consent">
          <div className="male-report-data-note">
            <ShieldCheck size={19} />
            <div>
              <h3>发送前由你决定</h3>
              <p>同意后，以下九项精确比例会由 MAKE UP 发送给第三方 AI 服务，仅用于生成本次报告。不会发送照片、关键点坐标、姓名、设备标识或匹配结果；第三方 AI 服务仍可能依其规则处理必要的安全与运行日志。</p>
            </div>
          </div>
          <details className="male-report-data-details">
            <summary>查看将发送的九项精确数据</summary>
            <dl>
              {Object.entries(faceFeatures).map(([key, value]) => (
                <div key={key}>
                  <dt>{FEATURE_LABELS[key as keyof typeof FEATURE_LABELS]}</dt>
                  <dd>{value.toFixed(6)}</dd>
                </div>
              ))}
            </dl>
          </details>
          <label className="consent-field ai-consent-field">
            <input
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              type="checkbox"
            />
            <span>我已了解并同意将上述九项精确面部比例发送给第三方 AI 服务，用于生成本次 AI 报告。</span>
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
                action: "male_face_report",
                language: "zh-cn",
                size: "compact",
                theme: "light",
              }}
            />
          ) : (
            <div className="notice notice-warning compact">
              <AlertCircle size={16} />
              <p>AI 报告正在进行安全配置，暂时无法调用。</p>
            </div>
          )}
          {error && (
            <div className="notice notice-error compact" role="alert">
              <AlertCircle size={16} /><p>{error}</p>
            </div>
          )}
          <button
            className="button button-primary male-report-submit"
            disabled={loading || !consent || !hasSupabaseConfig || !hasTurnstileConfig || !turnstileToken}
            onClick={() => void handleGenerate()}
            type="button"
          >
            {loading ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}
            {loading ? "正在生成报告" : "同意并生成报告"}
          </button>
        </div>
      )}
    </section>
  );
}
