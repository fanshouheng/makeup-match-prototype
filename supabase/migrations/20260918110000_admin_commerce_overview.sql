-- Protected operating overview for registrations, orders, and memberships.
-- The function is service-role only and never returns photos, face data, reports,
-- provider payloads, or payment credentials.
create or replace function public.admin_commerce_overview()
returns jsonb
language sql
security definer
set search_path = ''
as $$
with recent_users as (
  select id, lower(email) as email, created_at, email_confirmed_at, last_sign_in_at
  from auth.users
  order by created_at desc
  limit 100
), latest_subscriptions as (
  select distinct on (subscription.user_id)
    subscription.id,
    subscription.user_id,
    subscription.provider,
    subscription.plan_code,
    subscription.status,
    subscription.current_period_start,
    subscription.current_period_end,
    subscription.cancel_at_period_end,
    subscription.management_source,
    subscription.created_at
  from public.subscriptions as subscription
  order by subscription.user_id, subscription.created_at desc
), recent_payments as (
  select payment.id, payment.user_id, payment.provider, payment.product_code,
    payment.plan_code, payment.amount_minor, payment.currency, payment.status,
    payment.paid_at, payment.refunded_at, payment.created_at
  from public.payment_orders as payment
  order by payment.created_at desc
  limit 100
)
select jsonb_build_object(
  'generatedAt', now(),
  'registrations', jsonb_build_object(
    'total', (select count(*) from auth.users),
    'confirmed', (select count(*) from auth.users where email_confirmed_at is not null),
    'last30Days', (select count(*) from auth.users where created_at >= now() - interval '30 days')
  ),
  'users', coalesce((
    select jsonb_agg(jsonb_build_object(
      'email', recent.email,
      'createdAt', recent.created_at,
      'confirmedAt', recent.email_confirmed_at,
      'lastSignInAt', recent.last_sign_in_at
    ) order by recent.created_at desc)
    from recent_users as recent
  ), '[]'::jsonb),
  'payments', jsonb_build_object(
    'total', (select count(*) from public.payment_orders),
    'paid', (select count(*) from public.payment_orders where status = 'paid'),
    'pending', (select count(*) from public.payment_orders where status in ('created', 'pending')),
    'refunded', (select count(*) from public.payment_orders where status = 'refunded'),
    'paidCnyMinor', coalesce((select sum(amount_minor) from public.payment_orders where status = 'paid' and currency = 'CNY'), 0),
    'paidUsdMinor', coalesce((select sum(amount_minor) from public.payment_orders where status = 'paid' and currency = 'USD'), 0)
  ),
  'orders', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', payment.id,
      'email', lower(account.email),
      'provider', payment.provider,
      'productCode', payment.product_code,
      'planCode', payment.plan_code,
      'amountMinor', payment.amount_minor,
      'currency', payment.currency,
      'status', payment.status,
      'paidAt', payment.paid_at,
      'refundedAt', payment.refunded_at,
      'createdAt', payment.created_at
    ) order by payment.created_at desc)
    from recent_payments as payment
    left join auth.users as account on account.id = payment.user_id
  ), '[]'::jsonb),
  'memberships', jsonb_build_object(
    'total', (select count(*) from latest_subscriptions),
    'active', (select count(*) from latest_subscriptions where status in ('active', 'trialing') and coalesce(current_period_end, now()) >= now()),
    'expiring7Days', (select count(*) from latest_subscriptions where status in ('active', 'trialing') and current_period_end >= now() and current_period_end < now() + interval '7 days')
  ),
  'members', coalesce((
    select jsonb_agg(jsonb_build_object(
      'email', lower(account.email),
      'provider', subscription.provider,
      'planCode', subscription.plan_code,
      'status', subscription.status,
      'currentPeriodStart', subscription.current_period_start,
      'currentPeriodEnd', subscription.current_period_end,
      'cancelAtPeriodEnd', subscription.cancel_at_period_end,
      'managementSource', subscription.management_source,
      'createdAt', subscription.created_at
    ) order by subscription.created_at desc)
    from (
      select * from latest_subscriptions order by created_at desc limit 100
    ) as subscription
    left join auth.users as account on account.id = subscription.user_id
  ), '[]'::jsonb)
);
$$;

comment on function public.admin_commerce_overview() is
  'Service-role-only operating overview with account emails, payment state, and membership state.';

revoke all on function public.admin_commerce_overview() from public, anon, authenticated;
grant execute on function public.admin_commerce_overview() to service_role;
