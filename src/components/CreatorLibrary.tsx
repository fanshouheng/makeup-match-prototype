import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  LoaderCircle,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { CreatorProfile } from "../domain/creator";
import {
  extractFaceAnalysis,
  type FaceAnalysis,
} from "../domain/faceFeatures";
import { assessPhotoQuality, type QualityIssue } from "../domain/quality";
import {
  listCreators,
  submitCreator,
} from "../services/creatorRepository";
import { detectFace } from "../services/faceLandmarker";
import { loadImageBlob, type LoadedImage } from "../services/imageFile";
import { measureAverageLuminance } from "../services/imageQuality";
import { hasSupabaseConfig } from "../services/supabaseClient";
import { CreatorPhoto } from "./CreatorPhoto";
import { FacePreview } from "./FacePreview";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function isDouyinUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "douyin.com" || url.hostname.endsWith(".douyin.com"))
    );
  } catch {
    return false;
  }
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

interface AnalyzedPhoto {
  file: File;
  analysis: FaceAnalysis;
  luminance: number;
}

function SubmissionModal({ onClose }: { onClose: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [douyinUrl, setDouyinUrl] = useState("");
  const [tutorialUrl, setTutorialUrl] = useState("");
  const [consent, setConsent] = useState(false);
  const [loadedImage, setLoadedImage] = useState<LoadedImage>();
  const [landmarks, setLandmarks] = useState<NormalizedLandmark[]>();
  const [analyzedPhoto, setAnalyzedPhoto] = useState<AnalyzedPhoto>();
  const [issues, setIssues] = useState<QualityIssue[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(
    () => () => {
      if (loadedImage) URL.revokeObjectURL(loadedImage.objectUrl);
    },
    [loadedImage],
  );

  const analyzePhoto = async (file: File) => {
    setAnalyzing(true);
    setError(undefined);
    setIssues([]);
    setAnalyzedPhoto(undefined);
    setLandmarks(undefined);

    if (file.size > MAX_PHOTO_BYTES) {
      setError("照片不能超过 5 MB。");
      setAnalyzing(false);
      return;
    }

    try {
      const nextImage = await loadImageBlob(file);
      setLoadedImage(nextImage);
      const detection = await detectFace(nextImage.image);
      const faceCount = detection.faceLandmarks.length;
      const faceLandmarks = faceCount === 1 ? detection.faceLandmarks[0] : undefined;
      const luminance = measureAverageLuminance(nextImage.image, faceLandmarks);
      const analysis = faceLandmarks
        ? extractFaceAnalysis(faceLandmarks, {
            width: nextImage.image.naturalWidth,
            height: nextImage.image.naturalHeight,
          })
        : undefined;
      const qualityIssues = assessPhotoQuality({
        faceCount,
        averageLuminance: luminance,
        pose: analysis?.pose,
      });

      setLandmarks(analysis ? faceLandmarks : undefined);
      setIssues(qualityIssues);
      if (analysis && qualityIssues.length === 0) {
        setAnalyzedPhoto({ file, analysis, luminance });
      }
    } catch (photoError) {
      console.error(photoError);
      setError("照片分析失败，请换一张清晰正脸照。");
    } finally {
      setAnalyzing(false);
    }
  };

  const handlePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void analyzePhoto(file);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);

    if (!name.trim()) return setError("请填写博主名称。");
    if (!isEmail(contactEmail.trim())) return setError("请填写有效的联系邮箱。");
    if (!isDouyinUrl(douyinUrl.trim())) return setError("请填写有效的抖音主页链接。");
    if (tutorialUrl.trim() && !isDouyinUrl(tutorialUrl.trim())) {
      return setError("代表教程需要填写抖音链接。");
    }
    if (!analyzedPhoto) return setError("请上传一张通过质量检查的本人正脸照。");
    if (!consent) return setError("请确认授权与公开展示声明。");
    if (!hasSupabaseConfig) return setError("当前部署尚未连接公开博主库，暂时无法提交。");

    setSubmitting(true);
    try {
      await submitCreator({
        name: name.trim(),
        contactEmail: contactEmail.trim(),
        douyinUrl: douyinUrl.trim(),
        tutorialUrl: tutorialUrl.trim(),
        referencePhoto: analyzedPhoto.file,
        featureVector: analyzedPhoto.analysis.features,
        qualityMetrics: {
          averageLuminance: analyzedPhoto.luminance,
          pose: analyzedPhoto.analysis.pose,
        },
      });
      setSubmitted(true);
    } catch (submitError) {
      console.error(submitError);
      setError("提交失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <section className="creator-modal" role="dialog" aria-modal="true" aria-label="申请加入博主库">
        <div className="modal-header">
          <div>
            <p className="eyebrow">博主本人申请</p>
            <h2>申请加入公开博主库</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="关闭">
            <X size={19} />
          </button>
        </div>

        {submitted ? (
          <div className="submission-success">
            <CheckCircle2 size={36} />
            <h3>申请已提交</h3>
            <p>资料不会立即公开。我们会先通过联系邮箱核验主页归属，审核通过后再加入匹配。</p>
            <button className="button button-primary" onClick={onClose} type="button">完成</button>
          </div>
        ) : (
          <form className="creator-form" onSubmit={handleSubmit}>
            <div className="reference-photo-field">
              {loadedImage ? (
                <FacePreview image={loadedImage.image} landmarks={landmarks} />
              ) : (
                <div className="creator-photo-empty"><ImagePlus size={28} /></div>
              )}
              <button
                className="button button-secondary"
                onClick={() => fileInputRef.current?.click()}
                type="button"
                disabled={analyzing || submitting}
              >
                {analyzing ? <LoaderCircle className="spin" size={17} /> : <ImagePlus size={17} />}
                {loadedImage ? "更换正脸照" : "上传本人正脸照"}
              </button>
              <input
                ref={fileInputRef}
                className="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhoto}
              />
              <p className="photo-requirement">JPG、PNG 或 WebP，最大 5 MB。请使用正面、无遮挡、光线均匀的照片。</p>
              {issues.map((issue) => (
                <div className="notice notice-warning compact" key={issue.code}>
                  <AlertCircle size={16} />
                  <p>{issue.message}</p>
                </div>
              ))}
              {analyzedPhoto && !analyzing && (
                <div className="notice notice-pass compact">
                  <CheckCircle2 size={16} />
                  <p>照片质量通过</p>
                </div>
              )}
            </div>

            <div className="creator-fields">
              <label>
                <span>博主名称</span>
                <input required value={name} onChange={(event) => setName(event.target.value)} maxLength={60} />
              </label>
              <label>
                <span>联系邮箱</span>
                <input required type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} maxLength={320} placeholder="仅用于身份核验，不会公开" />
              </label>
              <label>
                <span>抖音主页</span>
                <input required value={douyinUrl} onChange={(event) => setDouyinUrl(event.target.value)} inputMode="url" placeholder="https://www.douyin.com/user/..." />
              </label>
              <label>
                <span>代表教程 <small>选填</small></span>
                <input value={tutorialUrl} onChange={(event) => setTutorialUrl(event.target.value)} inputMode="url" placeholder="https://www.douyin.com/video/..." />
              </label>
              <label className="consent-field">
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                <span>我确认本人为该主页博主或已获得明确授权，并同意将此照片及提取的面部特征用于公开相似匹配。</span>
              </label>
              {!hasSupabaseConfig && (
                <div className="notice notice-warning compact">
                  <AlertCircle size={16} />
                  <p>当前部署尚未连接公开博主库，可以预览申请流程，但不能提交。</p>
                </div>
              )}
              {error && (
                <div className="notice notice-error form-error">
                  <AlertCircle size={17} />
                  <p>{error}</p>
                </div>
              )}
              <div className="form-actions">
                <button className="button button-ghost" onClick={onClose} type="button">取消</button>
                <button className="button button-primary" disabled={analyzing || submitting} type="submit">
                  {submitting && <LoaderCircle className="spin" size={17} />}
                  {submitting ? "正在提交" : "提交审核"}
                </button>
              </div>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

export function CreatorLibrary() {
  const [creators, setCreators] = useState<CreatorProfile[]>([]);
  const [loading, setLoading] = useState(hasSupabaseConfig);
  const [showSubmission, setShowSubmission] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    let active = true;
    listCreators()
      .then((items) => {
        if (active) setCreators(items);
      })
      .catch((loadError) => {
        console.error(loadError);
        if (active) setError("公开博主库读取失败，请稍后重试。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="creator-page">
      <div className="page-heading creator-heading">
        <div>
          <p className="eyebrow">公开资料</p>
          <h1>公开博主库</h1>
        </div>
        <button className="button button-primary" onClick={() => setShowSubmission(true)} type="button">
          <Plus size={17} />
          申请入库
        </button>
      </div>

      {!hasSupabaseConfig && (
        <div className="notice notice-warning library-error">
          <AlertCircle size={17} />
          <p>当前部署尚未连接 Supabase，公开博主资料暂不可用。</p>
        </div>
      )}
      {error && (
        <div className="notice notice-error library-error">
          <AlertCircle size={17} />
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="library-empty"><LoaderCircle className="spin" size={28} /></div>
      ) : creators.length === 0 ? (
        <div className="library-empty">
          <ShieldCheck size={30} />
          <h2>还没有审核通过的博主</h2>
          <p>博主本人提交并完成身份核验后，资料才会在这里公开。</p>
          <button className="button button-primary" onClick={() => setShowSubmission(true)} type="button">
            <Plus size={17} />
            申请入库
          </button>
        </div>
      ) : (
        <>
          <div className="creator-summary"><span>{creators.length} 位已审核博主</span></div>
          <div className="creator-grid">
            {creators.map((creator) => (
              <article className="creator-card" key={creator.id}>
                <div className="creator-card-photo"><CreatorPhoto creator={creator} /></div>
                <div className="creator-card-body">
                  <div className="creator-card-title"><h2>{creator.name}</h2></div>
                  <div className="creator-links">
                    <a href={creator.douyinUrl} target="_blank" rel="noreferrer">抖音主页 <ExternalLink size={14} /></a>
                    {creator.tutorialUrl && <a href={creator.tutorialUrl} target="_blank" rel="noreferrer">代表教程 <ExternalLink size={14} /></a>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {showSubmission && <SubmissionModal onClose={() => setShowSubmission(false)} />}
    </main>
  );
}
