import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const modelUrl =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const expectedSha256 = "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff";
const modelPath = resolve("public/mediapipe/face_landmarker.task");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

let existing;
try {
  existing = await readFile(modelPath);
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
}
if (existing) {
  if (sha256(existing) !== expectedSha256) {
    throw new Error("Existing MediaPipe model failed SHA-256 verification");
  }
  process.exit(0);
}

await mkdir(dirname(modelPath), { recursive: true });
const response = await fetch(modelUrl);

if (!response.ok) {
  throw new Error(`MediaPipe model download failed: ${response.status}`);
}

const modelBytes = Buffer.from(await response.arrayBuffer());
if (sha256(modelBytes) !== expectedSha256) {
  throw new Error("Downloaded MediaPipe model failed SHA-256 verification");
}
await writeFile(modelPath, modelBytes);
console.log(`Downloaded MediaPipe model to ${modelPath}`);
