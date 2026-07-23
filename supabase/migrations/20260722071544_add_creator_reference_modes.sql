alter table public.creator_submissions
  add column reference_audience text not null default 'women'
    check (reference_audience in ('women', 'men')),
  add column content_types text[] not null default array['makeup']::text[]
    check (
      cardinality(content_types) between 1 and 3
      and content_types <@ array['appearance', 'hair', 'makeup']::text[]
    );

alter table public.creators
  add column reference_audience text not null default 'women'
    check (reference_audience in ('women', 'men')),
  add column content_types text[] not null default array['makeup']::text[]
    check (
      cardinality(content_types) between 1 and 3
      and content_types <@ array['appearance', 'hair', 'makeup']::text[]
    );

create index creators_audience_active_created_idx
  on public.creators (reference_audience, is_active, created_at desc);

create or replace function public.approve_creator_submission(
  submission_uuid uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  submission public.creator_submissions%rowtype;
  creator_uuid uuid;
begin
  select * into submission
  from public.creator_submissions
  where id = submission_uuid
  for update;

  if not found then
    raise exception 'submission not found';
  end if;
  if submission.status <> 'pending' then
    raise exception 'submission already reviewed';
  end if;
  if submission.ownership_verified_at is null then
    raise exception 'creator ownership has not been verified';
  end if;

  insert into public.creators (
    submission_id,
    name,
    douyin_url,
    tutorial_url,
    reference_audience,
    content_types,
    reference_photo_path,
    feature_vector
  ) values (
    submission.id,
    submission.name,
    submission.douyin_url,
    submission.tutorial_url,
    submission.reference_audience,
    submission.content_types,
    submission.reference_photo_path,
    submission.feature_vector
  )
  returning id into creator_uuid;

  update public.creator_submissions
  set status = 'approved', reviewed_at = now()
  where id = submission.id;

  return creator_uuid;
end;
$$;

revoke all on function public.approve_creator_submission(uuid)
  from public, anon, authenticated;
grant execute on function public.approve_creator_submission(uuid)
  to service_role;
