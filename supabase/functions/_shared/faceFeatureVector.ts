export const FACE_FEATURE_RANGES = {
  faceAspectRatio: [0.7, 2],
  jawToCheekRatio: [0.35, 1.2],
  foreheadToCheekRatio: [0.35, 1.3],
  lowerThirdRatio: [0.15, 0.8],
  eyeSpacingRatio: [0.08, 0.6],
  eyeAspectRatio: [1, 15],
  noseWidthRatio: [0.08, 0.6],
  lipWidthRatio: [0.1, 0.8],
  lipAspectRatio: [0.02, 0.8],
} as const;

export const FACE_FEATURE_KEYS = Object.keys(FACE_FEATURE_RANGES) as Array<
  keyof typeof FACE_FEATURE_RANGES
>;

export function isValidFaceFeatureVector(
  value: Record<string, unknown> | undefined,
): boolean {
  if (!value) return false;
  const keys = Object.keys(value).sort();
  if (keys.join("|") !== [...FACE_FEATURE_KEYS].sort().join("|")) return false;
  return FACE_FEATURE_KEYS.every((key) => {
    const feature = value[key];
    const [minimum, maximum] = FACE_FEATURE_RANGES[key];
    return typeof feature === "number" &&
      Number.isFinite(feature) &&
      feature >= minimum &&
      feature <= maximum;
  });
}
