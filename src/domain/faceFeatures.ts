import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

export type FeatureKey =
  | "faceAspectRatio"
  | "jawToCheekRatio"
  | "foreheadToCheekRatio"
  | "lowerThirdRatio"
  | "eyeSpacingRatio"
  | "eyeAspectRatio"
  | "noseWidthRatio"
  | "lipWidthRatio"
  | "lipAspectRatio";

export type FaceFeatureVector = Record<FeatureKey, number>;

export interface PoseMetrics {
  rollDegrees: number;
  yawAsymmetry: number;
  faceWidthInImage: number;
  mouthOpenRatio: number;
}

export interface FaceAnalysis {
  features: FaceFeatureVector;
  pose: PoseMetrics;
}

export interface ImageSize {
  width: number;
  height: number;
}

type Point = Pick<NormalizedLandmark, "x" | "y">;

const INDEX = {
  top: 10,
  chin: 152,
  leftCheek: 234,
  rightCheek: 454,
  leftJaw: 172,
  rightJaw: 397,
  leftTemple: 127,
  rightTemple: 356,
  noseCenter: 1,
  noseBase: 2,
  leftNoseWing: 98,
  rightNoseWing: 327,
  leftInnerEye: 133,
  rightInnerEye: 362,
  leftOuterEye: 33,
  rightOuterEye: 263,
  leftUpperEyelid: 159,
  leftLowerEyelid: 145,
  rightUpperEyelid: 386,
  rightLowerEyelid: 374,
  leftMouth: 61,
  rightMouth: 291,
  upperOuterLip: 0,
  upperInnerLip: 13,
  lowerInnerLip: 14,
  lowerOuterLip: 17,
} as const;

const REQUIRED_LANDMARK_COUNT = 455;

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function safeRatio(numerator: number, denominator: number): number {
  if (denominator <= Number.EPSILON) {
    throw new Error("无法从重合的面部关键点计算比例");
  }
  return numerator / denominator;
}

function scaleLandmarks(
  landmarks: NormalizedLandmark[],
  imageSize: ImageSize,
): NormalizedLandmark[] {
  return landmarks.map((point) => ({
    ...point,
    x: point.x * imageSize.width,
    y: point.y * imageSize.height,
    z: point.z * imageSize.width,
  }));
}

export function normalizeLandmarks(
  landmarks: NormalizedLandmark[],
  imageSize: ImageSize,
): NormalizedLandmark[] {
  if (landmarks.length < REQUIRED_LANDMARK_COUNT) {
    throw new Error("面部关键点数量不足");
  }
  if (imageSize.width <= 0 || imageSize.height <= 0) {
    throw new Error("照片尺寸无效");
  }

  const scaledLandmarks = scaleLandmarks(landmarks, imageSize);

  const leftEye = scaledLandmarks[INDEX.leftOuterEye];
  const rightEye = scaledLandmarks[INDEX.rightOuterEye];
  const centerX = (leftEye.x + rightEye.x) / 2;
  const centerY = (leftEye.y + rightEye.y) / 2;
  const rotation = -Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const faceWidth = distance(
    scaledLandmarks[INDEX.leftCheek],
    scaledLandmarks[INDEX.rightCheek],
  );

  if (faceWidth <= Number.EPSILON) {
    throw new Error("无法确定面部宽度");
  }

  return scaledLandmarks.map((point) => {
    const x = point.x - centerX;
    const y = point.y - centerY;
    return {
      ...point,
      x: (x * cos - y * sin) / faceWidth,
      y: (x * sin + y * cos) / faceWidth,
      z: point.z / faceWidth,
    };
  });
}

export function extractFaceAnalysis(
  landmarks: NormalizedLandmark[],
  imageSize: ImageSize,
): FaceAnalysis {
  if (landmarks.length < REQUIRED_LANDMARK_COUNT) {
    throw new Error("面部关键点数量不足");
  }
  if (imageSize.width <= 0 || imageSize.height <= 0) {
    throw new Error("照片尺寸无效");
  }

  const scaledLandmarks = scaleLandmarks(landmarks, imageSize);

  const leftEye = scaledLandmarks[INDEX.leftOuterEye];
  const rightEye = scaledLandmarks[INDEX.rightOuterEye];
  const rollDegrees =
    (Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * 180) /
    Math.PI;
  const originalFaceWidth = distance(
    scaledLandmarks[INDEX.leftCheek],
    scaledLandmarks[INDEX.rightCheek],
  );
  const yawAsymmetry = safeRatio(
    Math.abs(
      distance(
        scaledLandmarks[INDEX.noseCenter],
        scaledLandmarks[INDEX.leftCheek],
      ) -
        distance(
          scaledLandmarks[INDEX.noseCenter],
          scaledLandmarks[INDEX.rightCheek],
        ),
    ),
    originalFaceWidth,
  );
  const points = normalizeLandmarks(landmarks, imageSize);
  const faceWidth = distance(points[INDEX.leftCheek], points[INDEX.rightCheek]);
  const faceLength = Math.abs(points[INDEX.chin].y - points[INDEX.top].y);
  const leftEyeWidth = distance(
    points[INDEX.leftOuterEye],
    points[INDEX.leftInnerEye],
  );
  const rightEyeWidth = distance(
    points[INDEX.rightInnerEye],
    points[INDEX.rightOuterEye],
  );
  const leftEyeHeight = distance(
    points[INDEX.leftUpperEyelid],
    points[INDEX.leftLowerEyelid],
  );
  const rightEyeHeight = distance(
    points[INDEX.rightUpperEyelid],
    points[INDEX.rightLowerEyelid],
  );
  const lipWidth = distance(points[INDEX.leftMouth], points[INDEX.rightMouth]);
  const mouthOpenRatio = safeRatio(
    distance(points[INDEX.upperInnerLip], points[INDEX.lowerInnerLip]),
    faceWidth,
  );
  const faceBoundsWidth =
    Math.max(...scaledLandmarks.map((point) => point.x)) -
    Math.min(...scaledLandmarks.map((point) => point.x));

  return {
    features: {
      faceAspectRatio: safeRatio(faceLength, faceWidth),
      jawToCheekRatio: safeRatio(
        distance(points[INDEX.leftJaw], points[INDEX.rightJaw]),
        faceWidth,
      ),
      foreheadToCheekRatio: safeRatio(
        distance(points[INDEX.leftTemple], points[INDEX.rightTemple]),
        faceWidth,
      ),
      lowerThirdRatio: safeRatio(
        Math.abs(points[INDEX.chin].y - points[INDEX.noseBase].y),
        faceLength,
      ),
      eyeSpacingRatio: safeRatio(
        distance(points[INDEX.leftInnerEye], points[INDEX.rightInnerEye]),
        faceWidth,
      ),
      eyeAspectRatio:
        (safeRatio(leftEyeWidth, leftEyeHeight) +
          safeRatio(rightEyeWidth, rightEyeHeight)) /
        2,
      noseWidthRatio: safeRatio(
        distance(points[INDEX.leftNoseWing], points[INDEX.rightNoseWing]),
        faceWidth,
      ),
      lipWidthRatio: safeRatio(lipWidth, faceWidth),
      lipAspectRatio: safeRatio(
        distance(
          points[INDEX.upperOuterLip],
          points[INDEX.upperInnerLip],
        ) +
          distance(
            points[INDEX.lowerInnerLip],
            points[INDEX.lowerOuterLip],
          ),
        lipWidth,
      ),
    },
    pose: {
      rollDegrees,
      yawAsymmetry,
      faceWidthInImage: faceBoundsWidth / imageSize.width,
      mouthOpenRatio,
    },
  };
}
