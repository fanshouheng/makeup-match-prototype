import { describe, expect, it } from "vitest";
import { isCreatorPlatformUrl } from "./creator";

describe("isCreatorPlatformUrl", () => {
  it("accepts supported profile and short-link domains", () => {
    expect(isCreatorPlatformUrl("douyin", "https://www.douyin.com/user/example")).toBe(true);
    expect(isCreatorPlatformUrl("xiaohongshu", "https://www.xiaohongshu.com/user/profile/example")).toBe(true);
    expect(isCreatorPlatformUrl("xiaohongshu", "https://xhslink.com/a/example")).toBe(true);
  });

  it("rejects a valid URL from the wrong platform", () => {
    expect(isCreatorPlatformUrl("douyin", "https://www.xiaohongshu.com/user/profile/example")).toBe(false);
    expect(isCreatorPlatformUrl("xiaohongshu", "https://www.douyin.com/user/example")).toBe(false);
  });
});
