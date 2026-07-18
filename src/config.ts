export const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? "";
export const hasTurnstileConfig = Boolean(turnstileSiteKey);

export const privacyContactEmail =
  import.meta.env.VITE_PRIVACY_CONTACT_EMAIL?.trim() ?? "";

export const contactWechatQrUrl =
  import.meta.env.VITE_CONTACT_WECHAT_QR_URL?.trim() || "/wechat-contact.jpg";

export const contactDouyinUrl =
  import.meta.env.VITE_CONTACT_DOUYIN_URL?.trim() ||
  "https://www.douyin.com/user/MS4wLjABAAAA8EsCkkVc2Pqmg1d2WrF2I1_Zp-6-6BWM8BdVjK_0_Gc";
