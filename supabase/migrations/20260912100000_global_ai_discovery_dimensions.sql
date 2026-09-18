-- Store only fixed, non-identifying dimensions for global AI discovery reporting.
alter table public.ai_creator_discovery_logs
  add column if not exists locale text,
  add column if not exists country_code text,
  add column if not exists platform text;
alter table public.ai_creator_discovery_logs
  add constraint ai_creator_discovery_logs_locale_check
    check (locale is null or locale in ('zh-CN', 'en-US', 'en-GB', 'ja-JP', 'ko-KR')),
  add constraint ai_creator_discovery_logs_country_code_check
    check (country_code is null or country_code in ('CN', 'JP', 'KR', 'US', 'GB')),
  add constraint ai_creator_discovery_logs_platform_check
    check (platform is null or platform in ('all', 'youtube', 'instagram', 'tiktok', 'xiaohongshu', 'douyin'));
comment on column public.ai_creator_discovery_logs.locale is
  'Fixed output-language enum only; never a free-form user identifier.';
comment on column public.ai_creator_discovery_logs.country_code is
  'Fixed market enum only; null means global.';
comment on column public.ai_creator_discovery_logs.platform is
  'Fixed platform enum only; never a creator name or URL.';
