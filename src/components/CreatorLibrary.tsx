import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  ImagePlus,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  Upload,
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
  type FaceFeatureVector,
} from "../domain/faceFeatures";
import { assessPhotoQuality, type QualityIssue } from "../domain/quality";
import {
  createCreatorBackup,
  parseCreatorBackup,
} from "../services/creatorBackup";
import {
  clearCreators,
  deleteCreator,
  listCreators,
  replaceCreators,
  saveCreator,
} from "../services/creatorDb";
import { detectFace } from "../services/faceLandmarker";
import { loadImageBlob, type LoadedImage } from "../services/imageFile";
import { measureAverageLuminance } from "../services/imageQuality";
import { CreatorPhoto } from "./CreatorPhoto";
import { FacePreview } from "./FacePreview";

function isWebUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

interface CreatorFormProps {
  creator?: CreatorProfile;
  onCancel: () => void;
  onSaved: () => void;
}

function CreatorForm({ creator, onCancel, onSaved }: CreatorFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(creator?.name ?? "");
  const [douyinUrl, setDouyinUrl] = useState(creator?.douyinUrl ?? "");
  const [tutorialUrl, setTutorialUrl] = useState(creator?.tutorialUrl ?? "");
  const [tags, setTags] = useState(creator?.tags.join("、") ?? "");
  const [photo, setPhoto] = useState<Blob | undefined>(creator?.referencePhoto);
  const [photoName, setPhotoName] = useState(creator?.referencePhotoName ?? "");
  const [loadedImage, setLoadedImage] = useState<LoadedImage>();
  const [landmarks, setLandmarks] = useState<NormalizedLandmark[]>();
  const [features, setFeatures] = useState<FaceFeatureVector | undefined>(
    creator?.featureVector,
  );
  const [issues, setIssues] = useState<QualityIssue[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!creator) return;
    let active = true;
    loadImageBlob(creator.referencePhoto).then((image) => {
      if (active) setLoadedImage(image);
      else URL.revokeObjectURL(image.objectUrl);
    });
    return () => {
      active = false;
    };
  }, [creator]);

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
    setFeatures(undefined);
    setLandmarks(undefined);

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

      setPhoto(file);
      setPhotoName(file.name);
      setLandmarks(analysis ? faceLandmarks : undefined);
      setFeatures(analysis?.features);
      setIssues(qualityIssues);
    } catch (photoError) {
      console.error(photoError);
      setError("参考照分析失败，请换一张照片。");
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
    if (!douyinUrl.trim() && !tutorialUrl.trim()) {
      return setError("请至少填写一个主页或教程链接。");
    }
    if (!isWebUrl(douyinUrl.trim()) || !isWebUrl(tutorialUrl.trim())) {
      return setError("链接必须以 http:// 或 https:// 开头。");
    }
    if (!photo || !features || issues.length > 0) {
      return setError("请先选择一张通过质量检查的参考照。");
    }

    const now = new Date().toISOString();
    try {
      await saveCreator({
        id: creator?.id ?? crypto.randomUUID(),
        name: name.trim(),
        referencePhoto: photo,
        referencePhotoName: photoName,
        douyinUrl: douyinUrl.trim(),
        tutorialUrl: tutorialUrl.trim(),
        tags: tags
          .split(/[、,，]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
        featureVector: features,
        createdAt: creator?.createdAt ?? now,
        updatedAt: now,
      });
      onSaved();
    } catch (saveError) {
      console.error(saveError);
      setError("本地保存失败，请检查浏览器存储权限。");
    }
  };

  return (
    <div className="modal-backdrop">
      <section className="creator-modal" role="dialog" aria-modal="true" aria-label={creator ? "编辑博主" : "添加博主"}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">博主资料</p>
            <h2>{creator ? "编辑博主" : "添加博主"}</h2>
          </div>
          <button className="icon-button" onClick={onCancel} type="button" aria-label="关闭">
            <X size={19} />
          </button>
        </div>

        <form className="creator-form" onSubmit={handleSubmit}>
          <div className="reference-photo-field">
            {loadedImage ? (
              <FacePreview image={loadedImage.image} landmarks={landmarks} />
            ) : (
              <div className="creator-photo-empty">
                <ImagePlus size={28} />
              </div>
            )}
            <button
              className="button button-secondary"
              onClick={() => fileInputRef.current?.click()}
              type="button"
              disabled={analyzing}
            >
              {analyzing ? <LoaderCircle className="spin" size={17} /> : <ImagePlus size={17} />}
              {photo ? "更换参考照" : "选择参考照"}
            </button>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhoto}
            />
            {issues.map((issue) => (
              <div className="notice notice-warning compact" key={issue.code}>
                <AlertCircle size={16} />
                <p>{issue.message}</p>
              </div>
            ))}
            {features && issues.length === 0 && !analyzing && (
              <div className="notice notice-pass compact">
                <CheckCircle2 size={16} />
                <p>参考照通过</p>
              </div>
            )}
          </div>

          <div className="creator-fields">
            <label>
              <span>博主名称</span>
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} />
            </label>
            <label>
              <span>抖音主页</span>
              <input value={douyinUrl} onChange={(event) => setDouyinUrl(event.target.value)} inputMode="url" placeholder="https://" />
            </label>
            <label>
              <span>教程链接</span>
              <input value={tutorialUrl} onChange={(event) => setTutorialUrl(event.target.value)} inputMode="url" placeholder="https://" />
            </label>
            <label>
              <span>妆容标签</span>
              <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="通勤妆、圆脸修容" />
            </label>
            {error && (
              <div className="notice notice-error form-error">
                <AlertCircle size={17} />
                <p>{error}</p>
              </div>
            )}
            <div className="form-actions">
              <button className="button button-ghost" onClick={onCancel} type="button">
                取消
              </button>
              <button className="button button-primary" disabled={analyzing} type="submit">
                保存博主
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

