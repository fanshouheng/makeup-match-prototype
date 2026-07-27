import { describe, expect, it } from "vitest";
import type { FaceAnalysis } from "../domain/faceFeatures";
import {
  buildLocalAnalysisRecord,
  buildLocalReportRecord,
  localMemberOwnerKey,
} from "./localMemberProfile";

const analysis: FaceAnalysis = {
  features: {
    faceAspectRatio: 1.2,
    jawToCheekRatio: 0.8,
    foreheadToCheekRatio: 0.9,
    lowerThirdRatio: 0.44,
    eyeSpacingRatio: 0.24,
    eyeAspectRatio: 3.2,
    noseWidthRatio: 0.25,
    lipWidthRatio: 0.38,
    lipAspectRatio: 0.34,
  },
  pose: {
    rollDegrees: 0,
    yawAsymmetry: 0.01,
    faceWidthInImage: 0.5,
    mouthOpenRatio: 0.01,
  },
};

describe("local member profile records", () => {
  it("keeps pre-login analysis pending until a Plus account claims it", () => {
    const record = buildLocalAnalysisRecord({
      savedAt: "2026-07-27T12:00:00.000Z",
      referenceAudience: "women",
      fileName: "portrait.jpg",
      photo: new Blob(["photo"], { type: "image/jpeg" }),
      analysis,
      luminance: 128,
    });

    expect(record.ownerKey).toBe("pending");
    expect(record.analysis).toBe(analysis);
    expect(record.photo.type).toBe("image/jpeg");
  });

  it("scopes analysis and generated reports to the signed-in user", () => {
    expect(localMemberOwnerKey("user-123")).toBe("user:user-123");

    const record = buildLocalReportRecord({
      id: "report-1",
      createdAt: "2026-07-27T12:30:00.000Z",
      mode: "praise",
      style: "internet_bestie",
      report: {
        title: "示例报告",
        summary: "这是摘要。",
        observations: [],
        closing: "这是结尾。",
      },
    }, "user-123");

    expect(record.ownerKey).toBe("user:user-123");
    expect(record.id).toBe("report-1");
  });
});
