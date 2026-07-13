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
}

export interface FaceAnalysis {
  features: FaceFeatureVector;
  pose: PoseMetrics;
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
  upperLip: 13,
  lowerLip: 14,
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

export function normalizeLandmarks(
  landmarks: NormalizedLandmark[],
): NormalizedLandmark[] {
  if (landmarks.length < REQUIRED_LANDMARK_COUNT) {
    throw new Error("面部关键点数量不足");
  }

  const leftEye = landmarks[INDEX.leftOuterEye];
  const rightEye = landmarks[INDEX.rightOuterEye];
  const centerX = (leftEye.x + rightEye.x) / 2;
  const centerY = (leftEye.y + rightEye.y) / 2;
  const rotation = -Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const faceWidth = distance(
    landmarks[INDEX.leftCheek],
    landmarks[INDEX.rightCheek],
  );

  if (faceWidth <= Number.EPSILON) {
    throw new Error("无法确定面部宽度");
  }

  return landmarks.map((point) => {
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
): FaceAnalysis {
  if (landmarks.length < REQUIRED_LANDMARK_COUNT) {
    throw new Error("面部关键点数量不足");
  }

  const leftEye = landmarks[INDEX.leftOuterEye];
  const rightEye = landmarks[INDEX.rightOuterEye];
  const rollDegrees =
    (Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * 180) /
    Math.PI;
  const originalFaceWidth = distance(
    landmarks[INDEX.leftCheek],
    landmarks[INDEX.rightCheek],
  );
  const yawAsymmetry = safeRatio(
    Math.abs(
      distance(landmarks[INDEX.noseCenter], landmarks[INDEX.leftCheek]) -
        distance(landmarks[INDEX.noseCenter], landmarks[INDEX.rightCheek]),
    ),
    originalFaceWidth,
  );
  const points = normalizeLandmarks(landmarks);
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
        distance(points[INDEX.upperLip], points[INDEX.lowerLip]),
        lipWidth,
      ),
    },
    pose: {
      rollDegrees,
      yawAsymmetry,
      faceWidthInImage: originalFaceWidth,
    },
  };
}
