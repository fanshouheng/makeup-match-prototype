import { describe, expect, it } from "vitest";
import { assessPhotoQuality } from "./quality";

const goodPose = {
  rollDegrees: 2,
  yawAsymmetry: 0.04,
  faceWidthInImage: 0.5,
  mouthOpenRatio: 0.01,
};

describe("assessPhotoQuality", () => {
  it("accepts a bright, frontal, single-face photo", () => {
    expect(
      assessPhotoQuality({
        faceCount: 1,
        averageLuminance: 130,
        pose: goodPose,
      }),
    ).toEqual([]);
  });

  it("stops on missing or multiple faces", () => {
    expect(
      assessPhotoQuality({ faceCount: 0, averageLuminance: 130 }),
    ).toEqual([
      expect.objectContaining({ code: "no-face" }),
    ]);
    expect(
      assessPhotoQuality({ faceCount: 2, averageLuminance: 130 }),
    ).toEqual([
      expect.objectContaining({ code: "multiple-faces" }),
    ]);
  });

  it("reports all correctable photo issues", () => {
    const issues = assessPhotoQuality({
      faceCount: 1,
      averageLuminance: 40,
      pose: {
        rollDegrees: 14,
        yawAsymmetry: 0.22,
        faceWidthInImage: 0.2,
        mouthOpenRatio: 0.06,
      },
    });

    expect(issues.map((issue) => issue.code)).toEqual([
      "too-dark",
      "too-small",
      "tilted",
      "side-facing",
      "expressive-mouth",
    ]);
  });
});
