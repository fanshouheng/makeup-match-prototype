import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MaleFaceReport } from "./MaleFaceReport";

const features = {
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

describe("MaleFaceReport", () => {
  it("shows named evaluators and a separate praise mode", () => {
    const html = renderToStaticMarkup(<MaleFaceReport faceFeatures={features} />);
    expect(html).toContain("选择评价人");
    expect(html).toContain("鲁迅");
    expect(html).toContain("张爱玲");
    expect(html).toContain("三毛");
    expect(html).toContain("杨绛");
    expect(html).toContain("林徽因");
    expect(html).toContain("锐评模式");
    expect(html).toContain("夸夸模式");
    expect(html).not.toContain("鲁迅式");
    expect(html).not.toContain("DeepSeek");
  });

  it("discloses the exact transfer before an unchecked consent control", () => {
    const html = renderToStaticMarkup(<MaleFaceReport faceFeatures={features} />);
    expect(html).toContain("九项精确面部比例发送给第三方 AI 服务");
    expect(html).toContain("不会发送照片、关键点坐标、姓名、设备标识或匹配结果");
    expect(html).toContain("必要的安全与运行日志");
    expect(html).toContain("1.200000");
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('checked="" type="checkbox"');
    expect(html).toContain("同意并生成报告");
  });
});
