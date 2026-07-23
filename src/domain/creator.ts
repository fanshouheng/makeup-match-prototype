import type { FaceFeatureVector, FeatureKey } from "./faceFeatures";

export type ReferenceAudience = "women" | "men";
export type CreatorPlatform = "douyin" | "xiaohongshu";
export type CreatorContentType = "appearance" | "hair" | "makeup";
export type CreatorContentFilter = "all" | CreatorContentType;

export const CREATOR_PLATFORMS: CreatorPlatform[] = ["douyin", "xiaohongshu"];
export const CREATOR_PLATFORM_LABELS: Record<CreatorPlatform, string> = {
  douyin: "抖音",
  xiaohongshu: "小红书",
};

const CREATOR_PLATFORM_DOMAINS: Record<CreatorPlatform, string[]> = {
  douyin: ["douyin.com"],
  xiaohongshu: ["xiaohongshu.com", "xhslink.com"],
};

export function isCreatorPlatform(value: unknown): value is CreatorPlatform {
  return value === "douyin" || value === "xiaohongshu";
}

export function isCreatorPlatformUrl(
  platform: CreatorPlatform,
  value: string,
): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      CREATOR_PLATFORM_DOMAINS[platform].some(
        (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
      )
    );
  } catch {
    return false;
  }
}

export const CREATOR_CONTENT_TYPES: CreatorContentType[] = [
  "appearance",
  "hair",
  "makeup",
];

export interface CreatorProfile {
  id: string;
  name: string;
  referencePhotoUrl: string;
  platform: CreatorPlatform;
  profileUrl: string;
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
