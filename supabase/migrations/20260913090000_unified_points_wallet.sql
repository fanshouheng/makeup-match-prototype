-- Unified points wallet for paid AI features. Ordinary matching remains separate.
alter table public.reward_wallets
  add column if not exists points integer not null default 0 check (points >= 0);
create table public.point_packages (
  code text not null,
  provider text not null check (provider in ('stripe', 'zpay')),
  name text not null,
  points integer not null check (points > 0),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (code, provider)
);
insert into public.point_packages (code, provider, name, points, amount_minor, currency, sort_order)
values
  ('light', 'zpay', '轻量', 30, 990, 'CNY', 10),
  ('standard', 'zpay', '常用', 100, 2990, 'CNY', 20),
  ('value', 'zpay', '充足', 220, 5990, 'CNY', 30),
  ('light', 'stripe', 'Light', 30, 199, 'USD', 10),
  ('standard', 'stripe', 'Standard', 100, 599, 'USD', 20),
  ('value', 'stripe', 'Value', 220, 1099, 'USD', 30)
on conflict (code, provider) do update set
  name = excluded.name,
  points = excluded.points,
  amount_minor = excluded.amount_minor,
  currency = excluded.currency,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();
create table public.point_reservations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('ai_discovery', 'makeup_report')),
  points integer not null check (points > 0),
  status text not null default 'reserved' check (status in ('reserved', 'consumed', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index point_reservations_expiry_idx
  on public.point_reservations (expires_at)
  where status = 'reserved';
alter table public.point_packages enable row level security;
alter table public.point_reservations enable row level security;
revoke all on table public.point_packages, public.point_reservations from public, anon, authenticated;
grant select on table public.point_packages to anon, authenticated;
grant select, insert, update, delete on table public.point_packages, public.point_reservations to service_role;
create policy point_packages_public_read on public.point_packages
  for select to anon, authenticated using (is_active);
alter table public.entitlement_ledger
  drop constraint if exists entitlement_ledger_entitlement_type_check;
alter table public.entitlement_ledger
  add constraint entitlement_ledger_entitlement_type_check
  check (entitlement_type in ('match', 'ai_discovery', 'plus_report', 'points'));
alter table public.payment_orders
  add column if not exists package_code text,
  add column if not exists points_granted integer not null default 0 check (points_granted >= 0);
alter table public.payment_orders
  drop constraint if exists payment_orders_product_code_check;
alter table public.payment_orders
  add constraint payment_orders_product_code_check
  check (product_code in ('plus', 'ai_credits', 'points'));
alter table public.payment_orders
  drop constraint if exists payment_orders_point_package_fkey;
alter table public.payment_orders
  add constraint payment_orders_point_package_fkey
  foreign key (package_code, provider)
  references public.point_packages(code, provider);
comment on table public.point_packages is
  'Server-owned point package catalog. Clients never choose amount, currency, or granted points.';
comment on table public.point_reservations is
  'Idempotent point reservations for AI work. Never stores photos, ratios, prompts, creator names, or AI output.';
comment on column public.reward_wallets.points is
  'Unified balance for paid AI features. Ordinary local matching credits remain separate.';
alter table public.product_events
  drop constraint if exists product_events_event_name_check;
alter table public.product_events
  add constraint product_events_event_name_check check (event_name in (
    'landing_view', 'photo_selected', 'women_photo_selected', 'men_photo_selected',
    'analysis_succeeded', 'analysis_failed', 'match_result_view', 'feedback_yes',
    'feedback_no', 'creator_link_clicked', 'share_succeeded',
    'plus_offer_viewed', 'plus_offer_opened', 'plus_offer_configured',
    'plus_intent_yes', 'plus_intent_price_high', 'plus_intent_not_needed',
    'plus_page_viewed', 'plus_checkout_started', 'plus_invite_redeemed',
    'plus_job_created', 'plus_job_succeeded', 'plus_job_failed',
    'plus_credit_refunded', 'plus_report_saved_local', 'plus_usage_feedback',
    'points_page_viewed', 'points_checkout_started',
    'ai_discovery_viewed', 'ai_discovery_consent', 'ai_discovery_requested',
    'ai_discovery_succeeded', 'ai_discovery_failed', 'ai_creator_name_clicked',
    'ai_discovery_feedback'
  ));
create or replace function public.ensure_point_wallet(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_wallet public.reward_wallets%rowtype;
  selected_membership public.plus_memberships%rowtype;
  converted_ai integer := 0;
  converted_reports integer := 0;
begin
  perform public.ensure_reward_wallet(p_user_id);
  select * into selected_wallet
  from public.reward_wallets where user_id = p_user_id for update;

  if selected_wallet.ai_credits > 0 then
    converted_ai := selected_wallet.ai_credits * 3;
    update public.reward_wallets
    set points = points + converted_ai, ai_credits = 0, updated_at = now()
    where user_id = p_user_id
    returning * into selected_wallet;
    insert into public.entitlement_ledger (
      user_id, entitlement_type, delta, reason, idempotency_key
    ) values (
      p_user_id, 'points', converted_ai, 'legacy_ai_conversion',
      'conversion:ai:' || gen_random_uuid()::text
    );
  end if;

  select * into selected_membership
  from public.plus_memberships where user_id = p_user_id for update;
  if found and selected_membership.trial_credits > 0 then
    converted_reports := selected_membership.trial_credits::integer * 10;
    update public.plus_memberships
    set trial_credits = 0, updated_at = now()
    where user_id = p_user_id;
    update public.reward_wallets
    set points = points + converted_reports, updated_at = now()
    where user_id = p_user_id
    returning * into selected_wallet;
    insert into public.entitlement_ledger (
      user_id, entitlement_type, delta, reason, idempotency_key
    ) values (
      p_user_id, 'points', converted_reports, 'legacy_report_conversion',
      'conversion:report:' || gen_random_uuid()::text
    );
  end if;

  return selected_wallet.points;
end;
$$;
create or replace function public.get_point_balance(p_user_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  select public.ensure_point_wallet(p_user_id);
$$;
create or replace function public.reserve_points(
  p_user_id uuid,
  p_reservation_id uuid,
  p_purpose text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_wallet public.reward_wallets%rowtype;
  selected_reservation public.point_reservations%rowtype;
  required_points integer;
  reservation_expiry timestamptz;
begin
  required_points := case p_purpose when 'ai_discovery' then 3 when 'makeup_report' then 10 else null end;
  reservation_expiry := case p_purpose
    when 'ai_discovery' then now() + interval '10 minutes'
    when 'makeup_report' then now() + interval '24 hours'
    else null
  end;
  if p_user_id is null or p_reservation_id is null or required_points is null then
    raise exception 'invalid_points_reservation';
  end if;

  perform public.ensure_point_wallet(p_user_id);
  select * into selected_wallet
  from public.reward_wallets where user_id = p_user_id for update;
  select * into selected_reservation
  from public.point_reservations where id = p_reservation_id;
  if found then
    if selected_reservation.user_id <> p_user_id or selected_reservation.purpose <> p_purpose then
      raise exception 'points_reservation_conflict';
    end if;
    return selected_wallet.points;
  end if;
  if selected_wallet.points < required_points then raise exception 'no_points'; end if;

  insert into public.point_reservations (id, user_id, purpose, points, expires_at)
  values (p_reservation_id, p_user_id, p_purpose, required_points, reservation_expiry);
  update public.reward_wallets
  set points = points - required_points, updated_at = now()
  where user_id = p_user_id
  returning * into selected_wallet;
  insert into public.entitlement_ledger (
    user_id, entitlement_type, delta, reason, reference_id, idempotency_key
  ) values (
    p_user_id, 'points', -required_points, p_purpose || '_reserved', p_reservation_id,
    'points:' || p_reservation_id::text || ':reserve'
  ) on conflict (idempotency_key) do nothing;
  return selected_wallet.points;
end;
$$;
create or replace function public.commit_points(
  p_user_id uuid,
  p_reservation_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare selected_wallet public.reward_wallets%rowtype;
begin
  update public.point_reservations
  set status = 'consumed', updated_at = now()
  where id = p_reservation_id and user_id = p_user_id and status = 'reserved';
  perform public.ensure_point_wallet(p_user_id);
  select * into selected_wallet from public.reward_wallets where user_id = p_user_id;
  return selected_wallet.points;
end;
$$;
create or replace function public.refund_points(
  p_user_id uuid,
  p_reservation_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_wallet public.reward_wallets%rowtype;
  selected_reservation public.point_reservations%rowtype;
begin
  perform public.ensure_point_wallet(p_user_id);
  select * into selected_wallet from public.reward_wallets where user_id = p_user_id for update;
  select * into selected_reservation
  from public.point_reservations
  where id = p_reservation_id and user_id = p_user_id
  for update;
  if found and selected_reservation.status = 'reserved' then
    update public.point_reservations
    set status = 'refunded', updated_at = now()
    where id = p_reservation_id;
    update public.reward_wallets
    set points = points + selected_reservation.points, updated_at = now()
    where user_id = p_user_id
    returning * into selected_wallet;
    insert into public.entitlement_ledger (
      user_id, entitlement_type, delta, reason, reference_id, idempotency_key
    ) values (
      p_user_id, 'points', selected_reservation.points,
      selected_reservation.purpose || '_refunded', p_reservation_id,
      'points:' || p_reservation_id::text || ':refund'
    ) on conflict (idempotency_key) do nothing;
  end if;
  return selected_wallet.points;
end;
$$;
create or replace function public.cleanup_point_reservations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_reservation public.point_reservations%rowtype;
  refunded_count integer := 0;
begin
  for selected_reservation in
    select * from public.point_reservations
    where status = 'reserved' and expires_at <= now()
    for update skip locked
  loop
    perform public.refund_points(selected_reservation.user_id, selected_reservation.id);
    refunded_count := refunded_count + 1;
  end loop;
  delete from public.point_reservations
  where status <> 'reserved' and updated_at <= now() - interval '30 days';
  return refunded_count;
end;
$$;
drop function if exists public.create_plus_makeup_job(uuid, text, jsonb, text[], text, text);
create function public.create_plus_makeup_job(
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
  remaining_points integer,
  job_expires_at timestamptz,
  reused boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_job public.plus_makeup_jobs%rowtype;
  created_job public.plus_makeup_jobs%rowtype;
  remaining_points integer;
begin
  if p_user_id is null or p_consent_version is null or p_features is null
    or jsonb_typeof(p_features) <> 'object' or p_scenes is null
    or cardinality(p_scenes) > 3
    or cardinality(p_scenes) + (case when btrim(coalesce(p_custom_scene, '')) = '' then 0 else 1 end) not between 1 and 3
    or char_length(btrim(coalesce(p_custom_scene, ''))) > 80 or p_direction is null then
    raise exception 'invalid_request';
  end if;

  remaining_points := public.ensure_point_wallet(p_user_id);
  select * into active_job from public.plus_makeup_jobs
  where user_id = p_user_id and status = 'processing' for update;
  if found and active_job.expires_at > now() then
    return query select active_job.id, active_job.status, remaining_points, active_job.expires_at, true;
    return;
  end if;
  if found then
    perform public.refund_points(p_user_id, active_job.id);
    delete from public.plus_makeup_jobs where id = active_job.id;
  end if;

  insert into public.plus_makeup_jobs (
    user_id, status, consent_version, features, scenes, custom_scene, direction,
    attempt_count, processing_started_at, created_at, updated_at, expires_at
  ) values (
    p_user_id, 'processing', p_consent_version, p_features, p_scenes,
    btrim(coalesce(p_custom_scene, '')), p_direction, 1, now(), now(), now(),
    now() + interval '23 hours'
  ) returning * into created_job;
  remaining_points := public.reserve_points(p_user_id, created_job.id, 'makeup_report');
  return query select created_job.id, created_job.status, remaining_points, created_job.expires_at, false;
end;
$$;
drop function if exists public.refund_plus_makeup_job(uuid, uuid, text);
create function public.refund_plus_makeup_job(
  p_job_id uuid,
  p_user_id uuid,
  p_error_code text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_job public.plus_makeup_jobs%rowtype;
  remaining_points integer;
begin
  select * into selected_job from public.plus_makeup_jobs
  where id = p_job_id and user_id = p_user_id for update;
  if found and selected_job.status = 'processing' then
    remaining_points := public.refund_points(p_user_id, p_job_id);
    update public.plus_makeup_jobs
    set status = 'failed', features = null, scenes = '{}', custom_scene = '',
        direction = 'auto', report = null,
        error_code = left(coalesce(p_error_code, 'unexpected_error'), 80), updated_at = now()
    where id = p_job_id;
  else
    remaining_points := public.ensure_point_wallet(p_user_id);
  end if;
  return remaining_points;
end;
$$;
create or replace function public.complete_plus_makeup_job(
  p_job_id uuid,
  p_user_id uuid,
  p_report jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_job public.plus_makeup_jobs%rowtype;
  remaining_points integer;
begin
  if p_report is null or jsonb_typeof(p_report) <> 'object' then
    raise exception 'invalid_provider_response';
  end if;
  select * into selected_job from public.plus_makeup_jobs
  where id = p_job_id and user_id = p_user_id for update;
  if not found then raise exception 'job_not_found'; end if;

  remaining_points := public.ensure_point_wallet(p_user_id);
  if selected_job.status = 'succeeded' then return remaining_points; end if;
  if selected_job.status <> 'processing' then raise exception 'job_not_processing'; end if;

  -- A pre-migration job has no reservation because its legacy credit was
  -- already deducted when that job was created.
  if exists (
    select 1 from public.point_reservations
    where id = p_job_id and user_id = p_user_id and purpose = 'makeup_report'
  ) then
    remaining_points := public.commit_points(p_user_id, p_job_id);
  end if;
  update public.plus_makeup_jobs
  set status = 'succeeded', features = null, report = p_report,
      error_code = null, updated_at = now()
  where id = p_job_id;
  return remaining_points;
end;
$$;
create or replace function public.cleanup_plus_makeup_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_job public.plus_makeup_jobs%rowtype;
  deleted_count integer := 0;
begin
  for selected_job in
    select * from public.plus_makeup_jobs where expires_at <= now() for update skip locked
  loop
    if selected_job.status = 'processing' then
      perform public.refund_points(selected_job.user_id, selected_job.id);
    end if;
    delete from public.plus_makeup_jobs where id = selected_job.id;
    deleted_count := deleted_count + 1;
  end loop;
  return deleted_count;
end;
$$;
create or replace function public.fulfill_payment_order(
  p_order_id uuid,
  p_provider_order_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_order public.payment_orders%rowtype;
begin
  if p_order_id is null or p_provider_order_id is null or btrim(p_provider_order_id) = '' then
    raise exception 'invalid_payment';
  end if;
  select * into selected_order from public.payment_orders where id = p_order_id for update;
  if not found then raise exception 'payment_order_not_found'; end if;
  if selected_order.status = 'paid' then return 'already_paid'; end if;
  if selected_order.status not in ('created', 'pending') then raise exception 'payment_order_not_payable'; end if;
  if selected_order.product_code <> 'points' or selected_order.points_granted <= 0 then
    raise exception 'legacy_payment_not_supported';
  end if;

  update public.payment_orders
  set status = 'paid', provider_order_id = left(btrim(p_provider_order_id), 200),
      paid_at = now(), updated_at = now()
  where id = selected_order.id;
  perform public.ensure_point_wallet(selected_order.user_id);
  update public.reward_wallets
  set points = points + selected_order.points_granted, updated_at = now()
  where user_id = selected_order.user_id;
  insert into public.entitlement_ledger (
    user_id, entitlement_type, delta, reason, reference_id, idempotency_key
  ) values (
    selected_order.user_id, 'points', selected_order.points_granted,
    'payment_points', selected_order.id, 'payment:' || selected_order.id::text || ':points'
  ) on conflict (idempotency_key) do nothing;
  return 'paid';
end;
$$;
create or replace function public.refund_payment_order(
  p_order_id uuid,
  p_provider_reference text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_order public.payment_orders%rowtype;
  selected_wallet public.reward_wallets%rowtype;
  reversed_points integer;
begin
  if p_order_id is null or p_provider_reference is null or btrim(p_provider_reference) = '' then
    raise exception 'invalid_payment';
  end if;
  select * into selected_order from public.payment_orders where id = p_order_id for update;
  if not found then raise exception 'payment_order_not_found'; end if;
  if selected_order.status = 'refunded' then return 'already_refunded'; end if;
  if selected_order.status <> 'paid' then raise exception 'payment_order_not_refundable'; end if;
  if selected_order.product_code <> 'points' then raise exception 'legacy_payment_not_supported'; end if;

  perform public.ensure_point_wallet(selected_order.user_id);
  select * into selected_wallet from public.reward_wallets
  where user_id = selected_order.user_id for update;
  reversed_points := least(selected_wallet.points, selected_order.points_granted);
  update public.reward_wallets
  set points = points - reversed_points, updated_at = now()
  where user_id = selected_order.user_id;
  update public.payment_orders
  set status = 'refunded', failure_code = case
        when reversed_points < selected_order.points_granted then 'points_partially_consumed' else null end,
      refunded_at = now(), refund_provider_id = left(btrim(p_provider_reference), 200), updated_at = now()
  where id = selected_order.id;
  if reversed_points > 0 then
    insert into public.entitlement_ledger (
      user_id, entitlement_type, delta, reason, reference_id, idempotency_key
    ) values (
      selected_order.user_id, 'points', -reversed_points, 'payment_refund', selected_order.id,
      'payment:' || selected_order.id::text || ':refund:points'
    ) on conflict (idempotency_key) do nothing;
  end if;
  return case when reversed_points < selected_order.points_granted
    then 'refunded_partial_reversal' else 'refunded' end;
end;
$$;
create or replace function public.grant_points_by_email(
  p_email text,
  p_points integer,
  p_admin_id uuid,
  p_reference_id uuid
)
returns table (user_id uuid, points integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  selected_wallet public.reward_wallets%rowtype;
begin
  if p_email is null or btrim(p_email) = '' or p_admin_id is null
    or p_reference_id is null or p_points is null or p_points <= 0
    or p_points > 100000 then
    raise exception 'invalid_point_amount';
  end if;
  select id into target_user_id from auth.users
  where lower(email) = lower(btrim(p_email));
  if target_user_id is null then raise exception 'account_not_found'; end if;

  perform public.ensure_point_wallet(target_user_id);
  insert into public.entitlement_ledger (
    user_id, entitlement_type, delta, reason, reference_id, idempotency_key
  ) values (
    target_user_id, 'points', p_points, 'manual_points', p_reference_id,
    'manual-points:' || p_reference_id::text
  ) on conflict (idempotency_key) do nothing;
  if found then
    update public.reward_wallets
    set points = points + p_points, updated_at = now()
    where user_id = target_user_id;
  end if;
  select * into selected_wallet from public.reward_wallets where user_id = target_user_id;
  return query select target_user_id, selected_wallet.points;
end;
$$;
revoke all on function public.ensure_point_wallet(uuid) from public, anon, authenticated;
revoke all on function public.get_point_balance(uuid) from public, anon, authenticated;
revoke all on function public.reserve_points(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.commit_points(uuid, uuid) from public, anon, authenticated;
revoke all on function public.refund_points(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cleanup_point_reservations() from public, anon, authenticated;
revoke all on function public.create_plus_makeup_job(uuid, text, jsonb, text[], text, text) from public, anon, authenticated;
revoke all on function public.refund_plus_makeup_job(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.complete_plus_makeup_job(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.grant_points_by_email(text, integer, uuid, uuid) from public, anon, authenticated;
grant execute on function public.ensure_point_wallet(uuid) to service_role;
grant execute on function public.get_point_balance(uuid) to service_role;
grant execute on function public.reserve_points(uuid, uuid, text) to service_role;
grant execute on function public.commit_points(uuid, uuid) to service_role;
grant execute on function public.refund_points(uuid, uuid) to service_role;
grant execute on function public.cleanup_point_reservations() to service_role;
grant execute on function public.create_plus_makeup_job(uuid, text, jsonb, text[], text, text) to service_role;
grant execute on function public.refund_plus_makeup_job(uuid, uuid, text) to service_role;
grant execute on function public.complete_plus_makeup_job(uuid, uuid, jsonb) to service_role;
grant execute on function public.grant_points_by_email(text, integer, uuid, uuid) to service_role;
do $$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'cleanup-point-reservations';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'cleanup-point-reservations', '*/15 * * * *',
    'select public.cleanup_point_reservations();'
  );
end;
$$;
