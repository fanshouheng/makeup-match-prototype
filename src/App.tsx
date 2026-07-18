import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ImagePlus,
  LoaderCircle,
  RotateCcw,
  ScanFace,
  ShieldCheck,
} from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { CreatorLibrary } from "./components/CreatorLibrary";
import { FacePreview } from "./components/FacePreview";
import { MatchResults } from "./components/MatchResults";
import { PrivacyPolicy } from "./components/PrivacyPolicy";
import {
  extractFaceAnalysis,
  type FaceAnalysis,
} from "./domain/faceFeatures";
import { FEATURE_LABELS } from "./domain/featureLabels";
import { rankCreators, type CreatorMatch } from "./domain/matching";
import { assessPhotoQuality, type QualityIssue } from "./domain/quality";
import { listCreators } from "./services/creatorRepository";
import { detectFace } from "./services/faceLandmarker";
import { loadImageBlob } from "./services/imageFile";
import { measureAverageLuminance } from "./services/imageQuality";

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
type AppView = "analysis" | "creators" | "privacy";

function initialView(): AppView {
  return window.location.hash === "#privacy" ? "privacy" : "analysis";
}

function loadImage(file: File): Promise<LoadedPhoto> {
  return loadImageBlob(file).then(({ image, objectUrl }) => ({
    fileName: file.name,
    image,
    objectUrl,
  }));
}

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<LoadedPhoto>();
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [result, setResult] = useState<AnalysisResult>();
  const [error, setError] = useState<string>();
  const [view, setView] = useState<AppView>(initialView);
  const [matches, setMatches] = useState<CreatorMatch[]>();
  const [creatorsCount, setCreatorsCount] = useState(0);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState<string>();

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.objectUrl);
    },
    [photo],
  );

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
    listCreators()
      .then((creators) => {
        if (!active) return;
        setCreatorsCount(creators.length);
        setMatches(rankCreators(result.analysis!.features, creators));
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
  }, [result, status, view]);

  const resetAnalysis = () => {
    setResult(undefined);
    setError(undefined);
    setStatus("idle");
    setMatches(undefined);
    setCreatorsCount(0);
    setMatching(false);
    setMatchError(undefined);
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

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

  const navigate = (nextView: AppView) => {
    setView(nextView);
    const nextUrl =
      nextView === "privacy"
        ? "#privacy"
        : `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, "", nextUrl);
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
      const analysis =
        landmarks
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

      setResult({
        analysis,
        issues,
        landmarks: analysis ? landmarks : undefined,
        luminance,
      });
      setStatus("complete");
    } catch (analysisError) {
      console.error(analysisError);
      setError("分析组件加载失败，请刷新页面后重试。");
      setStatus("error");
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">
          <ScanFace size={21} />
        </div>
        <div className="brand-copy">
          <p className="brand-name">妆容参照</p>
          <p className="brand-stage">找到适合你的美妆参照</p>
        </div>
        <nav className="topnav" aria-label="主要页面">
          <button
            className={view === "analysis" ? "active" : ""}
            onClick={() => navigate("analysis")}
            type="button"
          >
            开始匹配
          </button>
          <button
            className={view === "creators" ? "active" : ""}
            onClick={() => navigate("creators")}
            type="button"
          >
            博主库
          </button>
          <button
            className={view === "privacy" ? "active" : ""}
            onClick={() => navigate("privacy")}
            type="button"
          >
            隐私
          </button>
        </nav>
        <div className="privacy-badge">
          <ShieldCheck size={16} />
          <span>匹配照片仅在本机处理</span>
        </div>
      </header>

      {view === "analysis" ? (
        <main className="analysis-page">
          {!photo ? (
            <section className="upload-hero" aria-labelledby="upload-title">
              <div className="upload-hero-icon" aria-hidden="true">
                <ScanFace size={30} />
              </div>
              <p className="eyebrow">你的妆容参照，从相似面部结构开始</p>
              <h1 id="upload-title">找到更适合你参考的美妆博主</h1>
              <p className="upload-hero-copy">
                上传一张正面照片，我们会在本机分析面部结构，并从公开博主库中寻找更接近的参照。
              </p>
              <div className="upload-actions">
                <button
                  className="button button-primary upload-primary"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <ImagePlus size={18} />
                  选择照片
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => cameraInputRef.current?.click()}
                  type="button"
                >
                  <Camera size={18} />
                  拍照
                </button>
              </div>
              <div className="photo-guidance" aria-label="照片要求">
                <span>正面拍摄</span>
                <span>无遮挡</span>
                <span>光线均匀</span>
              </div>
              <p className="local-note"><ShieldCheck size={15} />照片仅在当前设备处理</p>
            </section>
          ) : (
            <>
              <div className="analysis-heading">
                <div>
                  <p className="eyebrow">{status === "complete" ? "面部结构分析" : "照片已准备好"}</p>
                  <h1>{status === "complete" ? "你的个人分析" : "确认照片，开始寻找妆容参照"}</h1>
                </div>
                <button className="button button-ghost" onClick={clearPhoto} type="button">
                  <RotateCcw size={17} />
                  重新选择
                </button>
              </div>

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
                      {status === "loading" ? <LoaderCircle className="spin" size={17} /> : <ScanFace size={17} />}
                      {status === "loading" ? "正在分析" : status === "complete" ? "重新分析" : "开始分析"}
                    </button>
                  </div>
                </div>

                <aside className="result-panel" aria-live="polite">
                  <div className="panel-title-row">
                    <div>
                      <p className="eyebrow">专业数据</p>
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
                      <ScanFace size={27} />
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
                          <p>照片质量通过，已开始匹配相似博主。</p>
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
                </aside>
              </section>

              {status === "complete" && result?.analysis && result.issues.length === 0 && (
                matching && !matches ? (
                  <section className="matches-loading" aria-live="polite">
                    <LoaderCircle className="spin" size={24} />
                    <p>正在比较公开博主库</p>
                  </section>
                ) : matchError ? (
                  <div className="notice notice-error matches-error">
                    <AlertCircle size={18} />
                    <p>{matchError}</p>
                  </div>
                ) : matches ? (
                  <MatchResults
                    creatorsCount={creatorsCount}
                    matches={matches}
                    onViewCreators={() => navigate("creators")}
                  />
                ) : null
              )}
            </>
          )}

          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFile}
          />
          <input
            ref={cameraInputRef}
            className="visually-hidden"
            type="file"
            accept="image/*"
            capture="user"
            onChange={handleFile}
          />
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
