import type { FeatureKey } from "./faceFeatures";

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  faceAspectRatio: "脸部长宽比",
  jawToCheekRatio: "下颌 / 颧骨宽度",
  foreheadToCheekRatio: "上庭 / 颧骨宽度",
  lowerThirdRatio: "下庭长度占比",
  eyeSpacingRatio: "眼间距占脸宽",
  eyeAspectRatio: "双眼长宽比",
  noseWidthRatio: "鼻翼宽度占比",
  lipWidthRatio: "唇宽占比",
  lipAspectRatio: "唇厚 / 唇宽",
};
