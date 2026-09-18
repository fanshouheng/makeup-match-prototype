import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FaceFeatureVector } from "../domain/faceFeatures";
import { PlusMakeupReportGenerator } from "./PlusMakeupReportGenerator";

vi.mock("../services/plusMakeupReport", () => ({
  acknowledgePlusMakeupReportJob: vi.fn(),
  getPlusMakeupReportJob: vi.fn(),
  plusMakeupJobFailureMessage: vi.fn(),
  startPlusMakeupReport: vi.fn(),
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
  it("shows the direct scene, direction, consent, and credit configuration", () => {
    const html = renderToStaticMarkup(
      <PlusMakeupReportGenerator
        faceFeatures={features}
        isAuthenticated
        loginHref="/account?returnTo=/report"
        onPointsChanged={vi.fn()}
        onGenerated={vi.fn()}
        onViewReports={vi.fn()}
        photoStatus="ready"
        remainingPoints={300}
      />,
    );

    expect(html).toContain("设置使用场景");
    expect(html).toContain("化妆应用场景");
    expect(html).toContain("让 AI 建议");
    expect(html).toContain("周末参加朋友婚礼");
    expect(html).toContain("查看将发送的九项面部比例");
    expect(html).toContain("最多临时保存 24 小时");
    expect(html).toContain("当前余额 <strong>300</strong> 积分");
    expect(html).toContain("请填写这次化妆的使用场景");
    expect(html).not.toMatch(/DeepSeek|豆包/);
  });
});
