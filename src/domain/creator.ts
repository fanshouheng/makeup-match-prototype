import type { FaceFeatureVector, FeatureKey } from "./faceFeatures";

export type ReferenceAudience = "women" | "men";
export type CreatorContentType = "appearance" | "hair" | "makeup";
export type CreatorContentFilter = "all" | CreatorContentType;

export const CREATOR_CONTENT_TYPES: CreatorContentType[] = [
  "appearance",
  "hair",
  "makeup",
];

export interface CreatorProfile {
  id: string;
  name: string;
  referencePhotoUrl: string;
  douyinUrl: string;
  tutorialUrl: string;
  referenceAudience: ReferenceAudience;
  contentTypes: CreatorContentType[];
  featureVector: FaceFeatureVector;
  createdAt: string;
  updatedAt: string;
}

export const FEATURE_KEYS: FeatureKey[] = [
  "faceAspectRatio",
  "jawToCheekRatio",
  "foreheadToCheekRatio",
  "lowerThirdRatio",
  "eyeSpacingRatio",
  "eyeAspectRatio",
  "noseWidthRatio",
  "lipWidthRatio",
  "lipAspectRatio",
];
