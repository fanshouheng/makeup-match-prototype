create table public.creator_submission_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count > 0)
);

alter table public.creator_submission_rate_limits enable row level security;
revoke all on public.creator_submission_rate_limits from anon, authenticated;

create or replace function public.consume_creator_submission_rate_limit(
  rate_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  insert into public.creator_submission_rate_limits (
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
      when creator_submission_rate_limits.window_started_at <= now() - interval '1 hour'
        then now()
      else creator_submission_rate_limits.window_started_at
    end,
    request_count = case
      when creator_submission_rate_limits.window_started_at <= now() - interval '1 hour'
        then 1
      else creator_submission_rate_limits.request_count + 1
    end
  returning request_count into current_count;

  return current_count <= 3;
end;
$$;

revoke all on function public.consume_creator_submission_rate_limit(text)
  from public, anon, authenticated;
grant execute on function public.consume_creator_submission_rate_limit(text)
  to service_role;
