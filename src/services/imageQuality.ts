import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

export function measureAverageLuminance(
  image: HTMLImageElement,
  landmarks?: NormalizedLandmark[],
): number {
  const canvas = document.createElement("canvas");
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("当前浏览器无法读取照片像素");
  }

  const xs = landmarks?.map((point) => point.x) ?? [];
  const ys = landmarks?.map((point) => point.y) ?? [];
  const minX = xs.length ? Math.max(0, Math.min(...xs) - 0.03) : 0;
  const maxX = xs.length ? Math.min(1, Math.max(...xs) + 0.03) : 1;
  const minY = ys.length ? Math.max(0, Math.min(...ys) - 0.03) : 0;
  const maxY = ys.length ? Math.min(1, Math.max(...ys) + 0.03) : 1;

  context.drawImage(
    image,
    minX * image.naturalWidth,
    minY * image.naturalHeight,
    (maxX - minX) * image.naturalWidth,
    (maxY - minY) * image.naturalHeight,
    0,
    0,
    size,
    size,
  );
  const pixels = context.getImageData(0, 0, size, size).data;
  let luminance = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    luminance +=
      pixels[index] * 0.2126 +
      pixels[index + 1] * 0.7152 +
      pixels[index + 2] * 0.0722;
  }

  return luminance / (pixels.length / 4);
}
