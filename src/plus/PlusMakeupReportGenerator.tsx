import {
  AlertCircle,
  Check,
  FileText,
  LoaderCircle,
  Palette,
  RefreshCw,
  Search,
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
  PLUS_MAKEUP_SCENES,
} from "../../supabase/functions/_shared/plusMakeupReport";

interface PlusMakeupReportGeneratorProps {
  faceFeatures: FaceFeatureVector;
  remainingCredits: number;
  onGenerated: (value: {
    createdAt: string;
    customScene: string;
    direction: PlusMakeupDirection;
    id: string;
    remainingCredits: number;
    report: PlusMakeupReport;
    scenes: PlusMakeupScene[];
  }) => Promise<void> | void;
  onCreditsChanged: (remainingCredits: number) => void;
}

export function PlusMakeupReportGenerator({
  faceFeatures,
  onGenerated,
  onCreditsChanged,
  remainingCredits,
}: PlusMakeupReportGeneratorProps) {
  const [scenes, setScenes] = useState<PlusMakeupScene[]>([]);
  const [customScene, setCustomScene] = useState("");
  const [direction, setDirection] = useState<PlusMakeupDirection>("auto");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [jobStatus, setJobStatus] = useState<PlusMakeupJobStatus | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PlusMakeupReport>();
  const onGeneratedRef = useRef(onGenerated);
  const onCreditsChangedRef = useRef(onCreditsChanged);
  const deliveringJobRef = useRef<string | undefined>(undefined);
  const customSceneText = customScene.trim();
  const selectedSceneCount = scenes.length + (customSceneText ? 1 : 0);

  useEffect(() => {
    onGeneratedRef.current = onGenerated;
    onCreditsChangedRef.current = onCreditsChanged;
  });

  const handleJobResponse = useCallback(async (response: PlusMakeupJobResponse) => {
    onCreditsChangedRef.current(response.remainingCredits);
    const job = response.job;
    if (!job) {
      setJobStatus(null);
      return;
    }
    if (job.status === "processing") {
      setJobStatus(job.status);
      return;
    }
    if (job.status === "failed") {
      setJobStatus(null);
      setError(plusMakeupJobFailureMessage(job.errorCode));
      await acknowledgePlusMakeupReportJob(job.id).catch(() => undefined);
      return;
    }
    if (!job.report || deliveringJobRef.current === job.id) return;

    deliveringJobRef.current = job.id;
    setJobStatus(job.status);
    try {
      setResult(job.report);
      await onGeneratedRef.current({
        createdAt: job.createdAt,
        customScene: job.customScene,
        direction: job.direction,
        id: job.id,
        remainingCredits: response.remainingCredits,
        report: job.report,
        scenes: job.scenes,
      });
      await acknowledgePlusMakeupReportJob(job.id);
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
    void refreshJob();
  }, [refreshJob]);

  useEffect(() => {
    if (jobStatus !== "processing") return;
    const interval = window.setInterval(() => void refreshJob(), 3_000);
    return () => window.clearInterval(interval);
  }, [jobStatus, refreshJob]);

  function toggleScene(scene: PlusMakeupScene) {
    setResult(undefined);
    setScenes((current) => current.includes(scene)
      ? current.filter((value) => value !== scene)
      : selectedSceneCount < 3
        ? [...current, scene]
        : current);
  }

  async function handleGenerate() {
    setError("");
    setLoading(true);
    try {
      const response = await startPlusMakeupReport({
        consent,
        customScene,
        direction,
        features: faceFeatures,
        scenes,
      });
      await handleJobResponse(response);
    } catch (reportError) {
      setError(reportError instanceof Error
        ? reportError.message
        : "报告暂时不可用，本次不会扣减额度。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="plus-makeup-generator" id="plus-makeup-generator" aria-labelledby="plus-makeup-generator-title">
      <div className="plus-member-section-heading plus-makeup-generator-heading">
        <div>
          <p className="eyebrow">PLUS / 专属妆造</p>
          <h2 id="plus-makeup-generator-title">生成面容报告和 3 套妆造方案</h2>
          <p>选择场景和方向。生成可在后台继续，完成后报告保存在这台设备。</p>
        </div>
      </div>

      <div className="plus-makeup-value-strip" aria-label="本次生成内容">
        <span><FileText size={17} />详细结构报告</span>
        <span><Palette size={17} />3 套可执行方案</span>
        <span><Search size={17} />公开博主名字</span>
      </div>

      <div className="plus-makeup-config">
        <fieldset>
          <legend>1. 选择使用场景 <small>已选 {selectedSceneCount} / 3</small></legend>
          <p>可以多选，也可以直接写下具体安排。</p>
          <div className="plus-makeup-options plus-makeup-options--scenes">
            {PLUS_MAKEUP_SCENES.map((scene) => (
              <label key={scene.value}>
                <input
                  checked={scenes.includes(scene.value)}
                  disabled={!scenes.includes(scene.value) && selectedSceneCount >= 3}
                  onChange={() => toggleScene(scene.value)}
                  type="checkbox"
                />
                <span><Check size={14} />{scene.label}</span>
              </label>
            ))}
          </div>
          <label className="plus-makeup-custom-scene">
            <span>直接描述场景</span>
            <textarea
              disabled={!customSceneText && scenes.length >= 3}
              maxLength={80}
              onChange={(event) => {
                setCustomScene(event.target.value);
                setResult(undefined);
              }}
              placeholder="例如：我要参加毕业典礼，希望白天仪式和晚间聚餐都能用"
              rows={3}
              value={customScene}
            />
            <small>{customScene.length} / 80</small>
          </label>
        </fieldset>

        <fieldset>
          <legend>2. 选择妆造方向</legend>
          <p>不确定就选“帮我选择”。</p>
          <div className="plus-makeup-options plus-makeup-options--directions">
            {PLUS_MAKEUP_DIRECTIONS.map((option) => (
              <label key={option.value}>
                <input
                  checked={direction === option.value}
                  name="plus-makeup-direction"
                  onChange={() => {
                    setDirection(option.value);
                    setResult(undefined);
                  }}
                  type="radio"
                />
                <span>{option.value === "auto" ? "帮我选择" : option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="plus-makeup-consent">
        <div className="plus-makeup-data-note">
          <ShieldCheck size={20} />
          <div>
            <h3>发送前由你决定</h3>
            <p>生成报告时会发送九项面部比例、场景和妆造方向；查找博主时只发送场景、方向和服务端提取的固定妆容关键词，不转发报告自由文本。不会发送照片、姓名或本地匹配结果。任务数据最多临时保存 24 小时，报告保存到本机后立即删除服务端副本。</p>
          </div>
        </div>
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
        <label className="plus-makeup-consent-field">
          <input
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            type="checkbox"
          />
          <span>我同意发送并临时保存上述信息，用于在后台生成本次报告和查找公开博主。</span>
        </label>
        <p className="plus-makeup-credit-note">
          点击生成后预占 1 次额度；失败会自动退回。当前剩余 <strong>{remainingCredits}</strong> 次。
        </p>

        {jobStatus === "processing" && (
          <div className="notice notice-info compact" role="status">
            <LoaderCircle className="spin" size={17} />
            <p>报告正在后台生成。现在可以离开页面，回来后会自动继续显示进度和结果。</p>
          </div>
        )}

        {remainingCredits <= 0 && (
          <div className="notice notice-warning compact">
            <AlertCircle size={16} /><p>体验额度已经用完，请在微信中联系运营者。</p>
          </div>
        )}
        {error && (
          <div className="notice notice-error compact" role="alert">
            <AlertCircle size={16} /><p>{error}</p>
          </div>
        )}
        <button
          className="button button-primary plus-makeup-submit"
          disabled={
            loading ||
            jobStatus === "processing" ||
            remainingCredits <= 0 ||
            selectedSceneCount === 0 ||
            !consent
          }
          onClick={() => void handleGenerate()}
          type="button"
        >
          {loading || jobStatus === "processing" ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
          {loading ? "正在创建任务" : jobStatus === "processing" ? "报告正在后台生成" : "生成我的 Plus 报告"}
        </button>
      </div>

      {result && (
        <div className="plus-makeup-result" aria-live="polite">
          <div className="plus-makeup-result-heading">
            <div><p className="eyebrow">REPORT / 妆造报告</p><h3>{result.title}</h3></div>
            <button className="button button-ghost" onClick={() => setResult(undefined)} type="button">
              <RefreshCw size={16} />调整配置
            </button>
          </div>

          <section className="plus-makeup-face-profile">
            <h4>面容结构报告</h4>
            <p>{result.faceProfile.summary}</p>
            <div>
              <div><strong>妆容重点</strong><ul>{result.faceProfile.focusAreas.map((item) => <li key={item}>{item}</li>)}</ul></div>
              <div><strong>需要现场确认</strong><ul>{result.faceProfile.limitations.map((item) => <li key={item}>{item}</li>)}</ul></div>
            </div>
          </section>

          <div className="plus-makeup-plans">
            {result.plans.map((plan, index) => (
              <article key={plan.name}>
                <header><span>方案 {index + 1}</span><h4>{plan.name}</h4><p>{plan.sceneFit}</p></header>
                <p className="plus-makeup-plan-effect">{plan.effect}</p>
                <ol>{plan.steps.map((step) => <li key={`${step.area}-${step.instruction}`}><strong>{step.area}</strong><span>{step.instruction}</span></li>)}</ol>
                <div className="plus-makeup-plan-notes">
                  <p><strong>建议准备</strong>{plan.products.join("、")}</p>
                  <p><strong>尽量避免</strong>{plan.avoid.join("、")}</p>
                </div>
              </article>
            ))}
          </div>

          <section className="plus-makeup-creators">
            <div><Search size={20} /><div><h4>按方案发现的公开美妆博主</h4><p>联网查找，仅作为待核验线索，不代表主页归属、合作或照片授权已确认。</p></div></div>
            <ol>{result.creatorNames.map((name) => <li key={name}>{name}</li>)}</ol>
          </section>
          <p className="plus-makeup-disclaimer">{result.disclaimer}</p>
        </div>
      )}
    </section>
  );
}
