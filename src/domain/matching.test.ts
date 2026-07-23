import { describe, expect, it } from "vitest";
import type { CreatorProfile } from "./creator";
import type { FaceFeatureVector } from "./faceFeatures";
import { rankCreators } from "./matching";

const baseFeatures: FaceFeatureVector = {
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

function createCreator(
  id: string,
  featureVector: FaceFeatureVector,
): CreatorProfile {
  return {
    id,
    name: id,
    referencePhotoUrl: `https://example.com/${id}.jpg`,
    platform: "douyin",
    profileUrl: `https://www.douyin.com/user/${id}`,
    tutorialUrl: "",
    referenceAudience: "women",
    contentTypes: ["makeup"],
    featureVector,
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
  };
}

function shiftFeatures(amount: number): FaceFeatureVector {
  return Object.fromEntries(
    Object.entries(baseFeatures).map(([key, value]) => [key, value + amount]),
  ) as FaceFeatureVector;
}

describe("rankCreators", () => {
  it("sorts by weighted standardized distance and returns at most three", () => {
    const creators = [
      createCreator("far", shiftFeatures(0.3)),
      createCreator("exact", { ...baseFeatures }),
      createCreator("near", shiftFeatures(0.03)),
      createCreator("farther", shiftFeatures(0.5)),
    ];

    expect(rankCreators(baseFeatures, creators).map((match) => match.creator.id)).toEqual([
      "exact",
      "near",
      "far",
    ]);
  });

  it("keeps results invariant when a feature uses a different unit scale", () => {
    const creators = [
      createCreator("a", shiftFeatures(0.02)),
      createCreator("b", shiftFeatures(0.08)),
      createCreator("c", shiftFeatures(0.14)),
    ];
    const scaledTarget = { ...baseFeatures, eyeAspectRatio: baseFeatures.eyeAspectRatio * 100 };
    const scaledCreators = creators.map((creator) => ({
      ...creator,
      featureVector: {
        ...creator.featureVector,
        eyeAspectRatio: creator.featureVector.eyeAspectRatio * 100,
      },
    }));

    const original = rankCreators(baseFeatures, creators);
    const scaled = rankCreators(scaledTarget, scaledCreators);
    expect(scaled.map((match) => match.creator.id)).toEqual(
      original.map((match) => match.creator.id),
    );
    scaled.forEach((match, index) => {
      expect(match.distance).toBeCloseTo(original[index].distance, 10);
    });
  });

  it("handles a zero-variance library without infinite distances", () => {
    const creators = [
      createCreator("first", { ...baseFeatures }),
      createCreator("second", { ...baseFeatures }),
    ];

    const matches = rankCreators(shiftFeatures(0.05), creators);
    expect(matches.map((match) => match.creator.id)).toEqual(["first", "second"]);
    expect(matches.every((match) => Number.isFinite(match.distance))).toBe(true);
  });

  it("provides two facial-similarity explanations from different groups", () => {
    const [match] = rankCreators(baseFeatures, [
      createCreator("creator", shiftFeatures(0.02)),
    ]);

    expect(match.reasons).toHaveLength(2);
    expect(new Set(match.reasons.map((reason) => reason.feature)).size).toBe(2);
    expect(match.reasons.every((reason) => reason.text.length > 0)).toBe(true);
  });

  it("uses only face outline features for hairstyle references", () => {
    const [match] = rankCreators(
      baseFeatures,
      [createCreator("creator", shiftFeatures(0.02))],
      { profile: "hair" },
    );

    expect(match.reasons.map((reason) => reason.feature)).toContain(
      "faceAspectRatio",
    );
    expect(
      match.reasons.every((reason) =>
        [
          "faceAspectRatio",
          "jawToCheekRatio",
          "foreheadToCheekRatio",
          "lowerThirdRatio",
        ].includes(reason.feature),
      ),
    ).toBe(true);
  });
});
