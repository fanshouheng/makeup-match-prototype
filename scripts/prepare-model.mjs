import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const modelUrl =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
const modelPath = resolve("public/mediapipe/face_landmarker.task");

try {
  const existing = await stat(modelPath);
  if (existing.size > 0) {
    process.exit(0);
  }
} catch {
  // The model is downloaded below when it is not present yet.
}

await mkdir(dirname(modelPath), { recursive: true });
const response = await fetch(modelUrl);

if (!response.ok) {
  throw new Error(`MediaPipe model download failed: ${response.status}`);
}

await writeFile(modelPath, Buffer.from(await response.arrayBuffer()));
console.log(`Downloaded MediaPipe model to ${modelPath}`);
