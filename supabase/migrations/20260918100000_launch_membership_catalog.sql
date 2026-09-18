-- Launch catalog: one report purchase plus monthly and annual memberships.
-- Existing ledgers and subscriptions remain readable; inactive products cannot be purchased.
alter table public.membership_plans
  add column if not exists billing_interval text not null default 'month'
    check (billing_interval in ('month', 'year')),
  add column if not exists match_access text not null default 'none'
    check (match_access in ('none', 'daily', 'unlimited')),
  add column if not exists daily_match_limit integer
    check (daily_match_limit is null or daily_match_limit > 0);

alter table public.subscriptions
  add column if not exists next_points_grant_at timestamptz;

update public.point_packages set is_active = false, updated_at = now();
insert into public.point_packages
  (code, provider, name, points, amount_minor, currency, sort_order, is_active)
values
  ('report_single', 'zpay', '单次完整报告', 100, 1990, 'CNY', 10, true),
  ('report_single', 'stripe', 'Single complete report', 100, 299, 'USD', 10, true)
on conflict (code, provider) do update set
  name = excluded.name, points = excluded.points, amount_minor = excluded.amount_minor,
  currency = excluded.currency, sort_order = excluded.sort_order, is_active = true,
  updated_at = now();

update public.membership_plans set is_active = false, updated_at = now();
insert into public.membership_plans (
  code, provider, name, monthly_amount_minor, currency, monthly_points,
  billing_interval, match_access, daily_match_limit, sort_order, is_active
)
values
  ('pro_monthly', 'zpay', 'MAKE UP Pro 月卡', 5900, 'CNY', 1000, 'month', 'daily', 50, 20, true),
  ('pro_monthly', 'stripe', 'MAKE UP Pro Monthly', 899, 'USD', 1000, 'month', 'daily', 50, 20, true),
  ('pro_annual', 'zpay', 'MAKE UP Pro 年卡', 59900, 'CNY', 2000, 'year', 'unlimited', null, 30, true),
  ('pro_annual', 'stripe', 'MAKE UP Pro Annual', 8999, 'USD', 2000, 'year', 'unlimited', null, 30, true)
on conflict (code, provider) do update set
  name = excluded.name, monthly_amount_minor = excluded.monthly_amount_minor,
  currency = excluded.currency, monthly_points = excluded.monthly_points,
  billing_interval = excluded.billing_interval, match_access = excluded.match_access,
  daily_match_limit = excluded.daily_match_limit, sort_order = excluded.sort_order,
  is_active = true, updated_at = now();

create table if not exists public.membership_match_usage (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  usage_date date not null,
  created_at timestamptz not null default now()
);
create index if not exists membership_match_usage_daily_idx
  on public.membership_match_usage (subscription_id, usage_date);
alter table public.membership_match_usage enable row level security;
revoke all on table public.membership_match_usage from public, anon, authenticated;
grant select, insert, delete on table public.membership_match_usage to service_role;
comment on table public.membership_match_usage is
  'Successful monthly-member match usage only. Never stores photos, ratios, rankings, creators, or results.';

create or replace function public.get_membership_match_status(p_user_id uuid)
returns table (membership_match_mode text, membership_matches_remaining integer)
language plpgsql security definer set search_path = '' as $$
declare
  selected_subscription public.subscriptions%rowtype;
  selected_plan public.membership_plans%rowtype;
  used_today integer;
begin
  select subscription.* into selected_subscription
  from public.subscriptions as subscription
  where subscription.user_id = p_user_id
    and subscription.status in ('active', 'trialing')
    and subscription.current_period_end > now()
  order by subscription.current_period_end desc limit 1;
  if not found then return query select null::text, null::integer; return; end if;

  select plan.* into selected_plan from public.membership_plans as plan
  where plan.code = selected_subscription.plan_code and plan.provider = selected_subscription.provider;
  if not found or selected_plan.match_access = 'none' then
    return query select null::text, null::integer; return;
  end if;
  if selected_plan.match_access = 'unlimited' then
    return query select 'unlimited'::text, null::integer; return;
  end if;

  select count(*)::integer into used_today
  from public.membership_match_usage
  where subscription_id = selected_subscription.id
    and usage_date = (now() at time zone 'Asia/Shanghai')::date;
  return query select 'daily'::text, greatest(selected_plan.daily_match_limit - used_today, 0);
