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
  platform: "douyin",
  profile_url: "https://www.douyin.com/user/example",
  douyin_url: "https://www.douyin.com/user/example",
  tutorial_url: null,
  reference_audience: "women",
  content_types: ["makeup"],
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
      platform: "douyin",
      profileUrl: row.profile_url,
      tutorialUrl: "",
      referenceAudience: "women",
      contentTypes: ["makeup"],
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

  it("rejects unknown creator content directions", () => {
    expect(() =>
      mapPublicCreatorRow(
        { ...row, content_types: ["beauty-score"] },
        "https://example.com/signed-photo",
      ),
    ).toThrow("内容方向");
  });

  it("maps a Xiaohongshu creator without a legacy Douyin URL", () => {
    expect(mapPublicCreatorRow({
      ...row,
      platform: "xiaohongshu",
      profile_url: "https://www.xiaohongshu.com/user/profile/example",
      douyin_url: null,
    }, "https://example.com/signed-photo")).toMatchObject({
      platform: "xiaohongshu",
      profileUrl: "https://www.xiaohongshu.com/user/profile/example",
    });
  });

  it("falls back to the legacy Douyin URL during rolling deployment", () => {
    expect(mapPublicCreatorRow({
      ...row,
      profile_url: null,
    }, "https://example.com/signed-photo")).toMatchObject({
      platform: "douyin",
      profileUrl: row.douyin_url,
    });
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
      platform: "xiaohongshu",
      profileUrl: "https://www.xiaohongshu.com/user/profile/example",
      tutorialUrl: "",
      referenceAudience: "men",
      contentTypes: ["appearance", "hair"],
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
    expect(options.body.get("platform")).toBe("xiaohongshu");
    expect(options.body.get("profileUrl")).toBe(
      "https://www.xiaohongshu.com/user/profile/example",
    );
    expect(options.body.get("douyinUrl")).toBeNull();
    expect(options.body.get("referenceAudience")).toBe("men");
    expect(options.body.get("contentTypes")).toBe('["appearance","hair"]');
  });
});
