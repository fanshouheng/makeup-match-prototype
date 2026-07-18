import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { useEffect, useRef } from "react";

interface FacePreviewProps {
  image: HTMLImageElement;
  landmarks?: NormalizedLandmark[];
}

export function FacePreview({ image, landmarks }: FacePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const draw = () => {
      const bounds = container.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.round(bounds.width * pixelRatio);
      canvas.height = Math.round(bounds.height * pixelRatio);
      const context = canvas.getContext("2d");
      if (!context) return;

      context.scale(pixelRatio, pixelRatio);
      context.clearRect(0, 0, bounds.width, bounds.height);

      const scale = Math.min(
        bounds.width / image.naturalWidth,
        bounds.height / image.naturalHeight,
      );
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      const x = (bounds.width - width) / 2;
      const y = (bounds.height - height) / 2;

      context.drawImage(image, x, y, width, height);

      if (landmarks) {
        context.fillStyle = "rgba(255, 255, 255, 0.88)";
        context.strokeStyle = "rgba(0, 0, 0, 0.72)";
        context.lineWidth = 0.65;
        for (const point of landmarks) {
          context.beginPath();
          context.arc(x + point.x * width, y + point.y * height, 1.45, 0, Math.PI * 2);
          context.fill();
          context.stroke();
        }
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(container);
    return () => observer.disconnect();
  }, [image, landmarks]);

  return (
    <div className="face-preview" ref={containerRef}>
      <canvas ref={canvasRef} aria-label="照片分析预览" />
    </div>
  );
}
