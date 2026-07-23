import { describe, expect, it } from "vitest";
import {
  analysisComponentErrorMessage,
  isLikelyInAppBrowser,
} from "./browserCompatibility";

const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

describe("isLikelyInAppBrowser", () => {
  it.each([
    "Mozilla/5.0 (Linux; Android 15; Pixel 9 Build/AP3A; wv) AppleWebKit/537.36 Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 discover/8.92",
    "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Mobile Safari/537.36 XiaoHongShu/8.92",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.58",
  ])("detects an embedded mobile browser from %s", (userAgent) => {
    expect(isLikelyInAppBrowser(userAgent)).toBe(true);
  });

  it.each([ANDROID_CHROME, IPHONE_SAFARI])(
    "does not flag a supported system browser from %s",
    (userAgent) => {
      expect(isLikelyInAppBrowser(userAgent)).toBe(false);
    },
  );
});

describe("analysisComponentErrorMessage", () => {
  it("tells embedded-browser users how to open a system browser", () => {
    expect(analysisComponentErrorMessage("XiaoHongShu/8.92")).toContain(
      "在浏览器打开",
    );
  });

  it("keeps a retry path for standard browsers", () => {
    expect(analysisComponentErrorMessage(ANDROID_CHROME)).toContain("刷新后再试");
  });
});
