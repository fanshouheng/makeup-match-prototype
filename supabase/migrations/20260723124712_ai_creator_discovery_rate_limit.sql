create table public.ai_creator_discovery_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count > 0)
);

comment on table public.ai_creator_discovery_rate_limits is
  'One-way IP rate-limit hashes for the optional AI creator discovery endpoint.';

alter table public.ai_creator_discovery_rate_limits enable row level security;

revoke all on table public.ai_creator_discovery_rate_limits
  from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_creator_discovery_rate_limits
  to service_role;

create or replace function public.consume_ai_creator_discovery_rate_limit(
  rate_key text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_count integer;
begin
  insert into public.ai_creator_discovery_rate_limits (
    key_hash,
    window_started_at,
    request_count
  ) values (
    rate_key,
    now(),
    1
  )
  on conflict (key_hash) do update
  set
    window_started_at = case
      when public.ai_creator_discovery_rate_limits.window_started_at <= now() - interval '1 hour'
        then now()
      else public.ai_creator_discovery_rate_limits.window_started_at
    end,
    request_count = case
      when public.ai_creator_discovery_rate_limits.window_started_at <= now() - interval '1 hour'
        then 1
      else public.ai_creator_discovery_rate_limits.request_count + 1
    end
  returning request_count into current_count;

  return current_count <= 3;
end;
$$;

revoke all on function public.consume_ai_creator_discovery_rate_limit(text)
  from public, anon, authenticated;
grant execute on function public.consume_ai_creator_discovery_rate_limit(text)
  to service_role;
