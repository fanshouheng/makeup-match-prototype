import { describe, expect, it } from "vitest";
import { isCreatorPlatform, isCreatorPlatformUrl } from "./creatorPlatform";

describe("creator platform validation", () => {
  it("accepts supported platforms and their domains", () => {
    expect(isCreatorPlatform("douyin")).toBe(true);
    expect(isCreatorPlatform("xiaohongshu")).toBe(true);
    expect(isCreatorPlatformUrl("douyin", "https://www.douyin.com/user/example")).toBe(true);
    expect(isCreatorPlatformUrl("xiaohongshu", "https://xhslink.com/a/example")).toBe(true);
  });

  it("rejects unknown platforms and cross-platform URLs", () => {
    expect(isCreatorPlatform("weibo")).toBe(false);
    expect(isCreatorPlatformUrl("douyin", "https://www.xiaohongshu.com/user/profile/example")).toBe(false);
    expect(isCreatorPlatformUrl("xiaohongshu", "https://www.douyin.com/user/example")).toBe(false);
  });
});
