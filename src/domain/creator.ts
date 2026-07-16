import type { FaceFeatureVector, FeatureKey } from "./faceFeatures";

export interface CreatorProfile {
  id: string;
  name: string;
  referencePhoto: Blob;
  referencePhotoName: string;
  douyinUrl: string;
  tutorialUrl: string;
  tags: string[];
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
