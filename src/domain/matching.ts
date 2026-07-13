import { FEATURE_KEYS, type CreatorProfile } from "./creator";
import type { FaceFeatureVector, FeatureKey } from "./faceFeatures";

export interface MatchReason {
  feature: FeatureKey;
  text: string;
  focus: string;
}

export interface CreatorMatch {
  creator: CreatorProfile;
  distance: number;
  reasons: MatchReason[];
}

interface FeatureConfig {
  weight: number;
  group: string;
  reason: string;
  focus: string;
}

const FEATURE_CONFIG: Record<FeatureKey, FeatureConfig> = {
  faceAspectRatio: {
    weight: 1.5,
    group: "face-outline",
    reason: "脸部长宽比例差异较小，整体轮廓走向更有参考性。",
    focus: "整体修容",
  },
  jawToCheekRatio: {
    weight: 1.5,
    group: "jaw",
    reason: "下颌与颧骨宽度比例接近，可以重点参考下颌修容。",
    focus: "下颌修容与腮红位置",
  },
  foreheadToCheekRatio: {
    weight: 1.1,
    group: "upper-face",
    reason: "上庭与颧骨宽度比例接近，眉形和额头修饰更有参考性。",
    focus: "眉形与额头修饰",
  },
  lowerThirdRatio: {
    weight: 0.65,
    group: "lower-face",
    reason: "下庭长度比例相对接近，可以参考下半脸的妆容布局。",
    focus: "下半脸妆容布局",
  },
  eyeSpacingRatio: {
    weight: 1.2,
    group: "eye-spacing",
    reason: "眼间距比例接近，眼线起点和内眼角处理更值得参考。",
    focus: "眼线起点与内眼角",
  },
  eyeAspectRatio: {
    weight: 0.65,
    group: "eye-shape",
    reason: "眼部长宽比例相对接近，可以参考眼影和眼线范围。",
    focus: "眼影与眼线范围",
  },
  noseWidthRatio: {
    weight: 0.8,
    group: "nose",
    reason: "鼻翼宽度比例相对接近，鼻影宽度更有参考性。",
    focus: "鼻影宽度",
  },
  lipWidthRatio: {
    weight: 0.55,
    group: "lip-width",
    reason: "唇宽比例相对接近，可以参考口红外扩和收窄方式。",
    focus: "唇形边界",
  },
  lipAspectRatio: {
    weight: 0.7,
    group: "lip-shape",
    reason: "唇部厚宽比例相对接近，唇妆层次更有参考性。",
    focus: "唇妆层次",
  },
};

const MIN_RELATIVE_STANDARD_DEVIATION = 0.08;

function calculateFeatureScales(
  creators: CreatorProfile[],
): FaceFeatureVector {
  return Object.fromEntries(
    FEATURE_KEYS.map((key) => {
      const values = creators.map((creator) => creator.featureVector[key]);
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance =
        values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        values.length;
      const measurementFloor = Math.max(
        Math.abs(mean) * MIN_RELATIVE_STANDARD_DEVIATION,
        Number.EPSILON,
      );
      return [key, Math.max(Math.sqrt(variance), measurementFloor)];
    }),
  ) as FaceFeatureVector;
}

function compareCreator(
  target: FaceFeatureVector,
  creator: CreatorProfile,
  scales: FaceFeatureVector,
): CreatorMatch {
  const differences = FEATURE_KEYS.map((feature) => {
    const normalizedDifference =
      Math.abs(target[feature] - creator.featureVector[feature]) /
      scales[feature];
    return { feature, normalizedDifference };
  });
  const weightTotal = FEATURE_KEYS.reduce(
    (sum, feature) => sum + FEATURE_CONFIG[feature].weight,
    0,
  );
  const weightedSquaredDistance = differences.reduce(
    (sum, { feature, normalizedDifference }) =>
      sum + FEATURE_CONFIG[feature].weight * normalizedDifference ** 2,
    0,
  );

  const usedGroups = new Set<string>();
  const reasons: MatchReason[] = [];
  for (const { feature } of [...differences].sort(
    (left, right) => left.normalizedDifference - right.normalizedDifference,
  )) {
    const config = FEATURE_CONFIG[feature];
    if (usedGroups.has(config.group)) continue;
    usedGroups.add(config.group);
    reasons.push({
      feature,
      text: config.reason,
      focus: config.focus,
    });
    if (reasons.length === 2) break;
  }

  return {
    creator,
    distance: Math.sqrt(weightedSquaredDistance / weightTotal),
    reasons,
  };
}

export function rankCreators(
  target: FaceFeatureVector,
  creators: CreatorProfile[],
  limit = 3,
): CreatorMatch[] {
  if (creators.length === 0 || limit <= 0) return [];

  const scales = calculateFeatureScales(creators);
  return creators
    .map((creator, index) => ({
      ...compareCreator(target, creator, scales),
      originalIndex: index,
    }))
    .sort(
      (left, right) =>
        left.distance - right.distance || left.originalIndex - right.originalIndex,
    )
    .slice(0, limit)
    .map(({ originalIndex: _originalIndex, ...match }) => match);
}
