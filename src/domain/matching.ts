import {
  FEATURE_KEYS,
  type CreatorContentFilter,
  type CreatorProfile,
  type ReferenceAudience,
} from "./creator";
import type { FaceFeatureVector, FeatureKey } from "./faceFeatures";

export type MatchProfile = "appearance" | "hair" | "makeup";

export interface MatchReason {
  feature: FeatureKey;
  text: string;
}

export interface CreatorMatch {
  creator: CreatorProfile;
  distance: number;
  reasons: MatchReason[];
}

export interface FaceSearchSuggestion {
  description: string;
  keyword: string;
}

interface FeatureConfig {
  group: string;
  reason: string;
}

const FEATURE_CONFIG: Record<FeatureKey, FeatureConfig> = {
  faceAspectRatio: {
    group: "face-outline",
    reason: "脸部长宽比例接近，整体轮廓更相似。",
  },
  jawToCheekRatio: {
    group: "jaw",
    reason: "下颌与颧骨宽度比例接近，脸部外轮廓更相似。",
  },
  foreheadToCheekRatio: {
    group: "upper-face",
    reason: "上庭与颧骨宽度比例接近，上半脸结构更相似。",
  },
  lowerThirdRatio: {
    group: "lower-face",
    reason: "下庭长度比例接近，下半脸结构更相似。",
  },
  eyeSpacingRatio: {
    group: "eye-spacing",
    reason: "眼间距比例接近，五官横向分布更相似。",
  },
  eyeAspectRatio: {
    group: "eye-shape",
    reason: "眼部长宽比例接近，眼部形态更相似。",
  },
  noseWidthRatio: {
    group: "nose",
    reason: "鼻翼宽度相对脸宽的比例接近。",
  },
  lipWidthRatio: {
    group: "lip-width",
    reason: "唇宽相对脸宽的比例接近。",
  },
  lipAspectRatio: {
    group: "lip-shape",
    reason: "唇部厚宽比例接近，唇部形态更相似。",
  },
};

const DEFAULT_FEATURE_WEIGHTS: Record<FeatureKey, number> = {
  faceAspectRatio: 1.5,
  jawToCheekRatio: 1.5,
  foreheadToCheekRatio: 1.1,
  lowerThirdRatio: 0.65,
  eyeSpacingRatio: 1.2,
  eyeAspectRatio: 0.65,
  noseWidthRatio: 0.8,
  lipWidthRatio: 0.55,
  lipAspectRatio: 0.7,
};

const FEATURE_WEIGHTS: Record<MatchProfile, Record<FeatureKey, number>> = {
  appearance: DEFAULT_FEATURE_WEIGHTS,
  makeup: DEFAULT_FEATURE_WEIGHTS,
  hair: {
    faceAspectRatio: 2,
    jawToCheekRatio: 1.8,
    foreheadToCheekRatio: 1.7,
    lowerThirdRatio: 1,
    eyeSpacingRatio: 0,
    eyeAspectRatio: 0,
    noseWidthRatio: 0,
    lipWidthRatio: 0,
    lipAspectRatio: 0,
  },
};

const MIN_RELATIVE_STANDARD_DEVIATION = 0.08;
// Distance is a weighted RMS of library-standardized feature differences.
const MAX_ACCEPTABLE_MATCH_DISTANCE = 1.15;

function describeFaceLength(value: number) {
  if (value < 1.14) {
    return { description: "面部纵向比例偏短", keyword: "短脸" };
  }
  if (value > 1.24) {
    return { description: "面部纵向比例偏修长", keyword: "长脸" };
  }
  return { description: "面部长宽比例较均衡", keyword: "均衡脸型" };
}

function describeJawWidth(value: number) {
  if (value < 0.74) {
    return { description: "下颌相对颧部更收窄", keyword: "窄下颌" };
  }
  if (value > 0.79) {
    return {
      description: "下颌与颧部宽度比较接近，外轮廓更利落",
      keyword: "宽下颌",
    };
  }
  return {
    description: "下颌与颧部宽度过渡较柔和",
    keyword: "柔和下颌线",
  };
}

export function buildFaceSearchSuggestion(
  features: FaceFeatureVector,
  referenceAudience: ReferenceAudience,
  contentFilter: CreatorContentFilter,
): FaceSearchSuggestion {
  const faceLength = describeFaceLength(features.faceAspectRatio);
  const jawWidth = describeJawWidth(features.jawToCheekRatio);
  const topic = referenceAudience === "women"
    ? "妆容"
    : contentFilter === "hair"
      ? "发型"
      : contentFilter === "makeup"
        ? "妆容"
        : "男生形象";

  return {
    description: `${faceLength.description}，${jawWidth.description}`,
    keyword: `${faceLength.keyword} ${jawWidth.keyword} ${topic}博主`,
  };
}

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
  profile: MatchProfile,
): CreatorMatch {
  const featureWeights = FEATURE_WEIGHTS[profile];
  const activeFeatures = FEATURE_KEYS.filter(
    (feature) => featureWeights[feature] > 0,
  );
  const differences = activeFeatures.map((feature) => {
    const normalizedDifference =
      Math.abs(target[feature] - creator.featureVector[feature]) /
      scales[feature];
    return { feature, normalizedDifference };
  });
  const weightTotal = activeFeatures.reduce(
    (sum, feature) => sum + featureWeights[feature],
    0,
  );
  const weightedSquaredDistance = differences.reduce(
    (sum, { feature, normalizedDifference }) =>
      sum + featureWeights[feature] * normalizedDifference ** 2,
    0,
  );

  const usedGroups = new Set<string>();
  const reasons: MatchReason[] = [];
  for (const { feature } of [...differences].sort((left, right) => {
    const leftWeight = featureWeights[left.feature];
    const rightWeight = featureWeights[right.feature];
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
  options: { limit?: number; profile?: MatchProfile } = {},
): CreatorMatch[] {
  const { limit = 3, profile = "makeup" } = options;
  if (creators.length === 0 || limit <= 0) return [];

  const scales = calculateFeatureScales(creators);
  return creators
    .map((creator, index) => ({
      ...compareCreator(target, creator, scales, profile),
      originalIndex: index,
    }))
    .filter((match) => match.distance <= MAX_ACCEPTABLE_MATCH_DISTANCE)
    .sort(
      (left, right) =>
        left.distance - right.distance || left.originalIndex - right.originalIndex,
    )
    .slice(0, limit)
    .map(({ originalIndex: _originalIndex, ...match }) => match);
}
