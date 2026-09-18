-- Admin-managed membership support and a single editable MAKE UP Pro catalog.
alter table public.subscriptions
  add column if not exists management_source text not null default 'payment';

alter table public.subscriptions
  drop constraint if exists subscriptions_management_source_check;
alter table public.subscriptions
  add constraint subscriptions_management_source_check
  check (management_source in ('payment', 'admin'));

update public.membership_plans
set is_active = false, updated_at = now()
where code <> 'pro';

insert into public.membership_plans
  (code, provider, name, monthly_amount_minor, currency, monthly_points, sort_order, is_active)
values
  ('pro', 'zpay', 'MAKE UP Pro', 4900, 'CNY', 300, 10, true),
  ('pro', 'stripe', 'MAKE UP Pro', 699, 'USD', 300, 10, true)
on conflict (code, provider) do update set
  name = excluded.name,
  monthly_amount_minor = excluded.monthly_amount_minor,
  currency = excluded.currency,
  monthly_points = excluded.monthly_points,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

create table if not exists public.admin_membership_actions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid references auth.users(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  action text not null check (action in ('grant_month', 'cancel', 'update_plan')),
  points_granted integer not null default 0 check (points_granted >= 0),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now()
);

alter table public.admin_membership_actions enable row level security;
revoke all on table public.admin_membership_actions from public, anon, authenticated;
grant select, insert on table public.admin_membership_actions to service_role;

