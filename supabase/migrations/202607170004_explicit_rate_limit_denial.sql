create policy "clients cannot access creator submission rate limits"
  on public.creator_submission_rate_limits
  for all
  to anon, authenticated
  using (false)
  with check (false);
