export type CreatorPlatform = "douyin" | "xiaohongshu";

const PLATFORM_DOMAINS: Record<CreatorPlatform, string[]> = {
  douyin: ["douyin.com"],
  xiaohongshu: ["xiaohongshu.com", "xhslink.com"],
};

export function isCreatorPlatform(
  value: string | undefined,
): value is CreatorPlatform {
  return value === "douyin" || value === "xiaohongshu";
}

export function isCreatorPlatformUrl(
  platform: CreatorPlatform,
  value: string,
): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      PLATFORM_DOMAINS[platform].some(
        (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
      )
    );
  } catch {
    return false;
  }
}
