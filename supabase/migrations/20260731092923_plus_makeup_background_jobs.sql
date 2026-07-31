create table public.plus_makeup_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'processing'
    check (status in ('processing', 'succeeded', 'failed')),
  consent_version text not null,
  features jsonb,
  scenes text[] not null default '{}',
  custom_scene text not null default '',
  direction text not null default 'auto',
  report jsonb,
  error_code text,
  attempt_count smallint not null default 1 check (attempt_count between 1 and 2),
  processing_started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '23 hours'),
  check (features is null or jsonb_typeof(features) = 'object'),
  check (report is null or jsonb_typeof(report) = 'object')
);

create unique index plus_makeup_jobs_one_active_per_user_idx
on public.plus_makeup_jobs (user_id)
where status = 'processing';

create index plus_makeup_jobs_expires_at_idx
on public.plus_makeup_jobs (expires_at);

alter table public.plus_makeup_jobs enable row level security;

revoke all on table public.plus_makeup_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.plus_makeup_jobs to service_role;

comment on table public.plus_makeup_jobs is
  'Private Plus generation jobs. Inputs and results expire within 24 hours and are deleted after local delivery.';
comment on column public.plus_makeup_jobs.features is
  'Nine disclosed face ratios only. Never contains a photo, landmarks, identity, device data, or local rankings.';
comment on column public.plus_makeup_jobs.report is
  'Temporary generated report. Deleted after the signed-in user saves it locally or after 24 hours.';

create or replace function public.create_plus_makeup_job(
  p_user_id uuid,
  p_consent_version text,
  p_features jsonb,
  p_scenes text[],
  p_custom_scene text,
  p_direction text
)
returns table (
  job_id uuid,
  job_status text,
  remaining_credits smallint,
  job_expires_at timestamptz,
  reused boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_membership public.plus_memberships%rowtype;
  active_job public.plus_makeup_jobs%rowtype;
begin
  if p_user_id is null
    or p_consent_version is null
    or p_features is null
    or jsonb_typeof(p_features) <> 'object'
    or p_scenes is null
    or cardinality(p_scenes) > 3
    or cardinality(p_scenes) + (case when btrim(coalesce(p_custom_scene, '')) = '' then 0 else 1 end) not between 1 and 3
    or char_length(btrim(coalesce(p_custom_scene, ''))) > 80
    or p_direction is null then
    raise exception 'invalid_request';
  end if;

  select *
  into selected_membership
  from public.plus_memberships as membership
  where membership.user_id = p_user_id
  for update;

  if not found
    or selected_membership.status <> 'active'
    or selected_membership.benefit_expires_at <= now() then
    raise exception 'membership_inactive';
  end if;

  select *
  into active_job
  from public.plus_makeup_jobs as job
  where job.user_id = p_user_id
    and job.status = 'processing'
  for update;

  if found and active_job.expires_at > now() then
    return query
    select
      active_job.id,
      active_job.status,
      selected_membership.trial_credits,
      active_job.expires_at,
      true;
    return;
  end if;

  if found then
    delete from public.plus_makeup_jobs where id = active_job.id;
    update public.plus_memberships
    set
      trial_credits = trial_credits + 1,
      updated_at = now()
    where user_id = p_user_id
    returning * into selected_membership;
  end if;

  if selected_membership.trial_credits <= 0 then
    raise exception 'no_credits';
  end if;

  update public.plus_memberships
  set
    trial_credits = trial_credits - 1,
    updated_at = now()
  where user_id = p_user_id
  returning * into selected_membership;

  insert into public.plus_makeup_jobs (
    user_id,
    status,
    consent_version,
    features,
    scenes,
    custom_scene,
    direction,
    attempt_count,
    processing_started_at,
    created_at,
    updated_at,
    expires_at
  ) values (
    p_user_id,
    'processing',
    p_consent_version,
    p_features,
    p_scenes,
    btrim(coalesce(p_custom_scene, '')),
    p_direction,
    1,
    now(),
    now(),
    now(),
    now() + interval '23 hours'
  )
  returning * into active_job;

  return query
  select
    active_job.id,
    active_job.status,
    selected_membership.trial_credits,
    active_job.expires_at,
    false;
end;
$$;

create or replace function public.refund_plus_makeup_job(
  p_job_id uuid,
  p_user_id uuid,
  p_error_code text
)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_membership public.plus_memberships%rowtype;
  selected_job public.plus_makeup_jobs%rowtype;
begin
  select *
  into selected_membership
  from public.plus_memberships as membership
  where membership.user_id = p_user_id
  for update;

  if not found then
    raise exception 'membership_inactive';
  end if;

  select *
  into selected_job
  from public.plus_makeup_jobs as job
  where job.id = p_job_id
    and job.user_id = p_user_id
  for update;

  if found and selected_job.status = 'processing' then
    update public.plus_memberships
    set
      trial_credits = trial_credits + 1,
      updated_at = now()
    where user_id = p_user_id
    returning * into selected_membership;

    update public.plus_makeup_jobs
    set
      status = 'failed',
      features = null,
      scenes = '{}',
      custom_scene = '',
      direction = 'auto',
      report = null,
      error_code = left(coalesce(p_error_code, 'unexpected_error'), 80),
      updated_at = now()
    where id = p_job_id;
  end if;

  return selected_membership.trial_credits;
end;
$$;

create or replace function public.cleanup_plus_makeup_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  update public.plus_memberships as membership
  set
    trial_credits = membership.trial_credits + 1,
    updated_at = now()
  from public.plus_makeup_jobs as job
  where job.user_id = membership.user_id
    and job.status = 'processing'
    and job.expires_at <= now();

  delete from public.plus_makeup_jobs
  where expires_at <= now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.create_plus_makeup_job(uuid, text, jsonb, text[], text, text)
  from public, anon, authenticated;
revoke all on function public.refund_plus_makeup_job(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.cleanup_plus_makeup_jobs()
  from public, anon, authenticated;
grant execute on function public.create_plus_makeup_job(uuid, text, jsonb, text[], text, text)
  to service_role;
grant execute on function public.refund_plus_makeup_job(uuid, uuid, text)
  to service_role;
grant execute on function public.cleanup_plus_makeup_jobs()
  to service_role;

create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'cleanup-plus-makeup-jobs';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'cleanup-plus-makeup-jobs',
    '17 * * * *',
    'select public.cleanup_plus_makeup_jobs();'
  );
end;
$$;
