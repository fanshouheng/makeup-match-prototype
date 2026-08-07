import { describe, expect, it } from "vitest";
import { isValidFaceFeatureVector } from "./faceFeatureVector";

const validVector = {
  faceAspectRatio: 1.2,
  jawToCheekRatio: 0.8,
  foreheadToCheekRatio: 0.9,
  lowerThirdRatio: 0.44,
  eyeSpacingRatio: 0.24,
  eyeAspectRatio: 3.2,
  noseWidthRatio: 0.25,
  lipWidthRatio: 0.38,
  lipAspectRatio: 0.34,
};

describe("creator face feature vectors", () => {
  it("accepts the exact bounded schema", () => {
    expect(isValidFaceFeatureVector(validVector)).toBe(true);
  });

  it("rejects missing, extra, non-finite, and out-of-range values", () => {
    const { lipAspectRatio: _removed, ...missing } = validVector;
    expect(isValidFaceFeatureVector(missing)).toBe(false);
    expect(isValidFaceFeatureVector({ ...validVector, extra: 1 })).toBe(false);
    expect(isValidFaceFeatureVector({ ...validVector, eyeAspectRatio: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isValidFaceFeatureVector({ ...validVector, faceAspectRatio: 1e100 })).toBe(false);
  });
});
