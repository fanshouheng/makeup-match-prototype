import {
  AlertCircle,
  Check,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceFeatureVector } from "../domain/faceFeatures";
import { FEATURE_LABELS } from "../domain/featureLabels";
import {
  acknowledgePlusMakeupReportJob,
  getPlusMakeupReportJob,
  plusMakeupJobFailureMessage,
  startPlusMakeupReport,
  type PlusMakeupDirection,
  type PlusMakeupJobResponse,
  type PlusMakeupJobStatus,
  type PlusMakeupReport,
  type PlusMakeupScene,
} from "../services/plusMakeupReport";
import {
  PLUS_MAKEUP_DIRECTIONS,
} from "../../supabase/functions/_shared/plusMakeupReport";
import { recordProductEvent } from "../services/productMetrics";

const REPORT_DIRECTIONS = PLUS_MAKEUP_DIRECTIONS.filter((option) =>
  ["auto", "clean", "soft", "camera_ready"].includes(option.value),
);

interface PlusMakeupReportGeneratorProps {
  faceFeatures?: FaceFeatureVector;
  isAuthenticated: boolean;
  loginHref: string;
  remainingPoints: number;
  onGenerated: (value: {
    createdAt: string;
    customScene: string;
    direction: PlusMakeupDirection;
    id: string;
    remainingPoints: number;
    report: PlusMakeupReport;
    scenes: PlusMakeupScene[];
  }) => Promise<void> | void;
  onPointsChanged: (remainingPoints: number) => void;
  onViewReports: () => void;
  photoStatus: "loading" | "missing" | "ready";
}

