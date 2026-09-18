-- Provider-neutral payment state. Provider payloads and card data never enter the database.
alter table public.payment_orders
  add column if not exists idempotency_key text,
  add column if not exists checkout_url text,
  add column if not exists failure_code text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists paid_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_provider_id text;
update public.payment_orders
set idempotency_key = id::text
where idempotency_key is null;
alter table public.payment_orders
  alter column idempotency_key set not null;
create unique index if not exists payment_orders_idempotency_key_idx
  on public.payment_orders (idempotency_key);
alter table public.plus_memberships
  alter column invite_id drop not null;
alter table public.plus_memberships
  add column if not exists payment_order_id uuid references public.payment_orders(id) on delete restrict;
create unique index if not exists plus_memberships_payment_order_idx
  on public.plus_memberships (payment_order_id)
  where payment_order_id is not null;
alter table public.plus_memberships
  drop constraint if exists plus_memberships_source_check;
alter table public.plus_memberships
  add constraint plus_memberships_source_check
  check ((invite_id is not null) <> (payment_order_id is not null));
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
  selected_membership public.plus_memberships%rowtype;
  next_expiry timestamptz;
begin
  if p_order_id is null or p_provider_order_id is null or btrim(p_provider_order_id) = '' then
    raise exception 'invalid_payment';
  end if;

  select * into selected_order
  from public.payment_orders
  where id = p_order_id
  for update;

  if not found then raise exception 'payment_order_not_found'; end if;
  if selected_order.status = 'paid' then return 'already_paid'; end if;
  if selected_order.status not in ('created', 'pending') then
    raise exception 'payment_order_not_payable';
  end if;

  update public.payment_orders
  set status = 'paid',
      provider_order_id = left(btrim(p_provider_order_id), 200),
      paid_at = now(),
      updated_at = now()
  where id = selected_order.id;

  if selected_order.product_code = 'plus' then
    select * into selected_membership
    from public.plus_memberships
    where user_id = selected_order.user_id
    for update;

    if found then
      next_expiry := greatest(selected_membership.benefit_expires_at, now()) + interval '180 days';
      update public.plus_memberships
      set invite_id = null,
          payment_order_id = selected_order.id,
          status = 'active',
          trial_credits = selected_membership.trial_credits + 3,
          benefit_expires_at = next_expiry,
          updated_at = now()
      where user_id = selected_order.user_id;
    else
      insert into public.plus_memberships (
        user_id, invite_id, payment_order_id, tier, status, trial_credits,
        activated_at, benefit_expires_at, updated_at
      ) values (
        selected_order.user_id, null, selected_order.id, 'early_access', 'active', 3,
        now(), now() + interval '180 days', now()
      );
    end if;

    insert into public.entitlement_ledger (
      user_id, entitlement_type, delta, reason, reference_id, idempotency_key
    ) values (
      selected_order.user_id, 'plus_report', 3, 'payment_plus', selected_order.id,
      'payment:' || selected_order.id::text || ':plus'
    ) on conflict (idempotency_key) do nothing;
  else
    perform public.ensure_reward_wallet(selected_order.user_id);
    update public.reward_wallets
    set ai_credits = ai_credits + 10, updated_at = now()
    where user_id = selected_order.user_id;

    insert into public.reward_transactions (
      user_id, balance_type, delta, reason, reference_id
    ) values (
      selected_order.user_id, 'ai', 10, 'manual_purchase', selected_order.id
    ) on conflict (user_id, balance_type, reason, reference_id)
      where reference_id is not null do nothing;

    insert into public.entitlement_ledger (
      user_id, entitlement_type, delta, reason, reference_id, idempotency_key
    ) values (
      selected_order.user_id, 'ai_discovery', 10, 'payment_ai_credits', selected_order.id,
      'payment:' || selected_order.id::text || ':ai'
    ) on conflict (idempotency_key) do nothing;
  end if;

  return 'paid';
end;
$$;
revoke all on function public.fulfill_payment_order(uuid, text)
  from public, anon, authenticated;
grant execute on function public.fulfill_payment_order(uuid, text)
  to service_role;