create or replace function public.admin_membership_status_by_email(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user auth.users%rowtype;
  selected_subscription public.subscriptions%rowtype;
  point_balance integer;
begin
  if p_email is null or btrim(p_email) = '' then raise exception 'invalid_email'; end if;
  select * into target_user from auth.users
  where lower(email) = lower(btrim(p_email));
  if not found then raise exception 'account_not_found'; end if;
  if target_user.email_confirmed_at is null then raise exception 'email_not_confirmed'; end if;

  point_balance := public.ensure_point_wallet(target_user.id);
  select * into selected_subscription from public.subscriptions
  where user_id = target_user.id
  order by created_at desc
  limit 1;

  return jsonb_build_object(
    'userId', target_user.id,
    'email', lower(target_user.email),
    'points', point_balance,
    'subscription', case when selected_subscription.id is null then null else jsonb_build_object(
      'id', selected_subscription.id,
      'provider', selected_subscription.provider,
      'planCode', selected_subscription.plan_code,
      'status', selected_subscription.status,
      'currentPeriodStart', selected_subscription.current_period_start,
      'currentPeriodEnd', selected_subscription.current_period_end,
      'managementSource', selected_subscription.management_source,
      'cancelAtPeriodEnd', selected_subscription.cancel_at_period_end
    ) end
  );
end;
$$;

create or replace function public.admin_grant_membership_month(
  p_email text,
  p_admin_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  if exists (select 1 from public.admin_membership_actions where idempotency_key = p_idempotency_key and target_user_id <> target_user.id) then
    raise exception 'idempotency_key_reused';
  end if;
  if exists (select 1 from public.admin_membership_actions where idempotency_key = p_idempotency_key and target_user_id = target_user.id) then
    return public.admin_membership_status_by_email(p_email);
  end if;
  select * into selected_plan from public.membership_plans
  where code = 'pro' and provider = 'zpay';
  if not found then raise exception 'membership_plan_not_found'; end if;

  select * into selected_subscription from public.subscriptions
  where user_id = target_user.id
    and status in ('active', 'trialing', 'past_due', 'unpaid', 'incomplete')
  order by current_period_end desc nulls last
  limit 1
  for update;
  if found and selected_subscription.provider = 'stripe' then
    raise exception 'external_subscription_requires_provider';
  end if;

  period_start := greatest(coalesce(selected_subscription.current_period_end, now()), now());
  period_end := period_start + interval '1 month';
  if selected_subscription.id is null then
    insert into public.subscriptions (
      user_id, provider, plan_code, status, current_period_start, current_period_end,
      cancel_at_period_end, management_source, created_at, updated_at
    ) values (
      target_user.id, 'zpay', 'pro', 'active', period_start, period_end,
      false, 'admin', now(), now()
    ) returning * into selected_subscription;
  else
    update public.subscriptions
    set plan_code = 'pro', status = 'active', current_period_start = period_start,
        current_period_end = period_end, cancel_at_period_end = false, ended_at = null,
        management_source = case when management_source = 'payment' then 'payment' else 'admin' end,
        updated_at = now()
    where id = selected_subscription.id
    returning * into selected_subscription;
  end if;

  perform public.grant_subscription_cycle(
    selected_subscription.id,
    'zpay',
    '',
    'admin:' || p_idempotency_key::text,
    period_start,
    period_end
  );
  insert into public.admin_membership_actions (
    admin_user_id, target_user_id, subscription_id, action, points_granted, idempotency_key
  ) values (
    p_admin_id, target_user.id, selected_subscription.id, 'grant_month',
    selected_plan.monthly_points, p_idempotency_key
  );
  return public.admin_membership_status_by_email(p_email);
end;
$$;

create or replace function public.admin_cancel_membership(
  p_email text,
  p_admin_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user auth.users%rowtype;
  selected_subscription public.subscriptions%rowtype;
begin
  if p_admin_id is null or p_idempotency_key is null then raise exception 'invalid_membership_action'; end if;
  select * into target_user from auth.users
  where lower(email) = lower(btrim(p_email)) and email_confirmed_at is not null;
  if not found then raise exception 'account_not_found'; end if;
  if exists (select 1 from public.admin_membership_actions where idempotency_key = p_idempotency_key and target_user_id <> target_user.id) then
    raise exception 'idempotency_key_reused';
  end if;
  if exists (select 1 from public.admin_membership_actions where idempotency_key = p_idempotency_key and target_user_id = target_user.id) then
    return public.admin_membership_status_by_email(p_email);
  end if;
  select * into selected_subscription from public.subscriptions
  where user_id = target_user.id
    and status in ('active', 'trialing', 'past_due', 'unpaid', 'incomplete')
  order by created_at desc
  limit 1
  for update;
  if not found then raise exception 'membership_not_found'; end if;
  if selected_subscription.provider = 'stripe' then
    raise exception 'external_subscription_requires_provider';
  end if;

  update public.subscriptions
  set status = 'canceled', cancel_at_period_end = false, ended_at = now(),
      current_period_end = least(coalesce(current_period_end, now()), now()), updated_at = now()
  where id = selected_subscription.id
  returning * into selected_subscription;
  insert into public.admin_membership_actions (
    admin_user_id, target_user_id, subscription_id, action, idempotency_key
  ) values (
    p_admin_id, target_user.id, selected_subscription.id, 'cancel', p_idempotency_key
  );
  return public.admin_membership_status_by_email(p_email);
end;
$$;

create or replace function public.admin_update_membership_plan(
  p_admin_id uuid,
  p_idempotency_key uuid,
  p_name text,
  p_monthly_points integer,
  p_zpay_amount_minor integer,
  p_stripe_amount_minor integer,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan_rows jsonb;
begin
  if p_admin_id is null or p_idempotency_key is null or p_name is null
    or length(btrim(p_name)) < 2 or length(btrim(p_name)) > 80
    or p_monthly_points is null or p_monthly_points < 1 or p_monthly_points > 100000
    or p_zpay_amount_minor is null or p_zpay_amount_minor < 1
    or p_stripe_amount_minor is null or p_stripe_amount_minor < 1
    or p_is_active is null then
    raise exception 'invalid_membership_plan';
  end if;

  if not exists (select 1 from public.admin_membership_actions where idempotency_key = p_idempotency_key) then
    update public.membership_plans set is_active = false, updated_at = now() where code <> 'pro';
    insert into public.membership_plans (
      code, provider, name, monthly_amount_minor, currency, monthly_points, sort_order, is_active
    ) values
      ('pro', 'zpay', btrim(p_name), p_zpay_amount_minor, 'CNY', p_monthly_points, 10, p_is_active),
      ('pro', 'stripe', btrim(p_name), p_stripe_amount_minor, 'USD', p_monthly_points, 10, p_is_active)
    on conflict (code, provider) do update set
      name = excluded.name,
      monthly_amount_minor = excluded.monthly_amount_minor,
      currency = excluded.currency,
      monthly_points = excluded.monthly_points,
      sort_order = excluded.sort_order,
      is_active = excluded.is_active,
      updated_at = now();
    insert into public.admin_membership_actions (admin_user_id, action, idempotency_key)
    values (p_admin_id, 'update_plan', p_idempotency_key);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'code', code,
    'provider', provider,
    'name', name,
    'monthlyAmountMinor', monthly_amount_minor,
    'currency', currency,
    'monthlyPoints', monthly_points,
    'stripePriceIdConfigured', stripe_price_id is not null,
    'isActive', is_active
  ) order by provider), '[]'::jsonb)
  into plan_rows
  from public.membership_plans
  where code = 'pro';
  return plan_rows;
end;
$$;

comment on table public.admin_membership_actions is
  'Minimal admin membership audit. Stores account IDs and action outcomes, never payment evidence or user content.';

revoke all on function public.admin_membership_status_by_email(text) from public, anon, authenticated;
revoke all on function public.admin_grant_membership_month(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_cancel_membership(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_update_membership_plan(uuid, uuid, text, integer, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.admin_membership_status_by_email(text) to service_role;
grant execute on function public.admin_grant_membership_month(text, uuid, uuid) to service_role;
grant execute on function public.admin_cancel_membership(text, uuid, uuid) to service_role;
grant execute on function public.admin_update_membership_plan(uuid, uuid, text, integer, integer, integer, boolean) to service_role;
