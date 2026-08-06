create table public.reward_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  referral_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
    check (referral_code ~ '^[A-F0-9]{10}$'),
  match_credits integer not null default 0 check (match_credits >= 0),
  ai_credits integer not null default 0 check (ai_credits >= 0),
  successful_match_count integer not null default 0 check (successful_match_count >= 0),
  legacy_ai_granted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reward_referrals (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null references auth.users(id) on delete cascade,
  invitee_user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'qualified')),
  inviter_rewarded boolean not null default false,
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  check (inviter_user_id <> invitee_user_id),
  check ((status = 'pending' and qualified_at is null) or (status = 'qualified' and qualified_at is not null))
);

create index reward_referrals_inviter_idx
  on public.reward_referrals (inviter_user_id, qualified_at desc);

create table public.reward_match_successes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  consumed_bonus boolean not null,
  created_at timestamptz not null default now()
);

create table public.reward_ai_reservations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'reserved' check (status in ('reserved', 'consumed', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reward_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  balance_type text not null check (balance_type in ('match', 'ai')),
  delta integer not null check (delta <> 0),
  reason text not null check (reason in (
    'legacy_ai',
    'referral_inviter',
    'referral_invitee',
    'match_used',
    'ai_used',
    'ai_refunded',
    'manual_purchase'
  )),
  reference_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index reward_transactions_idempotency_idx
  on public.reward_transactions (user_id, balance_type, reason, reference_id)
  where reference_id is not null;

create unique index reward_transactions_legacy_ai_idx
  on public.reward_transactions (user_id, reason)
  where reason = 'legacy_ai';

alter table public.reward_wallets enable row level security;
alter table public.reward_referrals enable row level security;
alter table public.reward_match_successes enable row level security;
alter table public.reward_ai_reservations enable row level security;
alter table public.reward_transactions enable row level security;

revoke all on table public.reward_wallets from public, anon, authenticated;
revoke all on table public.reward_referrals from public, anon, authenticated;
revoke all on table public.reward_match_successes from public, anon, authenticated;
revoke all on table public.reward_ai_reservations from public, anon, authenticated;
revoke all on table public.reward_transactions from public, anon, authenticated;
grant select, insert, update, delete on table public.reward_wallets to service_role;
grant select, insert, update, delete on table public.reward_referrals to service_role;
grant select, insert, update, delete on table public.reward_match_successes to service_role;
grant select, insert, update, delete on table public.reward_ai_reservations to service_role;
grant select, insert, update, delete on table public.reward_transactions to service_role;

comment on table public.reward_wallets is
  'Private account balances for referral-earned match credits and invite-or-purchase AI credits.';
comment on table public.reward_transactions is
  'Private immutable reward ledger. Never stores photos, face data, matches, creator names, AI output, or payment evidence.';

create or replace function public.ensure_reward_wallet(p_user_id uuid)
returns public.reward_wallets
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_wallet public.reward_wallets%rowtype;
  legacy_eligible boolean;
begin
  if p_user_id is null then
    raise exception 'auth_required';
  end if;

  select (created_at < timestamptz '2026-08-06 05:00:00+00')
  into legacy_eligible
  from auth.users
  where id = p_user_id;

  if not found then
    raise exception 'auth_required';
  end if;

  insert into public.reward_wallets (user_id, ai_credits, legacy_ai_granted)
  values (p_user_id, case when legacy_eligible then 1 else 0 end, legacy_eligible)
  on conflict (user_id) do nothing;

  if legacy_eligible then
    insert into public.reward_transactions (user_id, balance_type, delta, reason)
    select p_user_id, 'ai', 1, 'legacy_ai'
    where not exists (
      select 1 from public.reward_transactions
      where user_id = p_user_id and reason = 'legacy_ai'
    );
  end if;

  select * into selected_wallet
  from public.reward_wallets
  where user_id = p_user_id;
  return selected_wallet;
end;
$$;

create or replace function public.get_reward_status(p_user_id uuid)
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
  selected_wallet public.reward_wallets%rowtype;
begin
  selected_wallet := public.ensure_reward_wallet(p_user_id);
  return query
  select
    selected_wallet.referral_code,
    selected_wallet.match_credits,
    selected_wallet.ai_credits,
    selected_wallet.successful_match_count,
    (
      select count(*)::integer from public.reward_referrals referral
      where referral.inviter_user_id = p_user_id
        and referral.status = 'qualified'
        and referral.inviter_rewarded
    ),
    exists (
      select 1 from public.reward_referrals pending
      where pending.invitee_user_id = p_user_id and pending.status = 'pending'
    );
end;
$$;

create or replace function public.claim_reward_referral(p_user_id uuid, p_referral_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  inviter_id uuid;
  existing_referral public.reward_referrals%rowtype;
begin
  perform public.ensure_reward_wallet(p_user_id);
  if p_referral_code is null or upper(btrim(p_referral_code)) !~ '^[A-F0-9]{10}$' then
    raise exception 'referral_invalid';
  end if;
  if not exists (
    select 1 from auth.users where id = p_user_id and email_confirmed_at is not null
  ) then
    raise exception 'email_not_confirmed';
  end if;

  select user_id into inviter_id
  from public.reward_wallets
  where referral_code = upper(btrim(p_referral_code));
  if inviter_id is null then raise exception 'referral_invalid'; end if;
  if inviter_id = p_user_id then raise exception 'self_referral'; end if;

  select * into existing_referral
  from public.reward_referrals
  where invitee_user_id = p_user_id;
  if found then
    if existing_referral.inviter_user_id = inviter_id then return true; end if;
    raise exception 'referral_already_claimed';
  end if;

  insert into public.reward_referrals (inviter_user_id, invitee_user_id)
  values (inviter_id, p_user_id);
  return true;
end;
$$;

create or replace function public.record_reward_match_success(
  p_user_id uuid,
  p_success_id uuid,
  p_consume_bonus boolean
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
  selected_wallet public.reward_wallets%rowtype;
  selected_referral public.reward_referrals%rowtype;
  reward_inviter boolean := false;
begin
  selected_wallet := public.ensure_reward_wallet(p_user_id);
  select * into selected_wallet
  from public.reward_wallets where user_id = p_user_id for update;

  if exists (select 1 from public.reward_match_successes where id = p_success_id) then
    return query select * from public.get_reward_status(p_user_id);
    return;
  end if;
  if p_consume_bonus and selected_wallet.match_credits <= 0 then
    raise exception 'no_match_credits';
  end if;

  insert into public.reward_match_successes (id, user_id, consumed_bonus)
  values (p_success_id, p_user_id, p_consume_bonus);

  update public.reward_wallets as wallet
  set
    successful_match_count = wallet.successful_match_count + 1,
    match_credits = wallet.match_credits - case when p_consume_bonus then 1 else 0 end,
    updated_at = now()
  where user_id = p_user_id;

  if p_consume_bonus then
    insert into public.reward_transactions (user_id, balance_type, delta, reason, reference_id)
    values (p_user_id, 'match', -1, 'match_used', p_success_id);
  end if;

  select * into selected_referral
  from public.reward_referrals
  where invitee_user_id = p_user_id and status = 'pending'
  for update;

  if found then
    perform public.ensure_reward_wallet(selected_referral.inviter_user_id);
    select count(*) < 5 into reward_inviter
    from public.reward_referrals
    where inviter_user_id = selected_referral.inviter_user_id
      and status = 'qualified'
      and inviter_rewarded
      and qualified_at >= now() - interval '30 days';

    update public.reward_referrals
    set status = 'qualified', inviter_rewarded = reward_inviter, qualified_at = now()
    where id = selected_referral.id;

    update public.reward_wallets as wallet
    set ai_credits = wallet.ai_credits + 1, updated_at = now()
    where user_id = p_user_id;
    insert into public.reward_transactions (user_id, balance_type, delta, reason, reference_id)
    values (p_user_id, 'ai', 1, 'referral_invitee', selected_referral.id);

    if reward_inviter then
      update public.reward_wallets as wallet
      set match_credits = wallet.match_credits + 3, ai_credits = wallet.ai_credits + 1, updated_at = now()
      where user_id = selected_referral.inviter_user_id;
      insert into public.reward_transactions (user_id, balance_type, delta, reason, reference_id)
      values
        (selected_referral.inviter_user_id, 'match', 3, 'referral_inviter', selected_referral.id),
        (selected_referral.inviter_user_id, 'ai', 1, 'referral_inviter', selected_referral.id);
    end if;
  end if;

  return query select * from public.get_reward_status(p_user_id);
end;
$$;

create or replace function public.reserve_reward_ai_credit(p_user_id uuid, p_reservation_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare selected_wallet public.reward_wallets%rowtype;
begin
  selected_wallet := public.ensure_reward_wallet(p_user_id);
  select * into selected_wallet from public.reward_wallets where user_id = p_user_id for update;
  if exists (select 1 from public.reward_ai_reservations where id = p_reservation_id) then
    return selected_wallet.ai_credits;
  end if;
  if selected_wallet.ai_credits <= 0 then raise exception 'no_ai_credits'; end if;

  insert into public.reward_ai_reservations (id, user_id) values (p_reservation_id, p_user_id);
  update public.reward_wallets
  set ai_credits = ai_credits - 1, updated_at = now()
  where user_id = p_user_id
  returning * into selected_wallet;
  insert into public.reward_transactions (user_id, balance_type, delta, reason, reference_id)
  values (p_user_id, 'ai', -1, 'ai_used', p_reservation_id);
  return selected_wallet.ai_credits;
end;
$$;

create or replace function public.commit_reward_ai_credit(p_user_id uuid, p_reservation_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.reward_ai_reservations
  set status = 'consumed', updated_at = now()
  where id = p_reservation_id and user_id = p_user_id and status = 'reserved';
$$;

create or replace function public.refund_reward_ai_credit(p_user_id uuid, p_reservation_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_wallet public.reward_wallets%rowtype;
  selected_reservation public.reward_ai_reservations%rowtype;
begin
  perform public.ensure_reward_wallet(p_user_id);
  select * into selected_wallet from public.reward_wallets where user_id = p_user_id for update;
  select * into selected_reservation
  from public.reward_ai_reservations
  where id = p_reservation_id and user_id = p_user_id
  for update;
  if found and selected_reservation.status = 'reserved' then
    update public.reward_ai_reservations
    set status = 'refunded', updated_at = now()
    where id = p_reservation_id;
    update public.reward_wallets
    set ai_credits = ai_credits + 1, updated_at = now()
    where user_id = p_user_id
    returning * into selected_wallet;
    insert into public.reward_transactions (user_id, balance_type, delta, reason, reference_id)
    values (p_user_id, 'ai', 1, 'ai_refunded', p_reservation_id);
  end if;
  return selected_wallet.ai_credits;
end;
$$;

create or replace function public.grant_reward_ai_purchase(
  p_email text,
  p_credits integer,
  p_admin_id uuid,
  p_reference_id uuid
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
declare target_user_id uuid;
begin
  if p_credits <> 10 then raise exception 'invalid_credit_amount'; end if;
  select id into target_user_id from auth.users where lower(email) = lower(btrim(p_email));
  if target_user_id is null then raise exception 'account_not_found'; end if;
  perform public.ensure_reward_wallet(target_user_id);
  update public.reward_wallets as wallet
  set ai_credits = wallet.ai_credits + p_credits, updated_at = now()
  where user_id = target_user_id;
  insert into public.reward_transactions (
    user_id, balance_type, delta, reason, reference_id, created_by
  ) values (
    target_user_id, 'ai', p_credits, 'manual_purchase', p_reference_id, p_admin_id
  );
  return query select * from public.get_reward_status(target_user_id);
end;
$$;

create or replace function public.cleanup_reward_ai_reservations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_reservation public.reward_ai_reservations%rowtype;
  refunded_count integer := 0;
begin
  for selected_reservation in
    select * from public.reward_ai_reservations
    where status = 'reserved' and created_at <= now() - interval '10 minutes'
    for update skip locked
  loop
    update public.reward_ai_reservations
    set status = 'refunded', updated_at = now()
    where id = selected_reservation.id and status = 'reserved';
    if found then
      update public.reward_wallets
      set ai_credits = ai_credits + 1, updated_at = now()
      where user_id = selected_reservation.user_id;
      insert into public.reward_transactions (user_id, balance_type, delta, reason, reference_id)
      values (selected_reservation.user_id, 'ai', 1, 'ai_refunded', selected_reservation.id)
      on conflict do nothing;
      refunded_count := refunded_count + 1;
    end if;
  end loop;

  delete from public.reward_ai_reservations
  where status <> 'reserved' and updated_at <= now() - interval '30 days';
  return refunded_count;
end;
$$;

create extension if not exists pg_cron with schema pg_catalog;

do $$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job where jobname = 'cleanup-reward-ai-reservations';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'cleanup-reward-ai-reservations',
    '*/15 * * * *',
    'select public.cleanup_reward_ai_reservations();'
  );
end;
$$;

revoke all on function public.ensure_reward_wallet(uuid) from public, anon, authenticated;
revoke all on function public.get_reward_status(uuid) from public, anon, authenticated;
revoke all on function public.claim_reward_referral(uuid, text) from public, anon, authenticated;
revoke all on function public.record_reward_match_success(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.reserve_reward_ai_credit(uuid, uuid) from public, anon, authenticated;
revoke all on function public.commit_reward_ai_credit(uuid, uuid) from public, anon, authenticated;
revoke all on function public.refund_reward_ai_credit(uuid, uuid) from public, anon, authenticated;
revoke all on function public.grant_reward_ai_purchase(text, integer, uuid, uuid) from public, anon, authenticated;
revoke all on function public.cleanup_reward_ai_reservations() from public, anon, authenticated;
grant execute on function public.ensure_reward_wallet(uuid) to service_role;
grant execute on function public.get_reward_status(uuid) to service_role;
grant execute on function public.claim_reward_referral(uuid, text) to service_role;
grant execute on function public.record_reward_match_success(uuid, uuid, boolean) to service_role;
grant execute on function public.reserve_reward_ai_credit(uuid, uuid) to service_role;
grant execute on function public.commit_reward_ai_credit(uuid, uuid) to service_role;
grant execute on function public.refund_reward_ai_credit(uuid, uuid) to service_role;
grant execute on function public.grant_reward_ai_purchase(text, integer, uuid, uuid) to service_role;
grant execute on function public.cleanup_reward_ai_reservations() to service_role;
