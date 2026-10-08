import { describe, expect, it } from "vitest";
import {
  approvedCreatorDiscoveryKeywords,
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

  it("normalizes harmless provider formatting drift before strict validation", () => {
    const driftedReport = {
      ...coreReport,
      title: `${coreReport.title}${"补充".repeat(40)}`,
      extraNote: "模型偶尔增加的非约定字段",
      faceProfile: {
        ...coreReport.faceProfile,
        extraNote: "忽略",
        focusAreas: [...coreReport.faceProfile.focusAreas, "补充重点一", "补充重点二", "补充重点三"],
      },
      plans: [...coreReport.plans, coreReport.plans[0]].map((plan) => ({
        ...plan,
        extraNote: "忽略",
        steps: [...plan.steps, ...plan.steps.slice(0, 3)],
        products: [...plan.products, "膏状腮红", "细闪高光", "柔雾唇泥", "透明散粉", "定妆喷雾"],
        avoid: [...plan.avoid, "避免过重修容", "避免边界生硬", "避免颜色堆叠"],
      })),
    };

    const report = parseDeepSeekPlusMakeupReport({
      choices: [{
        message: {
          content: `以下是 JSON 结果：\n\`\`\`json\n${JSON.stringify(driftedReport)}\n\`\`\``,
        },
      }],
    });

    expect(report.title.length).toBeLessThanOrEqual(60);
    expect(report.plans).toHaveLength(3);
    expect(report.plans[0].steps).toHaveLength(7);
    expect(report.plans[0].products).toHaveLength(7);
    expect(report.plans[0].avoid).toHaveLength(3);
    expect(report).not.toHaveProperty("extraNote");
    expect(report.faceProfile).not.toHaveProperty("extraNote");
  });

  it("still rejects unsafe text while normalizing provider drift", () => {
    expect(() => parseDeepSeekPlusMakeupReport({
      choices: [{
        message: {
          content: JSON.stringify({
            ...coreReport,
            title: `${"正常内容".repeat(20)}疾病诊断`,
          }),
        },
      }],
    })).toThrow("invalid_provider_response");
  });

  it("reduces model text to server-approved makeup keywords before another provider", () => {
    const keywords = approvedCreatorDiscoveryKeywords({
      ...coreReport,
      faceProfile: {
        ...coreReport.faceProfile,
        summary: "脸部长宽比为 1.234567，下颌比例是一点二三。",
      },
      plans: coreReport.plans.map((plan) => ({
        ...plan,
        effect: "精确比例 1.234567",
      })),
    });
    expect(keywords).toContain("底妆");
    expect(keywords.join(" ")).not.toMatch(/1\.234567|一点二三|精确比例/);
  });
});
