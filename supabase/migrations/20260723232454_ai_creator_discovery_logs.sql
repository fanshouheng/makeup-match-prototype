create table public.ai_creator_discovery_logs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('succeeded', 'failed')),
  error_code text check (
    error_code is null or error_code in (
      'web_search_not_configured',
      'provider_request_failed',
      'invalid_provider_response',
      'timeout',
      'unexpected_error'
    )
  ),
  duration_ms integer not null check (duration_ms >= 0 and duration_ms <= 300000),
  provider_status integer check (
    provider_status is null or provider_status between 100 and 599
  ),
  reference_audience text not null check (reference_audience in ('women', 'men')),
  content_filter text not null check (content_filter in ('all', 'hair', 'makeup')),
  created_at timestamptz not null default now(),
  check (
    (status = 'succeeded' and error_code is null) or
    (status = 'failed' and error_code is not null)
  )
);

comment on table public.ai_creator_discovery_logs is
  'Privacy-safe AI invocation metadata. Never stores photos, face data, prompts, IP addresses, creator names, rankings, or AI results.';

alter table public.ai_creator_discovery_logs enable row level security;

revoke all on table public.ai_creator_discovery_logs
  from public, anon, authenticated;
grant select, insert, delete on table public.ai_creator_discovery_logs
  to service_role;

create index ai_creator_discovery_logs_created_at_idx
  on public.ai_creator_discovery_logs (created_at desc);
