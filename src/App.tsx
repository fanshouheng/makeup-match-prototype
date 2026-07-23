import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { track } from "@vercel/analytics";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ImagePlus,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { CreatorLibrary } from "./components/CreatorLibrary";
import { FacePreview } from "./components/FacePreview";
import { LandingPage } from "./components/LandingPage";
import {
  MatchResults,
  type MatchFeedback,
  type MatchShareStatus,
} from "./components/MatchResults";
import { PrivacyPolicy } from "./components/PrivacyPolicy";
import { SiteHeader, type SiteView } from "./components/SiteHeader";
import type {
  CreatorContentFilter,
  CreatorProfile,
  ReferenceAudience,
} from "./domain/creator";
import { extractFaceAnalysis, type FaceAnalysis } from "./domain/faceFeatures";
import { FEATURE_LABELS } from "./domain/featureLabels";
import {
  rankCreators,
  type CreatorMatch,
  type MatchProfile,
} from "./domain/matching";
import { assessPhotoQuality, type QualityIssue } from "./domain/quality";
import { listCreators } from "./services/creatorRepository";
import { detectFace } from "./services/faceLandmarker";
import { loadImageBlob } from "./services/imageFile";
import { measureAverageLuminance } from "./services/imageQuality";
import {
  campaignSourceFromSearch,
  recordProductEvent,
} from "./services/productMetrics";
import { shareMatchResult } from "./services/resultSharing";

interface LoadedPhoto {
  fileName: string;
  image: HTMLImageElement;
  objectUrl: string;
}

interface AnalysisResult {
  analysis?: FaceAnalysis;
  issues: QualityIssue[];
  landmarks?: NormalizedLandmark[];
  luminance: number;
}

type AnalysisStatus = "idle" | "loading" | "complete" | "error";

function viewFromLocation(): SiteView {
  if (window.location.hash === "#start") return "analysis";
  if (window.location.hash === "#creator") return "creators";
  if (window.location.hash === "#privacy") return "privacy";
  return "home";
}

function loadImage(file: File): Promise<LoadedPhoto> {
  return loadImageBlob(file).then(({ image, objectUrl }) => ({
    fileName: file.name,
    image,
    objectUrl,
  }));
}

