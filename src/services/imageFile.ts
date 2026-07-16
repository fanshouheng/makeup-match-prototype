export interface LoadedImage {
  image: HTMLImageElement;
  objectUrl: string;
}

export function loadImageBlob(blob: Blob): Promise<LoadedImage> {
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();

  return new Promise((resolve, reject) => {
    image.onload = () => resolve({ image, objectUrl });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("照片无法读取，请选择 JPG、PNG 或 WebP 文件。"));
    };
    image.src = objectUrl;
  });
}