end;
$$;

create or replace function public.record_membership_match_success(p_user_id uuid, p_success_id uuid)
returns table (
  referral_code text, match_credits integer, ai_credits integer,
  successful_match_count integer, successful_invites integer, pending_referral boolean
)
language plpgsql security definer set search_path = '' as $$
declare
  selected_subscription public.subscriptions%rowtype;
  selected_plan public.membership_plans%rowtype;
  used_today integer;
begin
  if exists (select 1 from public.reward_match_successes where id = p_success_id and user_id = p_user_id) then
    return query select * from public.get_reward_status(p_user_id); return;
  end if;
  select subscription.* into selected_subscription
  from public.subscriptions as subscription
  where subscription.user_id = p_user_id
    and subscription.status in ('active', 'trialing')
    and subscription.current_period_end > now()
  order by subscription.current_period_end desc limit 1 for update;
  if not found then raise exception 'membership_match_unavailable'; end if;
  select plan.* into selected_plan from public.membership_plans as plan
  where plan.code = selected_subscription.plan_code and plan.provider = selected_subscription.provider;
  if not found or selected_plan.match_access = 'none' then raise exception 'membership_match_unavailable'; end if;

  if selected_plan.match_access = 'daily' then
    select count(*)::integer into used_today from public.membership_match_usage
    where subscription_id = selected_subscription.id
      and usage_date = (now() at time zone 'Asia/Shanghai')::date;
    if used_today >= selected_plan.daily_match_limit then raise exception 'daily_match_limit_reached'; end if;
    insert into public.membership_match_usage (id, user_id, subscription_id, usage_date)
    values (p_success_id, p_user_id, selected_subscription.id, (now() at time zone 'Asia/Shanghai')::date);
  end if;
  return query select * from public.record_reward_match_success(p_user_id, p_success_id, false);
end;
$$;

