import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONSENT_VERSION,
  mapPublicCreatorRow,
  submitCreator,
} from "./creatorRepository";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("./supabaseClient", () => ({
  getSupabaseClient: async () => ({ functions: { invoke } }),
}));

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

describe("submitCreator", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("sends the application only through the protected edge function", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    const photo = new File(["photo"], "reference.jpg", { type: "image/jpeg" });

    await submitCreator({
      name: "示例博主",
      contactEmail: "creator@example.com",
      douyinUrl: "https://www.douyin.com/user/example",
      tutorialUrl: "",
      referencePhoto: photo,
      featureVector,
      qualityMetrics: {
        averageLuminance: 120,
        pose: {
          rollDegrees: 0,
          yawAsymmetry: 0.01,
          faceWidthInImage: 0.5,
          mouthOpenRatio: 0.01,
        },
      },
      turnstileToken: "verified-token",
    });

    expect(invoke).toHaveBeenCalledOnce();
    const [functionName, options] = invoke.mock.calls[0] as [
      string,
      { body: FormData },
    ];
    expect(functionName).toBe("submit-creator");
    expect(options.body.get("referencePhoto")).toBe(photo);
    expect(options.body.get("turnstileToken")).toBe("verified-token");
    expect(options.body.get("consentVersion")).toBe(CONSENT_VERSION);
  });
});
