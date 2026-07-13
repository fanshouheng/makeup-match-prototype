import { describe, expect, it } from "vitest";
import type { CreatorProfile } from "../domain/creator";
import {
  createCreatorBackup,
  parseCreatorBackup,
} from "./creatorBackup";

const creator: CreatorProfile = {
  id: "creator-1",
  name: "测试博主",
  referencePhoto: new Blob([new Uint8Array([1, 2, 3, 4])], {
    type: "image/jpeg",
  }),
  referencePhotoName: "portrait.jpg",
  douyinUrl: "https://www.douyin.com/user/test",
  tutorialUrl: "https://www.douyin.com/video/test",
  tags: ["通勤妆", "短中庭"],
  featureVector: {
    faceAspectRatio: 1.2,
    jawToCheekRatio: 0.8,
    foreheadToCheekRatio: 1,
    lowerThirdRatio: 0.44,
    eyeSpacingRatio: 0.24,
    eyeAspectRatio: 3.2,
    noseWidthRatio: 0.25,
    lipWidthRatio: 0.38,
    lipAspectRatio: 0.34,
  },
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T01:00:00.000Z",
};

describe("creator backups", () => {
  it("round-trips profiles, feature vectors, and photo blobs", async () => {
    const backup = await createCreatorBackup([creator]);
    const [restored] = await parseCreatorBackup(backup);

    expect(restored).toMatchObject({
      id: creator.id,
      name: creator.name,
      tags: creator.tags,
      featureVector: creator.featureVector,
    });
    expect(restored.referencePhoto.type).toBe("image/jpeg");
    expect(new Uint8Array(await restored.referencePhoto.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3, 4]),
    );
  });

  it("rejects unsupported backup formats", async () => {
    const invalid = new Blob([
      JSON.stringify({
        format: "makeup-match-creators",
        version: 2,
        creators: [],
      }),
    ]);

    await expect(parseCreatorBackup(invalid)).rejects.toThrow(
      "这不是受支持的博主库备份",
    );
  });
});