function matchMetricProperties(
  referenceAudience: ReferenceAudience,
  contentFilter: CreatorContentFilter,
  creatorsCount: number,
) {
  return {
    content_filter: contentFilter,
    creator_count: creatorsCount,
    reference_audience: referenceAudience,
  };
}

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const sceneRef = useRef<HTMLElement>(null);
  const [photo, setPhoto] = useState<LoadedPhoto>();
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [result, setResult] = useState<AnalysisResult>();
  const [error, setError] = useState<string>();
  const [view, setView] = useState<SiteView>(viewFromLocation);
  const [referenceAudience, setReferenceAudience] =
    useState<ReferenceAudience>("women");
  const [maleContentFilter, setMaleContentFilter] =
    useState<CreatorContentFilter>("all");
  const [creatorLibrary, setCreatorLibrary] = useState<CreatorProfile[]>();
  const [matches, setMatches] = useState<CreatorMatch[]>();
  const [creatorsCount, setCreatorsCount] = useState(0);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState<string>();
  const [matchFeedback, setMatchFeedback] = useState<MatchFeedback | null>(null);
  const [shareStatus, setShareStatus] = useState<MatchShareStatus>("idle");
  const trackedResultRef = useRef<
    { result: AnalysisResult; viewKey: string } | undefined
  >(undefined);
  const feedbackSubmittedRef = useRef(false);
  const sharedResultRef = useRef(false);

  const showMatchScene = Boolean(
    status === "complete" &&
    result?.analysis &&
    result.issues.length === 0 &&
    matches !== undefined,
  );

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.objectUrl);
    },
    [photo],
  );

  useEffect(() => {
    void recordProductEvent("landing_view");
    const campaignSource = campaignSourceFromSearch(window.location.search);
    if (campaignSource) track("campaign_entry", { source: campaignSource });
  }, []);

  useEffect(() => {
    const syncView = () => setView(viewFromLocation());
    window.addEventListener("popstate", syncView);
    return () => window.removeEventListener("popstate", syncView);
  }, []);

  useEffect(() => {
    if (
      view !== "analysis" ||
      status !== "complete" ||
      !result?.analysis ||
      result.issues.length > 0
    ) {
      return;
    }

    let active = true;
    setMatching(true);
    setMatchError(undefined);
    setMatches(undefined);
    setCreatorsCount(0);
    setCreatorLibrary(undefined);
    listCreators(referenceAudience)
      .then((creators) => {
        if (!active) return;
        setCreatorLibrary(creators);
      })
      .catch((loadError) => {
        console.error(loadError);
        if (active) setMatchError("无法读取公开博主库，请稍后重试。");
      })
      .finally(() => {
        if (active) setMatching(false);
      });

    return () => {
      active = false;
    };
  }, [referenceAudience, result, status, view]);

  useEffect(() => {
    if (
      view !== "analysis" ||
      status !== "complete" ||
      !result?.analysis ||
      result.issues.length > 0 ||
      !creatorLibrary
    ) {
      return;
    }

    const eligibleCreators = referenceAudience === "men" && maleContentFilter !== "all"
      ? creatorLibrary.filter((creator) =>
          creator.contentTypes.includes(maleContentFilter),
        )
      : creatorLibrary;
    const profile: MatchProfile = referenceAudience === "women"
      ? "makeup"
      : maleContentFilter === "hair"
        ? "hair"
        : maleContentFilter === "makeup"
          ? "makeup"
          : "appearance";

    setCreatorsCount(eligibleCreators.length);
    setMatches(
      rankCreators(result.analysis.features, eligibleCreators, { profile }),
    );
  }, [creatorLibrary, maleContentFilter, referenceAudience, result, status, view]);

  useEffect(() => {
    if (!showMatchScene || !result || !matches?.length) return;

    const viewKey = `${referenceAudience}:${maleContentFilter}`;
    const trackedResult = trackedResultRef.current;
    if (trackedResult?.result === result && trackedResult.viewKey === viewKey) return;

    trackedResultRef.current = { result, viewKey };
    feedbackSubmittedRef.current = false;
    sharedResultRef.current = false;
    setMatchFeedback(null);
    setShareStatus("idle");
    track(
      "match_result_view",
      matchMetricProperties(referenceAudience, maleContentFilter, creatorsCount),
    );
    void recordProductEvent("match_result_view");
  }, [creatorsCount, maleContentFilter, matches, referenceAudience, result, showMatchScene]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!showMatchScene || !scene) return;

    let frame = 0;
    const updateProgress = () => {
      frame = 0;
      const rect = scene.getBoundingClientRect();
      const stickyHeight = Math.max(window.innerHeight - 72, 560);
      const travel = Math.max(scene.offsetHeight - stickyHeight, 1);
      const progress = Math.min(Math.max(-rect.top / travel, 0), 1);
      const collapse = Math.min(progress / 0.62, 1);
      const reveal = Math.min(Math.max((progress - 0.18) / 0.58, 0), 1);
      scene.style.setProperty("--collapse", collapse.toFixed(4));
      scene.style.setProperty("--reveal", reveal.toFixed(4));
    };
    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateProgress);
    };

    updateProgress();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, [showMatchScene]);

  const resetAnalysis = () => {
    setResult(undefined);
    setError(undefined);
    setStatus("idle");
    setMatches(undefined);
    setCreatorLibrary(undefined);
    setCreatorsCount(0);
    setMatching(false);
    setMatchError(undefined);
    setMatchFeedback(null);
    setShareStatus("idle");
    trackedResultRef.current = undefined;
    feedbackSubmittedRef.current = false;
    sharedResultRef.current = false;
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    void recordProductEvent("photo_selected");
    resetAnalysis();
    try {
      const nextPhoto = await loadImage(file);
      setPhoto(nextPhoto);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "照片读取失败");
      setStatus("error");
    }
  };

  const clearPhoto = () => {
    setPhoto(undefined);
    resetAnalysis();
  };

  const toggleReferenceAudience = () => {
    setMatches(undefined);
    setCreatorLibrary(undefined);
    setCreatorsCount(0);
    setMatchError(undefined);
    setMatchFeedback(null);
    setShareStatus("idle");
    setReferenceAudience((current) => current === "women" ? "men" : "women");
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const changeMaleContentFilter = (filter: CreatorContentFilter) => {
    if (filter === maleContentFilter) return;
    setMatches(undefined);
    setCreatorsCount(0);
    setMatchFeedback(null);
    setShareStatus("idle");
    setMaleContentFilter(filter);
  };

  const submitMatchFeedback = (feedback: MatchFeedback) => {
    if (feedbackSubmittedRef.current || !matches?.length) return;

    feedbackSubmittedRef.current = true;
    setMatchFeedback(feedback);
    track("match_feedback", {
      ...matchMetricProperties(referenceAudience, maleContentFilter, creatorsCount),
      accurate: feedback === "yes",
    });
    void recordProductEvent(feedback === "yes" ? "feedback_yes" : "feedback_no");
  };

  const trackCreatorLinkClick = (destination: "profile" | "content") => {
    track("creator_link_click", {
      ...matchMetricProperties(referenceAudience, maleContentFilter, creatorsCount),
      destination,
    });
    void recordProductEvent("creator_link_clicked");
  };

  const shareCurrentResult = async () => {
    const primaryMatch = matches?.[0];
    if (!primaryMatch || !photo || shareStatus === "sharing") return;

    setShareStatus("sharing");
    try {
      const method = await shareMatchResult({
        contentFilter: maleContentFilter,
        creatorName: primaryMatch.creator.name,
        creatorPhotoUrl: primaryMatch.creator.referencePhotoUrl,
        referenceAudience,
        userPhotoUrl: photo.objectUrl,
      });
      const firstShare = !sharedResultRef.current;
      sharedResultRef.current = true;
      setShareStatus(method === "native" ? "shared" : "downloaded");
      track("match_result_share", {
        ...matchMetricProperties(referenceAudience, maleContentFilter, creatorsCount),
        first_share: firstShare,
        method,
      });
      if (firstShare) void recordProductEvent("share_succeeded");
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === "AbortError") {
        setShareStatus("idle");
        return;
      }
      console.error(shareError);
      setShareStatus("error");
    }
  };

  const navigate = (nextView: SiteView) => {
    const hash = {
      home: "",
      analysis: "#start",
      creators: "#creator",
      privacy: "#privacy",
    }[nextView];
    window.history.pushState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
    setView(nextView);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const runAnalysis = async () => {
    if (!photo) return;

    setStatus("loading");
    setError(undefined);
    setResult(undefined);

    try {
      const detection = await detectFace(photo.image);
      const faceCount = detection.faceLandmarks.length;
      const landmarks = faceCount === 1 ? detection.faceLandmarks[0] : undefined;
      const luminance = measureAverageLuminance(photo.image, landmarks);
      const analysis = landmarks
        ? extractFaceAnalysis(landmarks, {
            width: photo.image.naturalWidth,
            height: photo.image.naturalHeight,
          })
        : undefined;
      const issues = assessPhotoQuality({
        faceCount,
        averageLuminance: luminance,
        pose: analysis?.pose,
      });

      void recordProductEvent(
        analysis && issues.length === 0 ? "analysis_succeeded" : "analysis_failed",
      );

      setResult({
        analysis,
        issues,
        landmarks: analysis ? landmarks : undefined,
        luminance,
      });
      setStatus("complete");
    } catch (analysisError) {
      console.error(analysisError);
      void recordProductEvent("analysis_failed");
      setError("分析组件加载失败，请刷新页面后重试。");
      setStatus("error");
    }
  };

  const analysisWorkspace = photo && (
    <section className="analysis-workspace" aria-label="照片与面部分析">
      <div className="analysis-photo">
        <FacePreview image={photo.image} landmarks={result?.landmarks} />
        <div className="photo-toolbar">
          <div className="file-meta">
            <span className="file-name">{photo.fileName}</span>
            <span>{photo.image.naturalWidth} × {photo.image.naturalHeight}</span>
          </div>
          <button
            className="button button-primary"
            disabled={status === "loading"}
            onClick={runAnalysis}
            type="button"
          >
            {status === "loading" && <LoaderCircle className="spin" size={17} />}
            {status === "loading" ? "正在分析" : status === "complete" ? "重新分析" : "开始分析"}
          </button>
        </div>
      </div>

      <aside className="result-panel" aria-live="polite">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">ANALYSIS / 专业数据</p>
            <h2>照片质量与面部比例</h2>
          </div>
          {status === "complete" && result && (
            <span className={result.issues.length ? "status warning" : "status pass"}>
              {result.issues.length ? "建议重拍" : "分析完成"}
            </span>
          )}
        </div>

        {status === "idle" && (
          <div className="result-empty result-empty-compact">
            <p>开始后会显示面部关键点与个人比例数据</p>
          </div>
        )}
        {status === "loading" && (
          <div className="result-empty result-empty-compact">
            <LoaderCircle className="spin" size={27} />
            <p>正在识别关键点并计算面部比例</p>
            <span>首次加载分析组件可能需要几秒</span>
          </div>
        )}
        {status === "error" && error && (
          <div className="notice notice-error">
            <AlertCircle size={18} />
            <p>{error}</p>
          </div>
        )}
        {status === "complete" && result && (
          <div className="result-content">
            {result.issues.length === 0 ? (
              <div className="notice notice-pass">
                <CheckCircle2 size={18} />
                <p>
                  {referenceAudience === "men"
                    ? "照片质量通过，已开始匹配相似男生创作者。"
                    : "照片质量通过，已开始匹配相似博主。"}
                </p>
              </div>
            ) : (
              <div className="issue-list">
                {result.issues.map((issue) => (
                  <div className="notice notice-warning" key={issue.code}>
                    <AlertCircle size={18} />
                    <p>{issue.message}</p>
                  </div>
                ))}
              </div>
            )}
            {result.analysis && (
              <>
                <dl className="feature-list">
                  {Object.entries(result.analysis.features).map(([key, value]) => (
                    <div className="feature-row" key={key}>
                      <dt>{FEATURE_LABELS[key as keyof typeof FEATURE_LABELS]}</dt>
                      <dd>{value.toFixed(3)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="measurement-note">
                  环境亮度 {Math.round(result.luminance)} / 255 · 数据仅用于本次相似度计算
                </p>
              </>
            )}
          </div>
        )}
        <div className="analysis-mini-summary" aria-hidden="true">
          <span>ANALYSIS / COMPLETE</span>
          <strong>9 项面部结构数据</strong>
        </div>
      </aside>
    </section>
  );

  return (
    <div className="app-shell">
      <SiteHeader
        currentView={view}
        referenceAudience={referenceAudience}
        onNavigate={navigate}
      />

      {view === "home" ? (
        <LandingPage onStart={() => navigate("analysis")} />
      ) : view === "analysis" ? (
        <main className={`analysis-page ${referenceAudience === "men" ? "men-reference-page" : ""}`}>
          <div className="reference-mode-control">
            <button
              aria-label={referenceAudience === "women" ? "切换到男生形象参考" : "切换到女生妆容参考"}
              className="reference-mode-toggle"
              onClick={toggleReferenceAudience}
              title={referenceAudience === "women" ? "切换到男生形象参考" : "切换到女生妆容参考"}
              type="button"
            >
              <span aria-hidden="true">{referenceAudience === "women" ? "♀" : "♂"}</span>
            </button>
          </div>
          {!photo ? (
            <section className="start-upload-screen" aria-labelledby="upload-title">
              <div className="start-upload-copy">
                <p className="eyebrow">
                  {referenceAudience === "men" ? "MEN'S REFERENCE / 男生形象参考" : "START / 照片分析"}
                </p>
                <h1 id="upload-title">上传一张清晰的正面照片</h1>
                <p>
                  {referenceAudience === "men"
                    ? "从面部结构出发，寻找可以参考的男生创作者、发型和妆容内容。"
                    : "照片将占据分析主视窗。识别完成后，面部关键点和个人比例会显示在右侧。"}
                </p>
              </div>
              <div className="start-upload-stage">
                <div className="upload-stage-icon"><ImagePlus size={34} /></div>
                <div className="upload-actions">
                  <button className="button button-primary" onClick={() => fileInputRef.current?.click()} type="button">
                    <ImagePlus size={18} />选择照片
                  </button>
                  <button className="button button-secondary" onClick={() => cameraInputRef.current?.click()} type="button">
                    <Camera size={18} />拍照
                  </button>
                </div>
                <div className="photo-guidance" aria-label="照片要求">
                  <span>正面拍摄</span><span>无遮挡</span><span>光线均匀</span>
                </div>
                <p className="local-note"><ShieldCheck size={15} />照片仅在当前设备处理</p>
              </div>
            </section>
          ) : (
            <>
              <div className="analysis-heading">
                <div>
                  <p className="eyebrow">{status === "complete" ? "RESULT / 面部结构分析" : "PHOTO / 照片已准备好"}</p>
                  <h1>
                    {referenceAudience === "men"
                      ? status === "complete"
                        ? "你的男生形象参考"
                        : "确认照片，开始寻找男生形象参考"
                      : status === "complete"
                        ? "你的个人分析"
                        : "确认照片，开始寻找妆容参照"}
                  </h1>
                </div>
                <button className="button button-ghost" onClick={clearPhoto} type="button">
                  <RotateCcw size={17} />重新选择
                </button>
              </div>

              <section
                className={`analysis-scene ${showMatchScene ? "is-scrollable" : ""}`}
                ref={sceneRef}
              >
                <div className="analysis-sticky">
                  {analysisWorkspace}
                  {showMatchScene && matches && (
                    <div className="match-reveal">
                      <MatchResults
                        creatorsCount={creatorsCount}
                        feedback={matchFeedback}
                        matches={matches}
                        mode="primary"
                        referenceAudience={referenceAudience}
                        contentFilter={maleContentFilter}
                        onContentFilterChange={changeMaleContentFilter}
                        onCreatorLinkClick={trackCreatorLinkClick}
                        onFeedback={submitMatchFeedback}
                        onShare={shareCurrentResult}
                        onViewCreators={() => navigate("creators")}
                        shareStatus={shareStatus}
                      />
                    </div>
                  )}
                  {showMatchScene && (
                    <div className="scroll-cue" aria-hidden="true"><ChevronDown size={20} /></div>
                  )}
                </div>
              </section>

              {showMatchScene && matches && matches.length > 1 && (
                <MatchResults
                  creatorsCount={creatorsCount}
                  feedback={matchFeedback}
                  matches={matches}
                  mode="more"
                  referenceAudience={referenceAudience}
                  contentFilter={maleContentFilter}
                  onCreatorLinkClick={trackCreatorLinkClick}
                  onFeedback={submitMatchFeedback}
                  onShare={shareCurrentResult}
                  onViewCreators={() => navigate("creators")}
                  shareStatus={shareStatus}
                />
              )}

              {status === "complete" && result?.analysis && result.issues.length === 0 && !showMatchScene && (
                matching && !matches ? (
                  <section className="matches-loading" aria-live="polite">
                    <LoaderCircle className="spin" size={24} />
                    <p>
                      {referenceAudience === "men"
                        ? "正在比较男生创作者库"
                        : "正在比较公开博主库"}
                    </p>
                  </section>
                ) : matchError ? (
                  <div className="notice notice-error matches-error">
                    <AlertCircle size={18} /><p>{matchError}</p>
                  </div>
                ) : matches ? (
                  <MatchResults
                    creatorsCount={creatorsCount}
                    feedback={matchFeedback}
                    matches={matches}
                    referenceAudience={referenceAudience}
                    contentFilter={maleContentFilter}
                    onContentFilterChange={changeMaleContentFilter}
                    onCreatorLinkClick={trackCreatorLinkClick}
                    onFeedback={submitMatchFeedback}
                    onShare={shareCurrentResult}
                    onViewCreators={() => navigate("creators")}
                    shareStatus={shareStatus}
                  />
                ) : null
              )}
            </>
          )}

          <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} />
          <input ref={cameraInputRef} className="visually-hidden" type="file" accept="image/*" capture="user" onChange={handleFile} />
        </main>
      ) : view === "creators" ? (
        <CreatorLibrary />
      ) : (
        <PrivacyPolicy />
      )}
    </div>
  );
}

export default App;
