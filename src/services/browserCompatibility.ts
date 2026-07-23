const EMBEDDED_APP_PATTERN =
  /MicroMessenger|Weibo|XiaoHongShu|\bXHS(?:\/|\b)|\bdiscover\/|\baweme(?:_|\/)|BytedanceWebview|Toutiao|NewsArticle|\bQQ\//i;

const IOS_DEVICE_PATTERN = /iPhone|iPad|iPod/i;
const IOS_BROWSER_PATTERN = /Safari|CriOS|FxiOS|EdgiOS|OPiOS/i;

export function isLikelyInAppBrowser(userAgent: string): boolean {
  if (!userAgent) return false;
  if (/;\s*wv\)/i.test(userAgent) || EMBEDDED_APP_PATTERN.test(userAgent)) {
    return true;
  }

  return IOS_DEVICE_PATTERN.test(userAgent)
    && /AppleWebKit/i.test(userAgent)
    && !IOS_BROWSER_PATTERN.test(userAgent);
}

export function analysisComponentErrorMessage(userAgent: string): string {
  if (isLikelyInAppBrowser(userAgent)) {
    return "当前内置浏览器无法启动照片分析。请点右上角“…”选择“在浏览器打开”，iPhone 用 Safari，安卓用 Chrome。";
  }

  return "当前浏览器未能启动照片分析。请刷新后再试，仍失败时请改用最新版 Safari 或 Chrome。";
}
