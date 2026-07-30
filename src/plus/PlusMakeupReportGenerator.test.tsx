import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FaceFeatureVector } from "../domain/faceFeatures";
import { PlusMakeupReportGenerator } from "./PlusMakeupReportGenerator";

vi.mock("../config", () => ({
  hasTurnstileConfig: false,
  turnstileSiteKey: "",
}));

vi.mock("../services/plusMakeupReport", () => ({
  generatePlusMakeupReport: vi.fn(),
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

describe("PlusMakeupReportGenerator", () => {
  it("shows the full scene, direction, consent, and credit configuration", () => {
    const html = renderToStaticMarkup(
      <PlusMakeupReportGenerator
        faceFeatures={features}
        onGenerated={vi.fn()}
        remainingCredits={3}
      />,
    );

    expect(html).toContain("生成面容报告和 3 套妆造方案");
    expect(html).toContain("毕业典礼");
    expect(html).toContain("帮我选择");
    expect(html).toContain("我要参加毕业典礼");
    expect(html).toContain("查看将发送的九项面部比例");
    expect(html).toContain("当前剩余 <strong>3</strong> 次");
    expect(html).not.toMatch(/AI|DeepSeek|豆包/);
  });
});