export function CreatorLibrary() {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [creators, setCreators] = useState<CreatorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CreatorProfile | null>();
  const [error, setError] = useState<string>();

  const refresh = async () => {
    setCreators(await listCreators());
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleDelete = async (creator: CreatorProfile) => {
    if (!window.confirm(`删除“${creator.name}”？`)) return;
    await deleteCreator(creator.id);
    await refresh();
  };

  const handleClear = async () => {
    if (!window.confirm("清空全部博主资料？此操作无法撤销。")) return;
    await clearCreators();
    await refresh();
  };

  const handleExport = async () => {
    const backup = await createCreatorBackup(creators);
    const url = URL.createObjectURL(backup);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `妆容参照-博主库-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(undefined);
    try {
      const imported = await parseCreatorBackup(file);
      if (!window.confirm(`导入 ${imported.length} 位博主并替换当前博主库？`)) return;
      await replaceCreators(imported);
      await refresh();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "备份导入失败");
    }
  };

  return (
    <main className="creator-page">
      <div className="page-heading creator-heading">
        <div>
          <p className="eyebrow">阶段 2 / 本地资料</p>
          <h1>博主库</h1>
        </div>
        <div className="creator-actions">
          <button className="button button-ghost" disabled={!creators.length} onClick={handleExport} type="button">
            <Download size={17} />
            导出
          </button>
          <button className="button button-ghost" onClick={() => importInputRef.current?.click()} type="button">
            <Upload size={17} />
            导入
          </button>
          <button className="button button-primary" onClick={() => setEditing(null)} type="button">
            <Plus size={17} />
            添加博主
          </button>
          <input ref={importInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={handleImport} />
        </div>
      </div>

      {error && (
        <div className="notice notice-error library-error">
          <AlertCircle size={17} />
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="library-empty">
          <LoaderCircle className="spin" size={28} />
        </div>
      ) : creators.length === 0 ? (
        <div className="library-empty">
          <ImagePlus size={30} />
          <h2>还没有博主资料</h2>
          <button className="button button-primary" onClick={() => setEditing(null)} type="button">
            <Plus size={17} />
            添加博主
          </button>
        </div>
      ) : (
        <>
          <div className="creator-summary">
            <span>{creators.length} 位博主</span>
            <button className="text-danger" onClick={handleClear} type="button">清空博主库</button>
          </div>
          <div className="creator-grid">
            {creators.map((creator) => (
              <article className="creator-card" key={creator.id}>
                <div className="creator-card-photo"><CreatorPhoto creator={creator} /></div>
                <div className="creator-card-body">
                  <div className="creator-card-title">
                    <h2>{creator.name}</h2>
                    <div className="card-tools">
                      <button className="icon-button" onClick={() => setEditing(creator)} type="button" aria-label={`编辑${creator.name}`}><Pencil size={16} /></button>
                      <button className="icon-button danger" onClick={() => void handleDelete(creator)} type="button" aria-label={`删除${creator.name}`}><Trash2 size={16} /></button>
                    </div>
                  </div>
                  {creator.tags.length > 0 && <p className="creator-tags">{creator.tags.join(" · ")}</p>}
                  <div className="creator-links">
                    {creator.douyinUrl && <a href={creator.douyinUrl} target="_blank" rel="noreferrer">主页 <ExternalLink size={14} /></a>}
                    {creator.tutorialUrl && <a href={creator.tutorialUrl} target="_blank" rel="noreferrer">教程 <ExternalLink size={14} /></a>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {editing !== undefined && (
        <CreatorForm
          creator={editing ?? undefined}
          onCancel={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            void refresh();
          }}
        />
      )}
    </main>
  );
}
