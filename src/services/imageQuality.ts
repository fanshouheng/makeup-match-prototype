export function measureAverageLuminance(image: HTMLImageElement): number {
  const canvas = document.createElement("canvas");
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("当前浏览器无法读取照片像素");
  }

  context.drawImage(image, 0, 0, size, size);
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
