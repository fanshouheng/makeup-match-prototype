import { describe, expect, it, vi } from "vitest";
import type { FaceFeatureVector } from "../domain/faceFeatures";
import { buildPlusMakeupReportRequest } from "./plusMakeupReport";

vi.mock("../plus/plusClient", () => ({
  plusClient: { functions: { invoke: vi.fn() } },
}));

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

describe("Plus makeup report request", () => {
  it("sends only bounded configuration and rounded face ratios", () => {
    expect(buildPlusMakeupReportRequest({
      consent: true,
      customScene: "  我要参加毕业典礼  ",
      direction: "clean",
      features: { ...features, faceAspectRatio: 1.23456789 },
      scenes: ["graduation"],
      turnstileToken: "token",
    })).toMatchObject({
      customScene: "我要参加毕业典礼",
      direction: "clean",
      features: { faceAspectRatio: 1.234568 },
      scenes: ["graduation"],
    });
  });

  it("requires consent and at least one scene", () => {
    expect(() => buildPlusMakeupReportRequest({
      consent: false,
      customScene: "",
      direction: "auto",
      features,
      scenes: [],
      turnstileToken: "token",
    })).toThrow("请先同意");
  });
});
