-- Monthly membership plans are the primary commercial product. Legacy point
-- packages and orders remain readable for existing users and reconciliation.
create table if not exists public.membership_plans (
  code text not null,
  provider text not null check (provider in ('stripe', 'zpay')),
  name text not null,
  monthly_amount_minor integer not null check (monthly_amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  monthly_points integer not null check (monthly_points > 0),
  stripe_price_id text,
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (code, provider)
);

insert into public.membership_plans
  (code, provider, name, monthly_amount_minor, currency, monthly_points, sort_order)
values
  ('starter', 'zpay', '轻享会员', 990, 'CNY', 50, 10),
  ('standard', 'zpay', '常用会员', 1990, 'CNY', 130, 20),
  ('pro', 'zpay', '充足会员', 3990, 'CNY', 300, 30),
  ('starter', 'stripe', 'Starter', 199, 'USD', 50, 10),
  ('standard', 'stripe', 'Standard', 499, 'USD', 130, 20),
  ('pro', 'stripe', 'Pro', 999, 'USD', 300, 30)
on conflict (code, provider) do update set
  name = excluded.name,
  monthly_amount_minor = excluded.monthly_amount_minor,
  currency = excluded.currency,
  monthly_points = excluded.monthly_points,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'zpay')),
  plan_code text not null,
  provider_customer_id text,
  provider_subscription_id text,
  status text not null check (status in ('active', 'trialing', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_plan_fkey foreign key (plan_code, provider)
    references public.membership_plans(code, provider),
  constraint subscriptions_provider_id_unique unique (provider, provider_subscription_id)
);

create unique index if not exists subscriptions_one_open_per_user_idx
  on public.subscriptions (user_id)
  where status in ('active', 'trialing', 'past_due', 'unpaid', 'incomplete');

create table if not exists public.subscription_cycles (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'zpay')),
  provider_invoice_id text,
  provider_event_id text,
  period_start timestamptz not null,
  period_end timestamptz not null,
  points_granted integer not null check (points_granted > 0),
  status text not null default 'granted' check (status in ('pending', 'granted', 'failed', 'refunded')),
  granted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, period_start, period_end),
  unique (provider, provider_invoice_id)
);

alter table public.payment_orders
  add column if not exists plan_code text,
  add column if not exists subscription_id uuid references public.subscriptions(id) on delete set null;

alter table public.payment_orders
  drop constraint if exists payment_orders_product_code_check;
alter table public.payment_orders
  add constraint payment_orders_product_code_check
  check (product_code in ('plus', 'ai_credits', 'points', 'membership'));

alter table public.payment_orders
  add constraint payment_orders_membership_plan_fkey
  foreign key (plan_code, provider)
  references public.membership_plans(code, provider);

alter table public.membership_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_cycles enable row level security;
revoke all on table public.membership_plans, public.subscriptions, public.subscription_cycles from public, anon, authenticated;
grant select on table public.membership_plans to anon, authenticated;
grant select on table public.subscriptions to authenticated;
grant select, insert, update on table public.membership_plans, public.subscriptions, public.subscription_cycles to service_role;
create policy membership_plans_public_read on public.membership_plans
  for select to anon, authenticated using (is_active);
create policy subscriptions_own_read on public.subscriptions
  for select to authenticated using (user_id = auth.uid());

comment on table public.membership_plans is
  'Server-owned monthly membership catalog. Stripe renews automatically; ZPAY renews manually until a provider recurring contract is verified.';
comment on table public.subscriptions is
  'Minimal subscription state. Never stores payment payloads, photos, ratios, creator names, or AI output.';
comment on table public.subscription_cycles is
  'One idempotent monthly point grant per provider-confirmed billing period.';

