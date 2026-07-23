alter table public.creator_submissions
  add column platform text not null default 'douyin'
    check (platform in ('douyin', 'xiaohongshu')),
  add column profile_url text;

alter table public.creators
  add column platform text not null default 'douyin'
    check (platform in ('douyin', 'xiaohongshu')),
  add column profile_url text;

update public.creator_submissions
set profile_url = douyin_url
where profile_url is null;

update public.creators
set profile_url = douyin_url
where profile_url is null;

alter table public.creator_submissions
  drop constraint creator_submissions_douyin_url_check,
  drop constraint creator_submissions_tutorial_url_check,
  alter column douyin_url drop not null,
  add constraint creator_submissions_profile_url_check check (
    (
      platform = 'douyin'
      and coalesce(profile_url, douyin_url) is not null
      and char_length(coalesce(profile_url, douyin_url)) <= 2048
      and coalesce(profile_url, douyin_url) ~* '^https?://([a-z0-9-]+\.)*douyin\.com(/|$)'
    )
    or (
      platform = 'xiaohongshu'
      and profile_url is not null
      and char_length(profile_url) <= 2048
      and profile_url ~* '^https?://([a-z0-9-]+\.)*(xiaohongshu\.com|xhslink\.com)(/|$)'
      and douyin_url is null
    )
  ),
  add constraint creator_submissions_tutorial_url_platform_check check (
    tutorial_url is null
    or (
      platform = 'douyin'
      and char_length(tutorial_url) <= 2048
      and tutorial_url ~* '^https?://([a-z0-9-]+\.)*douyin\.com(/|$)'
    )
    or (
      platform = 'xiaohongshu'
      and char_length(tutorial_url) <= 2048
      and tutorial_url ~* '^https?://([a-z0-9-]+\.)*(xiaohongshu\.com|xhslink\.com)(/|$)'
    )
  );

alter table public.creators
  alter column douyin_url drop not null,
  add constraint creators_profile_url_check check (
    (
      platform = 'douyin'
      and coalesce(profile_url, douyin_url) is not null
      and char_length(coalesce(profile_url, douyin_url)) <= 2048
      and coalesce(profile_url, douyin_url) ~* '^https?://([a-z0-9-]+\.)*douyin\.com(/|$)'
    )
    or (
      platform = 'xiaohongshu'
      and profile_url is not null
      and char_length(profile_url) <= 2048
      and profile_url ~* '^https?://([a-z0-9-]+\.)*(xiaohongshu\.com|xhslink\.com)(/|$)'
      and douyin_url is null
    )
  ),
  add constraint creators_tutorial_url_platform_check check (
    tutorial_url is null
    or (
      platform = 'douyin'
      and char_length(tutorial_url) <= 2048
      and tutorial_url ~* '^https?://([a-z0-9-]+\.)*douyin\.com(/|$)'
    )
    or (
      platform = 'xiaohongshu'
      and char_length(tutorial_url) <= 2048
      and tutorial_url ~* '^https?://([a-z0-9-]+\.)*(xiaohongshu\.com|xhslink\.com)(/|$)'
    )
  );

create or replace function public.approve_creator_submission(
  submission_uuid uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  submission public.creator_submissions%rowtype;
  creator_uuid uuid;
  submission_profile_url text;
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

  submission_profile_url := coalesce(submission.profile_url, submission.douyin_url);

  insert into public.creators (
    submission_id,
    name,
    platform,
    profile_url,
    douyin_url,
    tutorial_url,
    reference_audience,
    content_types,
    reference_photo_path,
    feature_vector
  ) values (
    submission.id,
    submission.name,
    submission.platform,
    submission_profile_url,
    case when submission.platform = 'douyin' then submission_profile_url else null end,
    submission.tutorial_url,
    submission.reference_audience,
    submission.content_types,
    submission.reference_photo_path,
    submission.feature_vector
  )
  returning id into creator_uuid;

  update public.creator_submissions
  set
    profile_url = submission_profile_url,
    status = 'approved',
    reviewed_at = now()
  where id = submission.id;

  return creator_uuid;
end;
$$;

revoke all on function public.approve_creator_submission(uuid)
  from public, anon, authenticated;
grant execute on function public.approve_creator_submission(uuid)
  to service_role;
