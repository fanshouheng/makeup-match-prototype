import { describe, expect, it } from "vitest";
import {
  parseDeepSeekMaleFaceReport,
  parseMaleFaceReport,
} from "./maleFaceReport";

const report = {
  title: "今天由毒舌闺蜜来审你",
  summary: "轮廓偏利落，五官分布比较集中。以下内容只描述这张照片中的结构比例。",
  observations: [
    {
      feature: "faceAspectRatio",
      label: "整体轮廓",
      fact: "脸部长宽比例偏均衡。",
      comment: "脸型没抢戏，倒是很会给五官留位置。",
    },
    {
      feature: "jawToCheekRatio",
      label: "下颌线",
      fact: "下颌与颧部宽度较接近。",
      comment: "轮廓收得利落，不需要靠表情硬撑场面。",
    },
    {
      feature: "eyeAspectRatio",
      label: "眼部线条",
      fact: "眼部纵向开度相对偏收。",
      comment: "眼睛加载到一半就开机了，好在视觉焦点还挺集中。",
    },
  ],
  closing: "这是 AI 生成的娱乐化结构解读，不是颜值评分。",
};

describe("parseMaleFaceReport", () => {
  it("accepts a bounded report with known feature keys", () => {
    expect(parseMaleFaceReport(report)).toEqual(report);
  });

  it("rejects duplicate feature keys", () => {
    expect(() => parseMaleFaceReport({
      ...report,
      observations: [
        report.observations[0],
        report.observations[0],
        report.observations[2],
      ],
    })).toThrow("invalid_report");
  });

  it("rejects demeaning disability language", () => {
    expect(() => parseMaleFaceReport({
      ...report,
      observations: report.observations.map((item, index) => index === 2
        ? { ...item, comment: "眼睛小得什么也看不见。" }
        : item),
    })).toThrow("invalid_report");
  });

  it("rejects personality judgments inferred from facial proportions", () => {
    expect(() => parseMaleFaceReport({
      ...report,
      observations: report.observations.map((item, index) => index === 1
        ? { ...item, comment: "下颌一收，满脸都是算计和心眼。" }
        : item),
    })).toThrow("invalid_report");
  });
});

describe("parseDeepSeekMaleFaceReport", () => {
  it("extracts and validates JSON output", () => {
    expect(parseDeepSeekMaleFaceReport({
      choices: [{ message: { content: JSON.stringify(report) } }],
    })).toEqual(report);
  });

  it("rejects empty provider content", () => {
    expect(() => parseDeepSeekMaleFaceReport({
      choices: [{ message: { content: "" } }],
    })).toThrow("invalid_provider_response");
  });
});
