import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";
import wasmLoaderUrl from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import wasmBinaryUrl from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";
import wasmNoSimdLoaderUrl from "@mediapipe/tasks-vision/vision_wasm_nosimd_internal.js?url";
import wasmNoSimdBinaryUrl from "@mediapipe/tasks-vision/vision_wasm_nosimd_internal.wasm?url";

let landmarkerPromise: Promise<FaceLandmarker> | undefined;

async function createLandmarker(): Promise<FaceLandmarker> {
  const supportsSimd = await FilesetResolver.isSimdSupported();
  const wasmFileset = supportsSimd
    ? { wasmLoaderPath: wasmLoaderUrl, wasmBinaryPath: wasmBinaryUrl }
    : {
        wasmLoaderPath: wasmNoSimdLoaderUrl,
        wasmBinaryPath: wasmNoSimdBinaryUrl,
      };

  return FaceLandmarker.createFromOptions(wasmFileset, {
    baseOptions: {
      modelAssetPath: "/mediapipe/face_landmarker.task",
    },
    runningMode: "IMAGE",
    numFaces: 2,
    minFaceDetectionConfidence: 0.6,
    minFacePresenceConfidence: 0.6,
    minTrackingConfidence: 0.6,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
}

export function loadFaceLandmarker(): Promise<FaceLandmarker> {
  landmarkerPromise ??= createLandmarker().catch((error) => {
    landmarkerPromise = undefined;
    throw error;
  });
  return landmarkerPromise;
}

export async function detectFace(
  image: HTMLImageElement,
): Promise<FaceLandmarkerResult> {
  return (await loadFaceLandmarker()).detect(image);
}
