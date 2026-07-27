create table public.plus_invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz,
  check (
    (redeemed_by is null and redeemed_at is null) or
    redeemed_at is not null
  )
);

create table public.plus_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  invite_id uuid not null unique references public.plus_invites(id) on delete restrict,
  tier text not null default 'early_access' check (tier = 'early_access'),
  status text not null default 'active' check (status in ('active', 'revoked')),
  trial_credits smallint not null default 3 check (trial_credits >= 0),
  activated_at timestamptz not null default now(),
  benefit_expires_at timestamptz not null default (now() + interval '180 days'),
  updated_at timestamptz not null default now()
);

alter table public.plus_invites enable row level security;
alter table public.plus_memberships enable row level security;

revoke all on table public.plus_invites from public, anon, authenticated;
revoke all on table public.plus_memberships from public, anon, authenticated;
grant select, insert, update, delete on table public.plus_invites to service_role;
grant select, insert, update, delete on table public.plus_memberships to service_role;
grant select on table public.plus_memberships to authenticated;

create policy "Users can read their own Plus membership"
on public.plus_memberships
for select
to authenticated
using ((select auth.uid()) = user_id);

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

  select *
  into current_membership
  from public.plus_memberships as membership
  where membership.user_id = p_user_id
    and membership.status = 'active'
    and membership.benefit_expires_at > now()
  for update;

  if found then
    return query
    select
      current_membership.user_id,
      current_membership.tier,
      current_membership.status,
      current_membership.trial_credits,
      current_membership.activated_at,
      current_membership.benefit_expires_at;
    return;
  end if;

  select *
  into selected_invite
  from public.plus_invites as invite
  where invite.code_hash = p_code_hash
  for update;

  if not found then
    raise exception 'invite_invalid';
  end if;
  if selected_invite.expires_at <= now() then
    raise exception 'invite_expired';
  end if;
  if selected_invite.redeemed_at is not null then
    if selected_invite.redeemed_by = p_user_id then
      select *
      into current_membership
      from public.plus_memberships as membership
      where membership.invite_id = selected_invite.id;

      if found then
        return query
        select
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
  on conflict (user_id) do update set
    invite_id = excluded.invite_id,
    tier = excluded.tier,
    status = excluded.status,
    trial_credits = excluded.trial_credits,
    activated_at = excluded.activated_at,
    benefit_expires_at = excluded.benefit_expires_at,
    updated_at = excluded.updated_at
  returning * into current_membership;

  update public.plus_invites
  set
    redeemed_by = p_user_id,
    redeemed_at = coalesce(redeemed_at, now())
  where id = selected_invite.id;

  return query
  select
    current_membership.user_id,
    current_membership.tier,
    current_membership.status,
    current_membership.trial_credits,
    current_membership.activated_at,
    current_membership.benefit_expires_at;
end;
$$;

revoke all on function public.redeem_plus_invite(text, uuid) from public, anon, authenticated;
grant execute on function public.redeem_plus_invite(text, uuid) to service_role;
