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
import { FacePreview } from "./components/FacePreview";
import {
  extractFaceAnalysis,
  type FaceAnalysis,
} from "./domain/faceFeatures";
import { FEATURE_LABELS } from "./domain/featureLabels";
import { assessPhotoQuality, type QualityIssue } from "./domain/quality";
import { detectFace } from "./services/faceLandmarker";
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

function loadImage(file: File): Promise<LoadedPhoto> {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();

  return new Promise((resolve, reject) => {
    image.onload = () => resolve({ fileName: file.name, image, objectUrl });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("照片无法读取，请选择 JPG、PNG 或 WebP 文件。"));
    };
    image.src = objectUrl;
  });
}

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<LoadedPhoto>();
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [result, setResult] = useState<AnalysisResult>();
  const [error, setError] = useState<string>();

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.objectUrl);
    },
    [photo],
  );

  const resetAnalysis = () => {
    setResult(undefined);
    setError(undefined);
    setStatus("idle");
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
        <div>
          <p className="brand-name">妆容参照</p>
          <p className="brand-stage">特征稳定性测试</p>
        </div>
        <div className="privacy-badge">
          <ShieldCheck size={16} />
          <span>仅在本机处理</span>
        </div>
      </header>

      <main>
        <div className="page-heading">
          <div>
            <p className="eyebrow">阶段 1 / 照片分析</p>
            <h1>检查面部特征是否稳定</h1>
          </div>
          <p className="heading-note">正面、无遮挡、光线均匀</p>
        </div>

        <div className="workspace">
          <section className="photo-panel" aria-label="照片工作区">
            {photo ? (
              <>
                <FacePreview image={photo.image} landmarks={result?.landmarks} />
                <div className="photo-toolbar">
                  <div className="file-meta">
                    <span className="file-name">{photo.fileName}</span>
                    <span>
                      {photo.image.naturalWidth} × {photo.image.naturalHeight}
                    </span>
                  </div>
                  <div className="toolbar-actions">
                    <button className="button button-ghost" onClick={clearPhoto} type="button">
                      <RotateCcw size={17} />
                      重新选择
                    </button>
                    <button
                      className="button button-primary"
                      disabled={status === "loading"}
                      onClick={runAnalysis}
                      type="button"
                    >
                      {status === "loading" ? (
                        <LoaderCircle className="spin" size={17} />
                      ) : (
                        <ScanFace size={17} />
                      )}
                      {status === "loading" ? "正在分析" : "开始分析"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-upload">
                <div className="upload-icon" aria-hidden="true">
                  <ImagePlus size={29} />
                </div>
                <h2>选择一张正面照片</h2>
                <p>照片不会离开当前设备</p>
                <div className="upload-actions">
                  <button
                    className="button button-primary"
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    <ImagePlus size={17} />
                    选择照片
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={() => cameraInputRef.current?.click()}
                    type="button"
                  >
                    <Camera size={17} />
                    拍照
                  </button>
                </div>
              </div>
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
          </section>

          <aside className="result-panel" aria-live="polite">
            <div className="panel-title-row">
              <div>
                <p className="eyebrow">分析结果</p>
                <h2>照片质量与比例</h2>
              </div>
              {status === "complete" && result && (
                <span className={result.issues.length ? "status warning" : "status pass"}>
                  {result.issues.length ? "需重拍" : "可使用"}
                </span>
              )}
            </div>

            {status === "idle" && (
              <div className="result-empty">
                <ScanFace size={28} />
                <p>选择照片后开始分析</p>
              </div>
            )}

            {status === "loading" && (
              <div className="result-empty">
                <LoaderCircle className="spin" size={28} />
                <p>首次加载模型可能需要几秒</p>
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
                    <p>照片质量通过，可用于稳定性对比。</p>
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
                      环境亮度 {Math.round(result.luminance)} / 255 · 仅供照片间稳定性比较
                    </p>
                  </>
                )}
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

export default App;