revoke all on function public.get_membership_match_status(uuid) from public, anon, authenticated;
revoke all on function public.record_membership_match_success(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_membership_match_status(uuid) to service_role;
grant execute on function public.record_membership_match_success(uuid, uuid) to service_role;

create or replace function public.reserve_points(p_user_id uuid, p_reservation_id uuid, p_purpose text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  selected_wallet public.reward_wallets%rowtype;
  selected_reservation public.point_reservations%rowtype;
  required_points integer;
  reservation_expiry timestamptz;
begin
  required_points := case p_purpose when 'ai_discovery' then 3 when 'makeup_report' then 100 else null end;
  reservation_expiry := case p_purpose when 'ai_discovery' then now() + interval '10 minutes'
    when 'makeup_report' then now() + interval '24 hours' else null end;
  if p_user_id is null or p_reservation_id is null or required_points is null then raise exception 'invalid_points_reservation'; end if;
  perform public.ensure_point_wallet(p_user_id);
  select * into selected_wallet from public.reward_wallets where user_id = p_user_id for update;
  select * into selected_reservation from public.point_reservations where id = p_reservation_id;
  if found then
    if selected_reservation.user_id <> p_user_id or selected_reservation.purpose <> p_purpose then raise exception 'points_reservation_conflict'; end if;
    return selected_wallet.points;
  end if;
  if selected_wallet.points < required_points then raise exception 'no_points'; end if;
  insert into public.point_reservations (id, user_id, purpose, points, expires_at)
  values (p_reservation_id, p_user_id, p_purpose, required_points, reservation_expiry);
  update public.reward_wallets set points = points - required_points, updated_at = now()
  where user_id = p_user_id returning * into selected_wallet;
  insert into public.entitlement_ledger (user_id, entitlement_type, delta, reason, reference_id, idempotency_key)
  values (p_user_id, 'points', -required_points, p_purpose || '_reserved', p_reservation_id,
    'points:' || p_reservation_id::text || ':reserve') on conflict (idempotency_key) do nothing;
  return selected_wallet.points;
end;
$$;
revoke all on function public.reserve_points(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_points(uuid, uuid, text) to service_role;

-- Future legacy report credits convert at the current cost of one complete report.
create or replace function public.ensure_point_wallet(p_user_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  selected_wallet public.reward_wallets%rowtype;
  selected_membership public.plus_memberships%rowtype;
  converted_ai integer := 0;
  converted_reports integer := 0;
begin
  perform public.ensure_reward_wallet(p_user_id);
  select * into selected_wallet from public.reward_wallets where user_id = p_user_id for update;
  if selected_wallet.ai_credits > 0 then
    converted_ai := selected_wallet.ai_credits * 3;
    update public.reward_wallets set points = points + converted_ai, ai_credits = 0, updated_at = now()
    where user_id = p_user_id returning * into selected_wallet;
    insert into public.entitlement_ledger (user_id, entitlement_type, delta, reason, idempotency_key)
    values (p_user_id, 'points', converted_ai, 'legacy_ai_conversion', 'conversion:ai:' || gen_random_uuid()::text);
  end if;
  select * into selected_membership from public.plus_memberships where user_id = p_user_id for update;
  if found and selected_membership.trial_credits > 0 then
    converted_reports := selected_membership.trial_credits::integer * 100;
    update public.plus_memberships set trial_credits = 0, updated_at = now() where user_id = p_user_id;
    update public.reward_wallets set points = points + converted_reports, updated_at = now()
    where user_id = p_user_id returning * into selected_wallet;
    insert into public.entitlement_ledger (user_id, entitlement_type, delta, reason, idempotency_key)
    values (p_user_id, 'points', converted_reports, 'legacy_report_conversion', 'conversion:report:' || gen_random_uuid()::text);
  end if;
  return selected_wallet.points;
end;
$$;
revoke all on function public.ensure_point_wallet(uuid) from public, anon, authenticated;
grant execute on function public.ensure_point_wallet(uuid) to service_role;

-- Bring already-converted legacy report credits up from 10 to 100 points per credit.
do $$
declare conversion record;
begin
  for conversion in select id, user_id, delta from public.entitlement_ledger where reason = 'legacy_report_conversion' and delta > 0 loop
    insert into public.entitlement_ledger (user_id, entitlement_type, delta, reason, reference_id, idempotency_key)
    values (conversion.user_id, 'points', conversion.delta * 9, 'legacy_report_conversion_adjustment', conversion.id,
      'conversion:report-v2:' || conversion.id::text) on conflict (idempotency_key) do nothing;
    if found then update public.reward_wallets set points = points + conversion.delta * 9, updated_at = now() where user_id = conversion.user_id; end if;
  end loop;
end;
$$;

create or replace function public.grant_subscription_cycle(
  p_subscription_id uuid, p_provider text, p_provider_invoice_id text, p_provider_event_id text,
  p_period_start timestamptz, p_period_end timestamptz
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  selected_subscription public.subscriptions%rowtype;
  selected_plan public.membership_plans%rowtype;
  cycle_id uuid;
  remaining_points integer;
  grant_end timestamptz;
begin
  if p_subscription_id is null or p_provider not in ('stripe', 'zpay') or p_period_start is null
    or p_period_end is null or p_period_end <= p_period_start then raise exception 'invalid_subscription_cycle'; end if;
  select * into selected_subscription from public.subscriptions where id = p_subscription_id for update;
  if not found then raise exception 'subscription_not_found'; end if;
  select * into selected_plan from public.membership_plans
  where code = selected_subscription.plan_code and provider = selected_subscription.provider;
  if not found then raise exception 'membership_plan_not_found'; end if;
  grant_end := case when selected_plan.billing_interval = 'year'
    then least(p_period_start + interval '1 month', selected_subscription.current_period_end)
    else p_period_end end;
  insert into public.subscription_cycles (
    subscription_id, provider, provider_invoice_id, provider_event_id,
    period_start, period_end, points_granted, status, granted_at
  ) values (
    p_subscription_id, p_provider, nullif(btrim(p_provider_invoice_id), ''), nullif(btrim(p_provider_event_id), ''),
    p_period_start, grant_end, selected_plan.monthly_points, 'granted', now()
  ) on conflict (subscription_id, period_start, period_end) do nothing returning id into cycle_id;
  if cycle_id is null then return public.ensure_point_wallet(selected_subscription.user_id); end if;
  perform public.ensure_point_wallet(selected_subscription.user_id);
  update public.reward_wallets set points = points + selected_plan.monthly_points, updated_at = now()
  where user_id = selected_subscription.user_id returning points into remaining_points;
  insert into public.entitlement_ledger (user_id, entitlement_type, delta, reason, reference_id, idempotency_key)
  values (selected_subscription.user_id, 'points', selected_plan.monthly_points,
    case when p_provider = 'zpay' then 'subscription_manual_renewal' else 'subscription_renewal_grant' end,
    cycle_id, 'subscription-cycle:' || cycle_id::text) on conflict (idempotency_key) do nothing;
  update public.subscriptions set next_points_grant_at = case when selected_plan.billing_interval = 'year' and grant_end < selected_subscription.current_period_end
    then grant_end else null end, updated_at = now() where id = p_subscription_id;
  return remaining_points;
end;
$$;

create or replace function public.grant_due_annual_subscription_cycles()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  selected_subscription public.subscriptions%rowtype;
  next_end timestamptz;
  granted_count integer := 0;
begin
  for selected_subscription in select * from public.subscriptions
    where status in ('active', 'trialing') and next_points_grant_at <= now()
      and next_points_grant_at < current_period_end for update skip locked
  loop
    next_end := least(selected_subscription.next_points_grant_at + interval '1 month', selected_subscription.current_period_end);
    perform public.grant_subscription_cycle(selected_subscription.id, selected_subscription.provider, '',
      'scheduled:' || selected_subscription.next_points_grant_at::text,
      selected_subscription.next_points_grant_at, next_end);
    granted_count := granted_count + 1;
  end loop;
  delete from public.membership_match_usage where usage_date < (now() at time zone 'Asia/Shanghai')::date - 32;
  return granted_count;
end;
$$;

create or replace function public.fulfill_manual_membership_payment(p_order_id uuid, p_provider_order_id text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  selected_order public.payment_orders%rowtype;
  selected_subscription public.subscriptions%rowtype;
  selected_plan public.membership_plans%rowtype;
  period_start timestamptz;
  period_end timestamptz;
begin
  if p_order_id is null or p_provider_order_id is null or btrim(p_provider_order_id) = '' then raise exception 'invalid_payment'; end if;
  select * into selected_order from public.payment_orders where id = p_order_id for update;
  if not found then raise exception 'payment_order_not_found'; end if;
  if selected_order.status = 'paid' then return 'already_paid'; end if;
  if selected_order.product_code <> 'membership' or selected_order.plan_code is null then raise exception 'not_membership_payment'; end if;
  select * into selected_plan from public.membership_plans where code = selected_order.plan_code and provider = 'zpay';
  if not found then raise exception 'membership_plan_not_found'; end if;
  select * into selected_subscription from public.subscriptions
  where user_id = selected_order.user_id and provider = 'zpay'
    and status in ('active', 'trialing', 'past_due', 'unpaid')
  order by current_period_end desc nulls last limit 1 for update;
  period_start := greatest(coalesce(selected_subscription.current_period_end, now()), now());
  period_end := period_start + case when selected_plan.billing_interval = 'year' then interval '1 year' else interval '1 month' end;
  if not found then
    insert into public.subscriptions (user_id, provider, plan_code, status, current_period_start, current_period_end,
      cancel_at_period_end, created_at, updated_at)
    values (selected_order.user_id, 'zpay', selected_order.plan_code, 'active', period_start, period_end, false, now(), now())
    returning * into selected_subscription;
  else
    update public.subscriptions set status = 'active', plan_code = selected_order.plan_code,
      current_period_start = period_start, current_period_end = period_end, cancel_at_period_end = false,
      ended_at = null, next_points_grant_at = null, updated_at = now()
    where id = selected_subscription.id returning * into selected_subscription;
  end if;
  update public.payment_orders set status = 'paid', provider_order_id = left(btrim(p_provider_order_id), 200),
    subscription_id = selected_subscription.id, paid_at = now(), updated_at = now() where id = selected_order.id;
  perform public.grant_subscription_cycle(selected_subscription.id, 'zpay', p_provider_order_id,
    'zpay:' || p_provider_order_id, period_start, period_end);
  return 'paid';
end;
$$;

revoke all on function public.grant_subscription_cycle(uuid, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.grant_due_annual_subscription_cycles() from public, anon, authenticated;
revoke all on function public.fulfill_manual_membership_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.grant_subscription_cycle(uuid, text, text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.grant_due_annual_subscription_cycles() to service_role;
grant execute on function public.fulfill_manual_membership_payment(uuid, text) to service_role;

-- Keep the existing admin workflow scoped to the monthly plan.
create or replace function public.admin_grant_membership_month(
  p_email text, p_admin_id uuid, p_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target_user auth.users%rowtype;
  selected_plan public.membership_plans%rowtype;
  selected_subscription public.subscriptions%rowtype;
  period_start timestamptz;
  period_end timestamptz;
begin
  if p_admin_id is null or p_idempotency_key is null then raise exception 'invalid_membership_action'; end if;
  select * into target_user from auth.users
  where lower(email) = lower(btrim(p_email)) and email_confirmed_at is not null;
  if not found then raise exception 'account_not_found'; end if;
  if exists (select 1 from public.admin_membership_actions where idempotency_key = p_idempotency_key and target_user_id <> target_user.id)
    then raise exception 'idempotency_key_reused'; end if;
  if exists (select 1 from public.admin_membership_actions where idempotency_key = p_idempotency_key and target_user_id = target_user.id)
    then return public.admin_membership_status_by_email(p_email); end if;
  select * into selected_plan from public.membership_plans where code = 'pro_monthly' and provider = 'zpay';
  if not found then raise exception 'membership_plan_not_found'; end if;
  select * into selected_subscription from public.subscriptions
  where user_id = target_user.id and status in ('active', 'trialing', 'past_due', 'unpaid', 'incomplete')
  order by current_period_end desc nulls last limit 1 for update;
  if found and selected_subscription.provider = 'stripe' then raise exception 'external_subscription_requires_provider'; end if;
  period_start := greatest(coalesce(selected_subscription.current_period_end, now()), now());
  period_end := period_start + interval '1 month';
  if selected_subscription.id is null then
    insert into public.subscriptions (user_id, provider, plan_code, status, current_period_start, current_period_end,
      cancel_at_period_end, management_source, created_at, updated_at)
    values (target_user.id, 'zpay', 'pro_monthly', 'active', period_start, period_end, false, 'admin', now(), now())
    returning * into selected_subscription;
  else
    update public.subscriptions set plan_code = 'pro_monthly', status = 'active', current_period_start = period_start,
      current_period_end = period_end, cancel_at_period_end = false, ended_at = null, next_points_grant_at = null,
      management_source = case when management_source = 'payment' then 'payment' else 'admin' end, updated_at = now()
    where id = selected_subscription.id returning * into selected_subscription;
  end if;
  perform public.grant_subscription_cycle(selected_subscription.id, 'zpay', '',
    'admin:' || p_idempotency_key::text, period_start, period_end);
  insert into public.admin_membership_actions
    (admin_user_id, target_user_id, subscription_id, action, points_granted, idempotency_key)
  values (p_admin_id, target_user.id, selected_subscription.id, 'grant_month', selected_plan.monthly_points, p_idempotency_key);
  return public.admin_membership_status_by_email(p_email);
end;
$$;

create or replace function public.admin_update_membership_plan(
  p_admin_id uuid, p_idempotency_key uuid, p_name text, p_monthly_points integer,
  p_zpay_amount_minor integer, p_stripe_amount_minor integer, p_is_active boolean
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare plan_rows jsonb;
begin
  if p_admin_id is null or p_idempotency_key is null or p_name is null
    or length(btrim(p_name)) < 2 or length(btrim(p_name)) > 80
    or p_monthly_points is null or p_monthly_points < 1 or p_monthly_points > 100000
    or p_zpay_amount_minor is null or p_zpay_amount_minor < 1
    or p_stripe_amount_minor is null or p_stripe_amount_minor < 1 or p_is_active is null
    then raise exception 'invalid_membership_plan'; end if;
  if not exists (select 1 from public.admin_membership_actions where idempotency_key = p_idempotency_key) then
    insert into public.membership_plans (
      code, provider, name, monthly_amount_minor, currency, monthly_points,
      billing_interval, match_access, daily_match_limit, sort_order, is_active
    ) values
      ('pro_monthly', 'zpay', btrim(p_name), p_zpay_amount_minor, 'CNY', p_monthly_points, 'month', 'daily', 50, 20, p_is_active),
      ('pro_monthly', 'stripe', btrim(p_name), p_stripe_amount_minor, 'USD', p_monthly_points, 'month', 'daily', 50, 20, p_is_active)
    on conflict (code, provider) do update set name = excluded.name,
      monthly_amount_minor = excluded.monthly_amount_minor, currency = excluded.currency,
      monthly_points = excluded.monthly_points, billing_interval = excluded.billing_interval,
      match_access = excluded.match_access, daily_match_limit = excluded.daily_match_limit,
      sort_order = excluded.sort_order, is_active = excluded.is_active, updated_at = now();
    insert into public.admin_membership_actions (admin_user_id, action, idempotency_key)
    values (p_admin_id, 'update_plan', p_idempotency_key);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', code, 'provider', provider, 'name', name,
    'monthlyAmountMinor', monthly_amount_minor, 'currency', currency,
    'monthlyPoints', monthly_points, 'stripePriceIdConfigured', stripe_price_id is not null,
    'isActive', is_active
  ) order by provider), '[]'::jsonb) into plan_rows
  from public.membership_plans where code = 'pro_monthly';
  return plan_rows;
end;
$$;

revoke all on function public.admin_grant_membership_month(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_update_membership_plan(uuid, uuid, text, integer, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.admin_grant_membership_month(text, uuid, uuid) to service_role;
grant execute on function public.admin_update_membership_plan(uuid, uuid, text, integer, integer, integer, boolean) to service_role;

-- Replace every still-active legacy Plus entitlement with one monthly plan.
-- The fixed ledger key makes the 1000-point conversion grant idempotent.
do $$
declare
  legacy_membership public.plus_memberships%rowtype;
  converted_subscription public.subscriptions%rowtype;
  conversion_cycle_id uuid;
  conversion_start timestamptz := now();
  conversion_end timestamptz := now() + interval '1 month';
begin
  for legacy_membership in
    select * from public.plus_memberships
    where status = 'active' and benefit_expires_at > conversion_start
    for update
  loop
    insert into public.subscriptions (
      user_id, provider, plan_code, status, current_period_start, current_period_end,
      cancel_at_period_end, management_source, created_at, updated_at
    ) values (
      legacy_membership.user_id, 'zpay', 'pro_monthly', 'active', conversion_start,
      conversion_end, true, 'admin', conversion_start, conversion_start
    ) returning * into converted_subscription;

    insert into public.subscription_cycles (
      subscription_id, provider, provider_invoice_id, provider_event_id,
      period_start, period_end, points_granted, status, granted_at
    ) values (
      converted_subscription.id, 'zpay', 'legacy-plus:' || legacy_membership.user_id::text,
      'legacy-plus-monthly-conversion', conversion_start, conversion_end,
      1000, 'granted', conversion_start
    ) on conflict (provider, provider_invoice_id) do nothing
    returning id into conversion_cycle_id;

    update public.plus_memberships
    set status = 'revoked', trial_credits = 0, updated_at = conversion_start
    where user_id = legacy_membership.user_id;

    perform public.ensure_point_wallet(legacy_membership.user_id);
    insert into public.entitlement_ledger (
      user_id, entitlement_type, delta, reason, reference_id, idempotency_key
    ) values (
      legacy_membership.user_id, 'points', 1000, 'legacy_plus_monthly_conversion',
      conversion_cycle_id, 'legacy-plus-monthly-conversion:' || legacy_membership.user_id::text
    ) on conflict (idempotency_key) do nothing;
    if found then
      update public.reward_wallets
      set points = points + 1000, updated_at = conversion_start
      where user_id = legacy_membership.user_id;
    end if;
  end loop;
end;
$$;

do $$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'grant-due-annual-subscription-cycles';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule('grant-due-annual-subscription-cycles', '17 * * * *',
    'select public.grant_due_annual_subscription_cycles();');
end;
$$;