create or replace function public.mark_payment_order_final(
  p_order_id uuid,
  p_provider_order_id text,
  p_status text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_order public.payment_orders%rowtype;
begin
  if p_order_id is null or p_provider_order_id is null or btrim(p_provider_order_id) = ''
    or p_status not in ('failed', 'cancelled') then
    raise exception 'invalid_payment';
  end if;
  select * into selected_order from public.payment_orders where id = p_order_id for update;
  if not found then raise exception 'payment_order_not_found'; end if;
  if selected_order.status = 'paid' then return 'already_paid'; end if;
  if selected_order.status in ('failed', 'cancelled', 'refunded') then return 'already_final'; end if;
  update public.payment_orders
  set status = p_status,
      provider_order_id = left(btrim(p_provider_order_id), 200),
      updated_at = now()
  where id = p_order_id;
  return p_status;
end;
$$;
revoke all on function public.mark_payment_order_final(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.mark_payment_order_final(uuid, text, text)
  to service_role;
alter table public.reward_transactions
  drop constraint if exists reward_transactions_reason_check;
alter table public.reward_transactions
  add constraint reward_transactions_reason_check
  check (reason in (
    'legacy_ai',
    'referral_inviter',
    'referral_invitee',
    'match_used',
    'ai_used',
    'ai_refunded',
    'manual_purchase',
    'payment_refund'
  ));
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
  selected_membership public.plus_memberships%rowtype;
  wallet_refund integer := 0;
  next_expiry timestamptz;
begin
  if p_order_id is null or p_provider_reference is null or btrim(p_provider_reference) = '' then
    raise exception 'invalid_payment';
  end if;

  select * into selected_order
  from public.payment_orders
  where id = p_order_id
  for update;

  if not found then raise exception 'payment_order_not_found'; end if;
  if selected_order.status = 'refunded' then return 'already_refunded'; end if;
  if selected_order.status <> 'paid' then raise exception 'payment_order_not_refundable'; end if;

  update public.payment_orders
  set status = 'refunded',
      failure_code = null,
      refunded_at = now(),
      refund_provider_id = left(btrim(p_provider_reference), 200),
      updated_at = now()
  where id = selected_order.id;

  if selected_order.product_code = 'plus' then
    select * into selected_membership
    from public.plus_memberships
    where user_id = selected_order.user_id
    for update;

    -- A later invite redemption starts a new membership cycle. Refunding an
    -- older payment must not remove that newer invite's expiry or credits.
    if found and selected_membership.payment_order_id = selected_order.id
      and selected_order.paid_at is not null
      and selected_order.paid_at >= selected_membership.activated_at then
      next_expiry := greatest(selected_membership.activated_at, selected_membership.benefit_expires_at - interval '180 days');
      update public.plus_memberships
      set trial_credits = greatest(0, selected_membership.trial_credits - 3),
          benefit_expires_at = next_expiry,
          status = case when next_expiry <= now() then 'revoked' else selected_membership.status end,
          updated_at = now()
      where user_id = selected_order.user_id;
    end if;

    insert into public.entitlement_ledger (
      user_id, entitlement_type, delta, reason, reference_id, idempotency_key
    ) values (
      selected_order.user_id, 'plus_report', -3, 'payment_refund', selected_order.id,
      'payment:' || selected_order.id::text || ':refund:plus'
    ) on conflict (idempotency_key) do nothing;
  else
    perform public.ensure_reward_wallet(selected_order.user_id);
    select least(ai_credits, 10) into wallet_refund
    from public.reward_wallets
    where user_id = selected_order.user_id
    for update;

    if wallet_refund > 0 then
      update public.reward_wallets
      set ai_credits = ai_credits - wallet_refund, updated_at = now()
      where user_id = selected_order.user_id;

      insert into public.reward_transactions (
        user_id, balance_type, delta, reason, reference_id
      ) values (
        selected_order.user_id, 'ai', -wallet_refund, 'payment_refund', selected_order.id
      ) on conflict (user_id, balance_type, reason, reference_id)
        where reference_id is not null do nothing;
    end if;

    insert into public.entitlement_ledger (
      user_id, entitlement_type, delta, reason, reference_id, idempotency_key
    ) values (
      selected_order.user_id, 'ai_discovery', -10, 'payment_refund', selected_order.id,
      'payment:' || selected_order.id::text || ':refund:ai'
    ) on conflict (idempotency_key) do nothing;
  end if;

  return 'refunded';
end;
$$;
revoke all on function public.refund_payment_order(uuid, text)
  from public, anon, authenticated;
grant execute on function public.refund_payment_order(uuid, text)
  to service_role;
create or replace function public.record_manual_ai_payment(
  p_email text,
  p_admin_id uuid,
  p_amount_minor integer,
  p_currency text
)
returns table (
  referral_code text,
  match_credits integer,
  ai_credits integer,
  successful_match_count integer,
  successful_invites integer,
  pending_referral boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  order_id uuid := gen_random_uuid();
begin
  if p_email is null or btrim(p_email) = '' or p_admin_id is null
    or p_amount_minor is null or p_amount_minor <= 0
    or p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid_payment';
  end if;
  select id into target_user_id
  from auth.users
  where lower(email) = lower(btrim(p_email));
  if target_user_id is null then raise exception 'account_not_found'; end if;

  insert into public.payment_orders (
    id, user_id, created_by, provider, product_code, amount_minor, currency,
    status, idempotency_key
  ) values (
    order_id, target_user_id, p_admin_id, 'manual', 'ai_credits', p_amount_minor,
    p_currency, 'created', 'manual:' || order_id::text
  );
  perform public.fulfill_payment_order(order_id, 'manual:' || order_id::text);
  return query select * from public.get_reward_status(target_user_id);
end;
$$;
revoke all on function public.record_manual_ai_payment(text, uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.record_manual_ai_payment(text, uuid, integer, text)
  to service_role;
comment on table public.payment_orders is
  'Minimal provider-neutral payment state. Never store card data, chat records, receipts, signatures, or raw provider payloads.';
-- A paid membership can later redeem an operator invite after expiry; keep only
-- one source link on the membership row so the source check remains valid.
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
  if not exists (
    select 1 from auth.users where id = p_user_id and email_confirmed_at is not null
  ) then
    raise exception 'email_not_confirmed';
  end if;

  select * into current_membership
  from public.plus_memberships
  where user_id = p_user_id
    and status = 'active'
    and benefit_expires_at > now()
  for update;
  if found then
    return query select current_membership.user_id, current_membership.tier,
      current_membership.status, current_membership.trial_credits,
      current_membership.activated_at, current_membership.benefit_expires_at;
    return;
  end if;

  select * into selected_invite
  from public.plus_invites
  where code_hash = p_code_hash
  for update;
  if not found then raise exception 'invite_invalid'; end if;
  if selected_invite.expires_at <= now() then raise exception 'invite_expired'; end if;
  if selected_invite.redeemed_at is not null then
    if selected_invite.redeemed_by = p_user_id then
      select * into current_membership
      from public.plus_memberships where invite_id = selected_invite.id;
      if found then
        return query select current_membership.user_id, current_membership.tier,
          current_membership.status, current_membership.trial_credits,
          current_membership.activated_at, current_membership.benefit_expires_at;
        return;
      end if;
    end if;
    raise exception 'invite_redeemed';
  end if;

  insert into public.plus_memberships (
    user_id, invite_id, payment_order_id, tier, status, trial_credits,
    activated_at, benefit_expires_at, updated_at
  ) values (
    p_user_id, selected_invite.id, null, 'early_access', 'active', 3,
    now(), now() + interval '180 days', now()
  )
  on conflict (user_id) do update set
    invite_id = excluded.invite_id,
    payment_order_id = null,
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

  return query select current_membership.user_id, current_membership.tier,
    current_membership.status, current_membership.trial_credits,
    current_membership.activated_at, current_membership.benefit_expires_at;
end;
$$;
revoke all on function public.redeem_plus_invite(text, uuid)
  from public, anon, authenticated;
grant execute on function public.redeem_plus_invite(text, uuid)
  to service_role;
