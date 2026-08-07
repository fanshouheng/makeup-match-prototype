drop policy if exists "anyone can submit a pending creator application"
on public.creator_submissions;

drop policy if exists "anyone can upload a creator submission photo"
on storage.objects;

create table if not exists public.product_event_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count > 0)
);

comment on table public.product_event_rate_limits is
  'One-way salted IP hashes used only to bound anonymous product-event writes.';

alter table public.product_event_rate_limits enable row level security;
revoke all on table public.product_event_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.product_event_rate_limits to service_role;

create or replace function public.consume_product_event_rate_limit(rate_key text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_count integer;
begin
  if rate_key !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  insert into public.product_event_rate_limits (
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
      when public.product_event_rate_limits.window_started_at <= now() - interval '1 hour'
        then now()
      else public.product_event_rate_limits.window_started_at
    end,
    request_count = case
      when public.product_event_rate_limits.window_started_at <= now() - interval '1 hour'
        then 1
      else public.product_event_rate_limits.request_count + 1
    end
  returning request_count into current_count;

  return current_count <= 120;
end;
$$;

revoke all on function public.consume_product_event_rate_limit(text)
from public, anon, authenticated;
grant execute on function public.consume_product_event_rate_limit(text) to service_role;

create or replace function public.is_valid_face_feature_vector(value jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
begin
  if jsonb_typeof(value) <> 'object'
    or not value ?& array[
      'faceAspectRatio', 'jawToCheekRatio', 'foreheadToCheekRatio',
      'lowerThirdRatio', 'eyeSpacingRatio', 'eyeAspectRatio',
      'noseWidthRatio', 'lipWidthRatio', 'lipAspectRatio'
    ]
    or value - array[
      'faceAspectRatio', 'jawToCheekRatio', 'foreheadToCheekRatio',
      'lowerThirdRatio', 'eyeSpacingRatio', 'eyeAspectRatio',
      'noseWidthRatio', 'lipWidthRatio', 'lipAspectRatio'
    ]::text[] <> '{}'::jsonb
  then
    return false;
  end if;

  return
    jsonb_typeof(value -> 'faceAspectRatio') = 'number'
    and (value ->> 'faceAspectRatio')::numeric between 0.7 and 2
    and jsonb_typeof(value -> 'jawToCheekRatio') = 'number'
    and (value ->> 'jawToCheekRatio')::numeric between 0.35 and 1.2
    and jsonb_typeof(value -> 'foreheadToCheekRatio') = 'number'
    and (value ->> 'foreheadToCheekRatio')::numeric between 0.35 and 1.3
    and jsonb_typeof(value -> 'lowerThirdRatio') = 'number'
    and (value ->> 'lowerThirdRatio')::numeric between 0.15 and 0.8
    and jsonb_typeof(value -> 'eyeSpacingRatio') = 'number'
    and (value ->> 'eyeSpacingRatio')::numeric between 0.08 and 0.6
    and jsonb_typeof(value -> 'eyeAspectRatio') = 'number'
    and (value ->> 'eyeAspectRatio')::numeric between 1 and 15
    and jsonb_typeof(value -> 'noseWidthRatio') = 'number'
    and (value ->> 'noseWidthRatio')::numeric between 0.08 and 0.6
    and jsonb_typeof(value -> 'lipWidthRatio') = 'number'
    and (value ->> 'lipWidthRatio')::numeric between 0.1 and 0.8
    and jsonb_typeof(value -> 'lipAspectRatio') = 'number'
    and (value ->> 'lipAspectRatio')::numeric between 0.02 and 0.8;
exception
  when others then return false;
end;
$$;

revoke all on function public.is_valid_face_feature_vector(jsonb)
from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'creator_submissions_valid_feature_vector'
      and conrelid = 'public.creator_submissions'::regclass
  ) then
    alter table public.creator_submissions
      add constraint creator_submissions_valid_feature_vector
      check (public.is_valid_face_feature_vector(feature_vector)) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'creators_valid_feature_vector'
      and conrelid = 'public.creators'::regclass
  ) then
    alter table public.creators
      add constraint creators_valid_feature_vector
      check (public.is_valid_face_feature_vector(feature_vector)) not valid;
  end if;
end;
$$;

create or replace function public.redeem_plus_invite(
  p_code_hash text,
  p_user_id uuid
)
returns table (
  user_id uuid,
  tier text,
  status text,
  trial_credits smallint,
  activated_at timestamptz,
  benefit_expires_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_invite public.plus_invites%rowtype;
  current_membership public.plus_memberships%rowtype;
begin
  if p_user_id is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invite_invalid';
  end if;

  select * into current_membership
  from public.plus_memberships as membership
  where membership.user_id = p_user_id
    and membership.status = 'active'
    and membership.benefit_expires_at > now()
  for update;

  if found then
    return query select
      current_membership.user_id,
      current_membership.tier,
      current_membership.status,
      current_membership.trial_credits,
      current_membership.activated_at,
      current_membership.benefit_expires_at;
    return;
  end if;

  select * into selected_invite
  from public.plus_invites as invite
  where invite.code_hash = p_code_hash
  for update;

  if not found then raise exception 'invite_invalid'; end if;
  if selected_invite.expires_at <= now() then raise exception 'invite_expired'; end if;
  if selected_invite.redeemed_at is not null then
    if selected_invite.redeemed_by = p_user_id then
      select * into current_membership
      from public.plus_memberships as membership
      where membership.invite_id = selected_invite.id;

      if found then
        return query select
          current_membership.user_id,
          current_membership.tier,
          current_membership.status,
          current_membership.trial_credits,
          current_membership.activated_at,
          current_membership.benefit_expires_at;
        return;
      end if;
    end if;
    raise exception 'invite_redeemed';
  end if;

  insert into public.plus_memberships (
    user_id,
    invite_id,
    tier,
    status,
    trial_credits,
    activated_at,
    benefit_expires_at,
    updated_at
  ) values (
    p_user_id,
    selected_invite.id,
    'early_access',
    'active',
    3,
    now(),
    now() + interval '180 days',
    now()
  )
  on conflict on constraint plus_memberships_pkey do update set
    invite_id = excluded.invite_id,
    tier = excluded.tier,
    status = excluded.status,
    trial_credits = excluded.trial_credits,
    activated_at = excluded.activated_at,
    benefit_expires_at = excluded.benefit_expires_at,
    updated_at = excluded.updated_at
  returning * into current_membership;

  update public.plus_invites
  set redeemed_by = p_user_id, redeemed_at = coalesce(redeemed_at, now())
  where id = selected_invite.id;

  return query select
    current_membership.user_id,
    current_membership.tier,
    current_membership.status,
    current_membership.trial_credits,
    current_membership.activated_at,
    current_membership.benefit_expires_at;
end;
$$;

revoke all on function public.redeem_plus_invite(text, uuid)
from public, anon, authenticated;
grant execute on function public.redeem_plus_invite(text, uuid) to service_role;
