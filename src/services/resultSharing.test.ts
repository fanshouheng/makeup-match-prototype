import { describe, expect, it } from "vitest";
import { buildMatchShareText, shouldUseNativeShare } from "./resultSharing";

describe("buildMatchShareText", () => {
  it("describes a women's makeup-reference result without private measurements", () => {
    const text = buildMatchShareText({
      contentFilter: "all",
      creatorName: "示例博主",
      referenceAudience: "women",
    });

    expect(text).toBe("我在 LOOK AI 找到的首选妆容参考是「示例博主」。");
    expect(text).not.toContain("https://");
  });

  it("uses the selected men's reference direction", () => {
    const hairText = buildMatchShareText({
      contentFilter: "hair",
      creatorName: "示例创作者",
      referenceAudience: "men",
    });
    const appearanceText = buildMatchShareText({
      contentFilter: "all",
      creatorName: "示例创作者",
      referenceAudience: "men",
    });

    expect(hairText).toContain("首选发型参考");
    expect(appearanceText).toContain("首选男生形象参考");
  });
});

describe("shouldUseNativeShare", () => {
  it("uses the generated image on desktop even when the browser exposes Web Share", () => {
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
