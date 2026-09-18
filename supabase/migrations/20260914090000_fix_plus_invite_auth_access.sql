-- The RPC must read auth.users, which service_role cannot query directly.
-- Execution remains restricted to service_role, and the empty search_path
-- keeps all referenced objects explicitly schema-qualified.
alter function public.redeem_plus_invite(text, uuid) security definer;
revoke all on function public.redeem_plus_invite(text, uuid)
  from public, anon, authenticated;
grant execute on function public.redeem_plus_invite(text, uuid)
  to service_role;
