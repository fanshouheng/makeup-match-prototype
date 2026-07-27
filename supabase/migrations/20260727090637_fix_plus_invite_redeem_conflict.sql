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
