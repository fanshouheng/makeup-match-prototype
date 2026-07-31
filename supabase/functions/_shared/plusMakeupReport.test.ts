import { describe, expect, it } from "vitest";
import {
  parseDeepSeekPlusMakeupReport,
  parsePlusMakeupReport,
} from "./plusMakeupReport";

const coreReport = {
  title: "毕业典礼三套妆造方案",
  faceProfile: {
    summary: "面部纵向比例清楚，下颌与颧部宽度关系偏柔和，适合用眉眼重心和腮红位置调整视觉节奏。",
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
  disclaimer: "本报告由 AI 基于面部比例生成，仅作妆容参考。",
};

describe("Plus makeup report parsing", () => {
  it("accepts a complete report with creator names", () => {
    const report = parsePlusMakeupReport({
      ...coreReport,
      creatorNames: ["博主甲", "博主乙"],
    });
    expect(report.plans).toHaveLength(3);
    expect(report.creatorNames).toEqual(["博主甲", "博主乙"]);
  });

  it("rejects incomplete plans", () => {
    expect(() => parsePlusMakeupReport({
      ...coreReport,
      plans: coreReport.plans.slice(0, 2),
      creatorNames: ["博主甲"],
    })).toThrow("invalid_report");
  });

  it("parses the DeepSeek chat-completions envelope", () => {
    expect(parseDeepSeekPlusMakeupReport({
      choices: [{ message: { content: JSON.stringify(coreReport) } }],
    }).title).toBe(coreReport.title);
  });

  it("parses a JSON response wrapped in a code fence", () => {
    expect(parseDeepSeekPlusMakeupReport({
      choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(coreReport)}\n\`\`\`` } }],
    }).title).toBe(coreReport.title);
  });
});