export function PlusMakeupReportGenerator({
  faceFeatures,
  isAuthenticated,
  loginHref,
  onGenerated,
  onPointsChanged,
  onViewReports,
  photoStatus,
  remainingPoints,
}: PlusMakeupReportGeneratorProps) {
  const [customScene, setCustomScene] = useState("");
  const [direction, setDirection] = useState<PlusMakeupDirection>("auto");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [jobStatus, setJobStatus] = useState<PlusMakeupJobStatus | null>(null);
  const [error, setError] = useState("");
  const [completedReportTitle, setCompletedReportTitle] = useState("");
  const onGeneratedRef = useRef(onGenerated);
  const onPointsChangedRef = useRef(onPointsChanged);
  const deliveringJobRef = useRef<string | undefined>(undefined);
  const customSceneText = customScene.trim();
  const generationBlocker = !isAuthenticated
    ? "登录后才能生成报告。"
    : photoStatus === "loading"
      ? "正在分析照片，请稍候。"
      : !faceFeatures
        ? "请先上传一张通过本机分析的正脸照片。"
        : !customSceneText
          ? "请填写这次化妆的使用场景。"
          : !consent
            ? "请确认并同意发送报告所需数据。"
            : remainingPoints < 100
              ? "当前积分不足，生成完整报告需要 100 积分。"
              : "";

  useEffect(() => {
    onGeneratedRef.current = onGenerated;
    onPointsChangedRef.current = onPointsChanged;
  });

  const handleJobResponse = useCallback(async (response: PlusMakeupJobResponse) => {
    onPointsChangedRef.current(response.remainingPoints);
    const job = response.job;
    if (!job) {
      setJobStatus(null);
      return;
    }
    if (job.status === "processing") {
      setJobStatus(job.status);
      void recordProductEvent("plus_job_created");
      return;
    }
    if (job.status === "failed") {
      setJobStatus(null);
      setError(plusMakeupJobFailureMessage(job.errorCode));
      void recordProductEvent("plus_job_failed");
      void recordProductEvent("plus_credit_refunded");
      await acknowledgePlusMakeupReportJob(job.id).catch(() => undefined);
      return;
    }
    if (!job.report || deliveringJobRef.current === job.id) return;

    deliveringJobRef.current = job.id;
    setJobStatus(job.status);
    try {
      void recordProductEvent("plus_job_succeeded");
      await onGeneratedRef.current({
        createdAt: job.createdAt,
        customScene: job.customScene,
        direction: job.direction,
        id: job.id,
        remainingPoints: response.remainingPoints,
        report: job.report,
        scenes: job.scenes,
      });
      await acknowledgePlusMakeupReportJob(job.id);
      void recordProductEvent("plus_report_saved_local");
      setCompletedReportTitle(job.report.title);
      setJobStatus(null);
    } catch (deliveryError) {
      setError(deliveryError instanceof Error
        ? deliveryError.message
        : "报告已生成，但保存到本机失败，请刷新后重试。");
    } finally {
      deliveringJobRef.current = undefined;
    }
  }, []);

  const refreshJob = useCallback(async () => {
    try {
      await handleJobResponse(await getPlusMakeupReportJob());
    } catch (jobError) {
      setError(jobError instanceof Error ? jobError.message : "报告任务状态读取失败。");
    }
  }, [handleJobResponse]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void refreshJob();
  }, [isAuthenticated, refreshJob]);

  useEffect(() => {
    if (jobStatus !== "processing") return;
    const interval = window.setInterval(() => void refreshJob(), 3_000);
    return () => window.clearInterval(interval);
  }, [jobStatus, refreshJob]);

  async function handleGenerate() {
    if (!faceFeatures) return;
    setError("");
    setCompletedReportTitle("");
    setLoading(true);
    void recordProductEvent("plus_job_created");
    try {
      const response = await startPlusMakeupReport({
        consent,
        customScene,
        direction,
        features: faceFeatures,
        scenes: [],
      });
      await handleJobResponse(response);
    } catch (reportError) {
      setError(reportError instanceof Error
        ? reportError.message
        : "报告暂时不可用，本次不会扣减积分。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="plus-makeup-generator" id="plus-makeup-generator" aria-labelledby="plus-makeup-generator-title">
      <div className="report-step-heading">
        <span>02</span>
        <div>
          <h2 id="plus-makeup-generator-title">设置使用场景</h2>
          <p>简单说清楚去哪、见谁或希望呈现的感觉。</p>
        </div>
      </div>

      <div className="plus-makeup-config">
        <fieldset>
          <label className="plus-makeup-custom-scene">
            <span>化妆应用场景</span>
            <textarea
              maxLength={80}
              onChange={(event) => {
                setCustomScene(event.target.value);
                setCompletedReportTitle("");
              }}
              placeholder="例如：周末参加朋友婚礼，白天户外拍照，希望自然又上镜"
              rows={4}
              value={customScene}
            />
            <small>{customScene.length} / 80</small>
          </label>
        </fieldset>

        <fieldset>
          <legend>妆容偏好 <small>单选</small></legend>
          <p>没有明确偏好时，保持“让 AI 建议”即可。</p>
          <div className="plus-makeup-options plus-makeup-options--directions">
            {REPORT_DIRECTIONS.map((option) => (
              <label key={option.value}>
                <input
                  checked={direction === option.value}
                  name="plus-makeup-direction"
                  onChange={() => {
                    setDirection(option.value);
                    setCompletedReportTitle("");
                  }}
                  type="radio"
                />
                <span><Check size={14} />{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="plus-makeup-consent">
        <label className="plus-makeup-consent-field plus-makeup-consent-field--compact">
          <input
            checked={consent}
            disabled={!faceFeatures}
            onChange={(event) => setConsent(event.target.checked)}
            type="checkbox"
          />
          <ShieldCheck size={19} />
          <div>
            <strong>我同意发送报告所需数据</strong>
            <span>照片不会发送；仅发送九项比例、场景和妆容方向。任务最多临时保存 24 小时，报告保存到本机后删除服务端副本。</span>
          </div>
        </label>
        {faceFeatures && (
          <details>
            <summary>查看将发送的九项面部比例</summary>
            <dl>
              {Object.entries(faceFeatures).map(([key, value]) => (
                <div key={key}>
                  <dt>{FEATURE_LABELS[key as keyof typeof FEATURE_LABELS]}</dt>
                  <dd>{value.toFixed(6)}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
        <p className="plus-makeup-credit-note">
          {!isAuthenticated
            ? "登录后生成，每次消耗 100 积分。"
            : <>点击生成后预占 100 积分；失败会自动退回。当前余额 <strong>{remainingPoints}</strong> 积分。</>}
        </p>

        {(loading || jobStatus === "processing") && (
          <div className="report-job-status" role="status">
            <p><LoaderCircle className="spin" size={17} /><strong>{loading ? "正在创建报告任务" : "报告正在后台生成"}</strong></p>
            <ol className="report-job-progress" aria-label="报告生成进度">
              <li className="is-complete"><Check size={14} /><span>输入与授权已确认</span></li>
              <li className="is-active"><LoaderCircle className="spin" size={14} /><span>{loading ? "创建任务并预占积分" : "等待后台生成完成"}</span></li>
              <li><span>3</span><span>完成后保存到当前设备</span></li>
            </ol>
            <small>任务创建后可以离开页面；返回时会继续读取真实状态。失败或过期会自动退回预占积分。</small>
          </div>
        )}

        {completedReportTitle && (
          <div className="report-complete-notice" role="status">
            <div><Check size={18} /><p><strong>报告已生成并保存到本机</strong><span>{completedReportTitle}</span></p></div>
            <button className="button button-secondary" onClick={onViewReports} type="button">阅读下方报告</button>
          </div>
        )}

        {isAuthenticated && remainingPoints < 100 && (
          <div className="notice notice-warning compact">
            <AlertCircle size={16} /><p>积分不足。生成完整报告需要 100 积分。<a href="/subscription">查看购买方案</a></p>
          </div>
        )}
        {error && (
          <div className="notice notice-error compact" role="alert">
            <AlertCircle size={16} /><p>{error} 如任务已经预占积分，失败或过期后会自动退回。</p>
          </div>
        )}
        {generationBlocker && isAuthenticated && remainingPoints >= 100 && !loading && jobStatus !== "processing" && (
          <p className="report-generation-requirement" role="status"><AlertCircle size={15} />{generationBlocker}</p>
        )}
        {!isAuthenticated ? (
          <a className="button button-primary plus-makeup-submit" href={loginHref}><Sparkles size={18} />登录后生成报告</a>
        ) : (
          <button
            className="button button-primary plus-makeup-submit"
            disabled={
              loading ||
              jobStatus === "processing" ||
              remainingPoints < 100 ||
              !faceFeatures ||
              !customSceneText ||
              !consent
            }
            onClick={() => void handleGenerate()}
            type="button"
          >
            {loading || jobStatus === "processing" ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
            {photoStatus === "loading"
                ? "正在分析照片"
                : !faceFeatures
                  ? "请先上传照片"
                  : loading
                    ? "正在创建任务"
                    : jobStatus === "processing"
                      ? "报告正在后台生成"
                      : "生成美妆报告"}
          </button>
        )}
      </div>
    </section>
  );
}
