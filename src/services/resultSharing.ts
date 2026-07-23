import QRCode from "qrcode";
import type {
  CreatorContentFilter,
  ReferenceAudience,
} from "../domain/creator";

export const LOOK_AI_HOME_URL = "https://makeup.soul.xn--fiqs8s/";
export type MatchShareMethod = "native" | "image";

interface NativeShareSupport {
  maxTouchPoints: number;
  shareAvailable: boolean;
  viewportWidth: number;
}

interface MatchShareCopyDetails {
  contentFilter: CreatorContentFilter;
  creatorName: string;
  referenceAudience: ReferenceAudience;
}

interface MatchShareDetails extends MatchShareCopyDetails {
  creatorPhotoUrl: string;
  userPhotoUrl: string;
}

function referenceLabel(
  referenceAudience: ReferenceAudience,
  contentFilter: CreatorContentFilter,
) {
  if (referenceAudience === "women" || contentFilter === "makeup") {
    return "妆容参考";
  }
  if (contentFilter === "hair") return "发型参考";
  return "男生形象参考";
}

export function buildMatchShareText({
  contentFilter,
  creatorName,
  referenceAudience,
}: MatchShareCopyDetails) {
  return `我在 LOOK AI 找到的首选${referenceLabel(referenceAudience, contentFilter)}是「${creatorName}」。`;
}

export function shouldUseNativeShare({
  maxTouchPoints,
  shareAvailable,
  viewportWidth,
}: NativeShareSupport) {
  return shareAvailable && maxTouchPoints > 0 && viewportWidth <= 900;
}

function setFont(
  context: CanvasRenderingContext2D,
  size: number,
  weight: number,
  family = 'Arial, "Microsoft YaHei", sans-serif',
) {
  context.font = `${weight} ${size}px ${family}`;
}

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  initialSize: number,
  minimumSize: number,
  maxWidth: number,
) {
  let size = initialSize;
  setFont(context, size, 600);
  while (size > minimumSize && context.measureText(text).width > maxWidth) {
    size -= 2;
    setFont(context, size, 600);
  }
}

async function loadPosterImage(url: string) {
  if (!url) throw new Error("分享照片尚未准备好");

  const response = await fetch(url);
  if (!response.ok) throw new Error("分享照片无法读取");

  const objectUrl = URL.createObjectURL(await response.blob());
  const image = new Image();
  return new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("分享照片无法读取"));
    };
    image.src = objectUrl;
  });
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
}

function drawPhotoPanel(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  label: string,
) {
  const width = 526;
  const imageTop = 216;
  const imageHeight = 860;
  const labelTop = imageTop + imageHeight;

  drawImageCover(context, image, x, imageTop, width, imageHeight);
  context.fillStyle = "#111111";
  fitText(context, label, 29, 21, width);
  context.fillText(label, x, labelTop + 55);
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Unable to create share image"));
    }, "image/png");
  });
}

export async function createMatchSharePoster(
  details: MatchShareDetails,
): Promise<Blob> {
  await document.fonts?.ready;
  const [userPhoto, creatorPhoto] = await Promise.all([
    loadPosterImage(details.userPhotoUrl),
    loadPosterImage(details.creatorPhotoUrl),
  ]);

  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, LOOK_AI_HOME_URL, {
    color: { dark: "#111111", light: "#ffffff" },
    errorCorrectionLevel: "H",
    margin: 2,
    width: 178,
  });

  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1600;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111111";
  setFont(context, 54, 700);
  context.fillText("LOOK AI", 64, 112);

  drawPhotoPanel(context, userPhoto, 64, "用户图像");
  drawPhotoPanel(
    context,
    creatorPhoto,
    610,
    `匹配博主 · ${details.creatorName}`,
  );

  const introduction = `根据面部结构，找到更适合你的${referenceLabel(details.referenceAudience, details.contentFilter)}。`;
  setFont(context, 20, 500);
  context.fillText(introduction, 64, 1280);
  context.fillText("隐私保护 · 用户照片仅在本地处理，不上传、不保存", 64, 1320);

  context.textAlign = "right";
  setFont(context, 18, 600);
  context.fillText("扫码体验", 914, 1460);
  setFont(context, 18, 400);
  context.fillText("makeup.soul.中国", 914, 1494);
  context.textAlign = "left";

  context.drawImage(qrCanvas, 950, 1386, 178, 178);

  return canvasToBlob(canvas);
}

function downloadPoster(blob: Blob) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = "LOOK-AI-匹配结果.png";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

export async function shareMatchResult(
  details: MatchShareDetails,
): Promise<MatchShareMethod> {
  const text = buildMatchShareText(details);

  if (shouldUseNativeShare({
    maxTouchPoints: navigator.maxTouchPoints,
    shareAvailable: typeof navigator.share === "function",
    viewportWidth: window.innerWidth,
  })) {
    await navigator.share({
      title: "LOOK AI 匹配结果",
      text,
      url: LOOK_AI_HOME_URL,
    });
    return "native";
  }

  downloadPoster(await createMatchSharePoster(details));
  return "image";
}