create or replace function public.grant_subscription_cycle(
  p_subscription_id uuid,
  p_provider text,
  p_provider_invoice_id text,
  p_provider_event_id text,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_subscription public.subscriptions%rowtype;
  selected_plan public.membership_plans%rowtype;
  cycle_id uuid;
  remaining_points integer;
begin
  if p_subscription_id is null or p_provider not in ('stripe', 'zpay')
    or p_period_start is null or p_period_end is null or p_period_end <= p_period_start then
    raise exception 'invalid_subscription_cycle';
  end if;
  select * into selected_subscription from public.subscriptions
  where id = p_subscription_id for update;
  if not found then raise exception 'subscription_not_found'; end if;
  select * into selected_plan from public.membership_plans
  where code = selected_subscription.plan_code and provider = selected_subscription.provider;
  if not found then raise exception 'membership_plan_not_found'; end if;

  insert into public.subscription_cycles (
    subscription_id, provider, provider_invoice_id, provider_event_id,
    period_start, period_end, points_granted, status, granted_at
  ) values (
    p_subscription_id, p_provider, nullif(btrim(p_provider_invoice_id), ''),
    nullif(btrim(p_provider_event_id), ''), p_period_start, p_period_end,
    selected_plan.monthly_points, 'granted', now()
  ) on conflict (subscription_id, period_start, period_end) do nothing
  returning id into cycle_id;

  if cycle_id is null then
    select points into remaining_points from public.reward_wallets
    where user_id = selected_subscription.user_id;
    return coalesce(remaining_points, public.ensure_point_wallet(selected_subscription.user_id));
  end if;

  perform public.ensure_point_wallet(selected_subscription.user_id);
  update public.reward_wallets
  set points = points + selected_plan.monthly_points, updated_at = now()
  where user_id = selected_subscription.user_id
  returning points into remaining_points;
  insert into public.entitlement_ledger (
    user_id, entitlement_type, delta, reason, reference_id, idempotency_key
  ) values (
    selected_subscription.user_id, 'points', selected_plan.monthly_points,
    case when p_provider = 'zpay' then 'subscription_manual_renewal' else 'subscription_renewal_grant' end,
    cycle_id, 'subscription-cycle:' || cycle_id::text
  ) on conflict (idempotency_key) do nothing;
  return remaining_points;
end;
$$;

revoke all on function public.grant_subscription_cycle(uuid, text, text, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.grant_subscription_cycle(uuid, text, text, text, timestamptz, timestamptz)
  to service_role;

create or replace function public.fulfill_manual_membership_payment(
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
  selected_subscription public.subscriptions%rowtype;
  period_start timestamptz;
  period_end timestamptz;
begin
  if p_order_id is null or p_provider_order_id is null or btrim(p_provider_order_id) = '' then
    raise exception 'invalid_payment';
  end if;
  select * into selected_order from public.payment_orders where id = p_order_id for update;
  if not found then raise exception 'payment_order_not_found'; end if;
  if selected_order.status = 'paid' then return 'already_paid'; end if;
  if selected_order.product_code <> 'membership' or selected_order.plan_code is null then
    raise exception 'not_membership_payment';
  end if;
  select * into selected_subscription from public.subscriptions
  where user_id = selected_order.user_id and provider = 'zpay'
    and status in ('active', 'trialing', 'past_due', 'unpaid')
  order by current_period_end desc nulls last
  limit 1 for update;
  period_start := greatest(coalesce(selected_subscription.current_period_end, now()), now());
  period_end := period_start + interval '1 month';
  if not found then
    insert into public.subscriptions (
      user_id, provider, plan_code, status, current_period_start, current_period_end,
      cancel_at_period_end, created_at, updated_at
    ) values (
      selected_order.user_id, 'zpay', selected_order.plan_code, 'active', period_start,
      period_end, false, now(), now()
    ) returning * into selected_subscription;
  else
    update public.subscriptions
    set status = 'active', plan_code = selected_order.plan_code,
        current_period_start = period_start, current_period_end = period_end,
        cancel_at_period_end = false, ended_at = null, updated_at = now()
    where id = selected_subscription.id
    returning * into selected_subscription;
  end if;
  update public.payment_orders
  set status = 'paid', provider_order_id = left(btrim(p_provider_order_id), 200),
      subscription_id = selected_subscription.id, paid_at = now(), updated_at = now()
  where id = selected_order.id;
  perform public.grant_subscription_cycle(
    selected_subscription.id, 'zpay', p_provider_order_id,
    'zpay:' || p_provider_order_id, period_start, period_end
  );
  return 'paid';
end;
$$;

revoke all on function public.fulfill_manual_membership_payment(uuid, text)
  from public, anon, authenticated;
grant execute on function public.fulfill_manual_membership_payment(uuid, text)
  to service_role;
