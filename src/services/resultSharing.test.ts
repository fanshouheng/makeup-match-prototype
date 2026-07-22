import { describe, expect, it } from "vitest";
import { buildMatchShareText, shouldUseNativeShare } from "./resultSharing";

describe("buildMatchShareText", () => {
  it("describes the result without private measurements", () => {
    const text = buildMatchShareText({ creatorName: "示例博主" });

    expect(text).toBe("我在 LOOK AI 找到的首选妆容参考是「示例博主」。");
    expect(text).not.toContain("https://");
  });
});

describe("shouldUseNativeShare", () => {
  it("uses the generated image on desktop even when Web Share is available", () => {
    expect(shouldUseNativeShare({
      maxTouchPoints: 10,
      shareAvailable: true,
      viewportWidth: 1280,
    })).toBe(false);
  });

  it("uses the system share sheet on a touch-sized mobile viewport", () => {
    expect(shouldUseNativeShare({
      maxTouchPoints: 5,
      shareAvailable: true,
      viewportWidth: 390,
    })).toBe(true);
  });
});
