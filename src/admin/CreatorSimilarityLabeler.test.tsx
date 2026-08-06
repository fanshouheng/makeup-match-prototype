import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CreatorProfile } from "../domain/creator";
import type { FaceFeatureVector } from "../domain/faceFeatures";
import {
  buildSimilarityLabelingQueue,
  createSimilarityLabelDownload,
  createSimilarityLabelExport,
  CreatorSimilarityLabeler,
  type StoredSimilarityLabel,
} from "./CreatorSimilarityLabeler";

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

function creator(index: number): CreatorProfile {
  const featureVector = Object.fromEntries(
    Object.entries(baseFeatures).map(([key, value]) => [
      key,
      value + index * 0.01,
    ]),
  ) as FaceFeatureVector;
  return {
    id: `creator-${index}`,
    name: `Creator ${index}`,
    platform: "douyin",
    profileUrl: `https://www.douyin.com/user/${index}`,
    tutorialUrl: "",
    referenceAudience: "women",
    contentTypes: ["makeup"],
    referencePhotoUrl: `https://example.com/${index}.jpg`,
    featureVector,
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
  };
}

describe("buildSimilarityLabelingQueue", () => {
  it("builds a deterministic queue without self-pairs or duplicates", () => {
    const creators = Array.from({ length: 8 }, (_, index) => creator(index));
    const first = buildSimilarityLabelingQueue(creators, 20);
    const second = buildSimilarityLabelingQueue([...creators].reverse(), 20);

    expect(first.map((pair) => pair.id)).toEqual(second.map((pair) => pair.id));
    expect(new Set(first.map((pair) => pair.id)).size).toBe(first.length);
    expect(first.every((pair) => pair.left.id !== pair.right.id)).toBe(true);
  });
});

describe("similarity label export", () => {
  it("exports labels without names, photos, distances, or feature vectors", () => {
    const labels: StoredSimilarityLabel[] = [{
      pairId: "creator-1:creator-2",
      leftCreatorId: "creator-1",
      rightCreatorId: "creator-2",
      label: "similar",
      labeledAt: "2026-07-30T00:00:00.000Z",
    }];
    const payload = createSimilarityLabelExport(labels, 107);
    const serialized = JSON.stringify(payload);

    expect(payload.labels).toEqual(labels);
    expect(serialized).not.toContain("featureVector");
    expect(serialized).not.toContain("referencePhoto");
    expect(serialized).not.toContain("distance");
    expect(serialized).not.toContain("name");
  });

  it("creates a direct JSON download with a stable file name", () => {
    const labels: StoredSimilarityLabel[] = [{
      pairId: "creator-1:creator-2",
      leftCreatorId: "creator-1",
      rightCreatorId: "creator-2",
      label: "different",
      labeledAt: "2026-07-30T00:00:00.000Z",
    }];
    const download = createSimilarityLabelDownload(
      labels,
      107,
      new Date("2026-07-30T06:00:00.000Z"),
    );
    const encodedJson = download.href.split(",", 2)[1];
    const payload = JSON.parse(decodeURIComponent(encodedJson));

    expect(download.fileName).toBe("make-up-similarity-labels-2026-07-30.json");
    expect(download.href).toMatch(/^data:application\/json;charset=utf-8,/);
    expect(payload.labels).toEqual(labels);
  });
});

describe("CreatorSimilarityLabeler", () => {
  it("renders a pair without revealing creator names or algorithm distance", () => {
    const creators = [creator(0), creator(1), creator(2)];
    const html = renderToStaticMarkup(
      <CreatorSimilarityLabeler creators={creators} />,
    );

    expect(html).toContain("创作者相似度标注");
    expect(html).toContain("不像");
    expect(html).toContain("像");
    expect(html).not.toContain("Creator 0");
    expect(html).not.toContain("distance");
  });
});
