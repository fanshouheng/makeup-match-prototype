export const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? "";
export const hasTurnstileConfig = Boolean(turnstileSiteKey);

export const privacyContactEmail =
  import.meta.env.VITE_PRIVACY_CONTACT_EMAIL?.trim() ?? "";

export const contactWechatId =
  import.meta.env.VITE_CONTACT_WECHAT_ID?.trim() ?? "";

export const contactDouyinUrl =
  import.meta.env.VITE_CONTACT_DOUYIN_URL?.trim() ?? "";
