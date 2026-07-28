import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FaceFeatureVector } from "../domain/faceFeatures";
import {
  buildPlusMakeupReportRequest,
  generatePlusMakeupReport,
} from "./plusMakeupReport";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("../plus/plusClient", () => ({
  plusClient: { functions: { invoke } },
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

const report = {
  title: "毕业典礼三套妆造方案",
  faceProfile: {
    summary: "面部纵向比例清楚，适合通过眉眼重心和腮红位置调整视觉节奏。",
    focusAreas: ["眉峰位置保持舒展", "腮红向外上方衔接"],
    limitations: ["未发送照片，肤色、肤质和眼皮形态需要现场确认"],
  },
  plans: Array.from({ length: 3 }, (_, index) => ({
    name: `方案 ${index + 1}`,
    sceneFit: "适合白天仪式和合影。",
    effect: "保持干净轮廓，同时让五官在镜头中更清楚。",
    steps: ["底妆", "眉毛", "眼妆", "修容", "唇妆"].map((area) => ({
      area,
      instruction: `${area}采用轻薄、边缘干净的处理。`,
    })),
    products: ["半哑光底妆", "灰棕眉笔", "低饱和唇釉"],
    avoid: ["避免大面积高亮珠光"],
  })),
  creatorNames: ["博主甲", "博主乙"],
  disclaimer: "本报告由 AI 基于面部比例生成，仅作妆容参考。",
};

const input = {
  consent: true,
  customScene: "我要参加毕业典礼",
  direction: "clean" as const,
  features,
  scenes: ["graduation" as const],
  turnstileToken: "test-turnstile-token",
};

describe("Plus makeup report request", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

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

  it("invokes the Edge Function and validates a complete response", async () => {
    invoke.mockResolvedValueOnce({
      data: { report, remainingCredits: 2 },
      error: null,
    });

    await expect(generatePlusMakeupReport(input)).resolves.toEqual({
      report,
      remainingCredits: 2,
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("plus-makeup-report", {
      body: expect.objectContaining({
        consentVersion: "2026-07-27",
        customScene: "我要参加毕业典礼",
        direction: "clean",
        features,
        scenes: ["graduation"],
        turnstileToken: "test-turnstile-token",
      }),
    });
  });

  it("surfaces a timeout as a no-credit-consumed failure", async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(JSON.stringify({ code: "timeout" }), {
          status: 504,
        }),
      },
    });

    await expect(generatePlusMakeupReport(input)).rejects.toThrow(
      "AI 生成超时，本次不会扣减额度，请重试。",
    );
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
