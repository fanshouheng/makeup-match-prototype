import { describe, expect, it } from "vitest";
import { mapPublicCreatorRow } from "./creatorRepository";

const featureVector = {
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

const row = {
  id: "9d8707c9-b6ae-49fb-8ff6-02121cf5b640",
  name: "示例博主",
  douyin_url: "https://www.douyin.com/user/example",
  tutorial_url: null,
  reference_photo_path: "submissions/id/reference.jpg",
  feature_vector: featureVector,
  created_at: "2026-07-17T00:00:00.000Z",
  updated_at: "2026-07-17T00:00:00.000Z",
};

describe("mapPublicCreatorRow", () => {
  it("maps a public row without exposing private submission data", () => {
    expect(mapPublicCreatorRow(row, "https://example.com/signed-photo")).toEqual({
      id: row.id,
      name: row.name,
      referencePhotoUrl: "https://example.com/signed-photo",
      douyinUrl: row.douyin_url,
      tutorialUrl: "",
      featureVector,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  });

  it("rejects an incomplete feature vector", () => {
    expect(() =>
      mapPublicCreatorRow(
        { ...row, feature_vector: { faceAspectRatio: 1.2 } },
        "https://example.com/signed-photo",
      ),
    ).toThrow("博主特征");
  });
});
