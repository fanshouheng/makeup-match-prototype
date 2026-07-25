import { describe, expect, it } from "vitest";
import type { FaceFeatureVector } from "../domain/faceFeatures";
import { buildMaleFaceReportRequest } from "./maleFaceReport";

const features: FaceFeatureVector = {
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

describe("buildMaleFaceReportRequest", () => {
  it("stops before building a network payload without explicit consent", () => {
    expect(() => buildMaleFaceReportRequest({
      consent: false,
      features,
      mode: "roast",
      style: "internet_bestie",
      turnstileToken: "token",
    })).toThrow("请先同意");
  });

  it("includes the exact nine ratios but no photo or user identifier", () => {
    const request = buildMaleFaceReportRequest({
      consent: true,
      features: { ...features, faceAspectRatio: 1.23456789 },
      mode: "praise",
      style: "fashion_editor",
      turnstileToken: "token",
    });

    expect(request.features).toEqual({ ...features, faceAspectRatio: 1.234568 });
    expect(Object.keys(request.features)).toHaveLength(9);
    expect(request).not.toHaveProperty("photo");
    expect(request).not.toHaveProperty("sessionId");
    expect(request).not.toHaveProperty("userId");
  });
});
