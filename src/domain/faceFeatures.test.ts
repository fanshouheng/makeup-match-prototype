import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";
import { extractFaceAnalysis } from "./faceFeatures";

function createFace(): NormalizedLandmark[] {
  const points = Array.from({ length: 478 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1,
  }));
  const set = (index: number, x: number, y: number) => {
    points[index] = { x, y, z: 0, visibility: 1 };
  };

  set(10, 0.5, 0.1);
  set(152, 0.5, 0.9);
  set(234, 0.2, 0.5);
  set(454, 0.8, 0.5);
  set(172, 0.27, 0.75);
  set(397, 0.73, 0.75);
  set(127, 0.25, 0.25);
  set(356, 0.75, 0.25);
  set(1, 0.5, 0.5);
  set(2, 0.5, 0.62);
  set(98, 0.43, 0.56);
  set(327, 0.57, 0.56);
  set(33, 0.3, 0.4);
  set(133, 0.44, 0.4);
  set(362, 0.56, 0.4);
  set(263, 0.7, 0.4);
  set(159, 0.37, 0.385);
  set(145, 0.37, 0.425);
  set(386, 0.63, 0.385);
  set(374, 0.63, 0.425);
  set(61, 0.38, 0.7);
  set(291, 0.62, 0.7);
  set(13, 0.5, 0.685);
  set(14, 0.5, 0.725);

  return points;
}

function transform(
  points: NormalizedLandmark[],
  angle: number,
  scale: number,
): NormalizedLandmark[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return points.map(({ x, y, z }) => ({
    x: (x - 0.5) * scale * cos - (y - 0.5) * scale * sin + 0.45,
    y: (x - 0.5) * scale * sin + (y - 0.5) * scale * cos + 0.55,
    z: z * scale,
    visibility: 1,
  }));
}

describe("extractFaceAnalysis", () => {
  it("calculates interpretable ratios from normalized landmarks", () => {
    const result = extractFaceAnalysis(createFace());

    expect(result.features.faceAspectRatio).toBeCloseTo(4 / 3);
    expect(result.features.jawToCheekRatio).toBeCloseTo(0.46 / 0.6);
    expect(result.features.eyeSpacingRatio).toBeCloseTo(0.12 / 0.6);
    expect(result.pose.rollDegrees).toBeCloseTo(0);
  });

  it("keeps feature ratios stable after rotation, translation, and scaling", () => {
    const original = extractFaceAnalysis(createFace());
    const transformed = extractFaceAnalysis(transform(createFace(), 0.13, 0.78));

    for (const key of Object.keys(original.features) as Array<
      keyof typeof original.features
    >) {
      expect(transformed.features[key]).toBeCloseTo(original.features[key], 8);
    }
    expect(transformed.pose.rollDegrees).toBeCloseTo((0.13 * 180) / Math.PI);
  });

  it("rejects incomplete landmark data", () => {
    expect(() => extractFaceAnalysis(createFace().slice(0, 100))).toThrow(
      "面部关键点数量不足",
    );
  });
});
