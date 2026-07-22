import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import {
  AlertCircle,
  CheckCircle2,
  ImagePlus,
  LoaderCircle,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { FacePreview } from "../components/FacePreview";
import {
  extractFaceAnalysis,
  type FaceAnalysis,
} from "../domain/faceFeatures";
import { assessPhotoQuality, type QualityIssue } from "../domain/quality";
import { detectFace } from "../services/faceLandmarker";
import { loadImageBlob, type LoadedImage } from "../services/imageFile";
import { measureAverageLuminance } from "../services/imageQuality";
import type { AdminCreatorSubmissionInput } from "./adminApi";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
interface AnalyzedPhoto {
  file: File;
  analysis: FaceAnalysis;
  luminance: number;
}

function isDouyinUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "douyin.com" || url.hostname.endsWith(".douyin.com"));
  } catch {
    return false;
  }
}

export function AdminCreateSubmissionDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: AdminCreatorSubmissionInput) => Promise<void>;
}) {
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
  const [error, setError] = useState("");

  useEffect(() => () => {
    if (loadedImage) URL.revokeObjectURL(loadedImage.objectUrl);
  }, [loadedImage]);

  async function analyzePhoto(file: File) {
    setAnalyzing(true);
    setError("");
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
    } catch {
      setError("照片分析失败，请换一张清晰正脸照。");
    } finally {
      setAnalyzing(false);
    }
  }

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void analyzePhoto(file);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!name.trim()) return setError("请填写博主名称。");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) return setError("请填写有效的联系邮箱。");
    if (!isDouyinUrl(douyinUrl.trim())) return setError("请填写有效的抖音主页链接。");
    if (tutorialUrl.trim() && !isDouyinUrl(tutorialUrl.trim())) return setError("代表内容需要填写抖音链接。");
    if (!analyzedPhoto) return setError("请上传一张通过质量检查的正脸照。");
    if (!consent) return setError("请确认资料来源和授权范围。");

    setSubmitting(true);
    try {
      await onSubmit({
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
      setError(submitError instanceof Error ? submitError.message : "创建失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="creator-modal" role="dialog" aria-modal="true" aria-label="新建待审申请">
        <div className="modal-header">
          <div><p className="eyebrow">ADMIN / 授权资料代录</p><h2>新建待审申请</h2></div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="关闭"><X size={19} /></button>
        </div>
        {submitted ? (
          <div className="submission-success">
            <CheckCircle2 size={36} />
            <h3>待审申请已创建</h3>
            <p>资料仍需完成归属核验和批准，当前不会公开。</p>
            <button className="button button-primary" onClick={onClose} type="button">完成</button>
          </div>
        ) : (
          <form className="creator-form" onSubmit={handleSubmit}>
            <div className="reference-photo-field">
              {loadedImage ? <FacePreview image={loadedImage.image} landmarks={landmarks} /> : <div className="creator-photo-empty"><ImagePlus size={28} /></div>}
              <button className="button button-secondary" onClick={() => fileInputRef.current?.click()} type="button" disabled={analyzing || submitting}>
                {analyzing ? <LoaderCircle className="spin" size={17} /> : <ImagePlus size={17} />}
                {loadedImage ? "更换正脸照" : "上传授权正脸照"}
              </button>
              <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhoto} />
              <p className="photo-requirement">JPG、PNG 或 WebP，最大 5 MB。照片必须由创作者本人提供并明确授权。</p>
              {issues.map((issue) => <div className="notice notice-warning compact" key={issue.code}><AlertCircle size={16} /><p>{issue.message}</p></div>)}
              {analyzedPhoto && !analyzing && <div className="notice notice-pass compact"><CheckCircle2 size={16} /><p>照片质量通过</p></div>}
            </div>
            <div className="creator-fields">
              <label><span>博主名称</span><input required value={name} onChange={(event) => setName(event.target.value)} maxLength={60} /></label>
              <label><span>联系邮箱</span><input required type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} maxLength={320} placeholder="仅用于身份核验，不会公开" /></label>
              <label><span>抖音主页</span><input required value={douyinUrl} onChange={(event) => setDouyinUrl(event.target.value)} inputMode="url" placeholder="https://www.douyin.com/user/..." /></label>
              <label><span>代表内容 <small>选填</small></span><input value={tutorialUrl} onChange={(event) => setTutorialUrl(event.target.value)} inputMode="url" placeholder="https://www.douyin.com/video/..." /></label>
              <label className="consent-field"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>我确认资料由创作者本人提供，并已取得将照片、面部特征和内容方向用于公开相似匹配的明确授权。</span></label>
              {error && <div className="notice notice-error form-error"><AlertCircle size={17} /><p>{error}</p></div>}
              <div className="form-actions"><button className="button button-ghost" onClick={onClose} type="button">取消</button><button className="button button-primary" disabled={analyzing || submitting} type="submit">{submitting && <LoaderCircle className="spin" size={17} />}{submitting ? "正在创建" : "创建待审申请"}</button></div>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
