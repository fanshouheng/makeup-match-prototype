import { FEATURE_KEYS, type CreatorProfile } from "./creator";
import type { FaceFeatureVector, FeatureKey } from "./faceFeatures";

export interface MatchReason {
  feature: FeatureKey;
  text: string;
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
}

const FEATURE_CONFIG: Record<FeatureKey, FeatureConfig> = {
  faceAspectRatio: {
    weight: 1.5,
    group: "face-outline",
    reason: "脸部长宽比例接近，整体轮廓更相似。",
  },
  jawToCheekRatio: {
    weight: 1.5,
    group: "jaw",
    reason: "下颌与颧骨宽度比例接近，脸部外轮廓更相似。",
  },
  foreheadToCheekRatio: {
    weight: 1.1,
    group: "upper-face",
    reason: "上庭与颧骨宽度比例接近，上半脸结构更相似。",
  },
  lowerThirdRatio: {
    weight: 0.65,
    group: "lower-face",
    reason: "下庭长度比例接近，下半脸结构更相似。",
  },
  eyeSpacingRatio: {
    weight: 1.2,
    group: "eye-spacing",
    reason: "眼间距比例接近，五官横向分布更相似。",
  },
  eyeAspectRatio: {
    weight: 0.65,
    group: "eye-shape",
    reason: "眼部长宽比例接近，眼部形态更相似。",
  },
  noseWidthRatio: {
    weight: 0.8,
    group: "nose",
    reason: "鼻翼宽度相对脸宽的比例接近。",
  },
  lipWidthRatio: {
    weight: 0.55,
    group: "lip-width",
    reason: "唇宽相对脸宽的比例接近。",
  },
  lipAspectRatio: {
    weight: 0.7,
    group: "lip-shape",
    reason: "唇部厚宽比例接近，唇部形态更相似。",
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
  for (const { feature } of [...differences].sort((left, right) => {
    const leftWeight = FEATURE_CONFIG[left.feature].weight;
    const rightWeight = FEATURE_CONFIG[right.feature].weight;
    const scoreDifference =
      left.normalizedDifference / Math.sqrt(leftWeight) -
      right.normalizedDifference / Math.sqrt(rightWeight);
    return scoreDifference || rightWeight - leftWeight;
  })) {
    const config = FEATURE_CONFIG[feature];
    if (usedGroups.has(config.group)) continue;
    usedGroups.add(config.group);
    reasons.push({
      feature,
      text: config.reason,
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
