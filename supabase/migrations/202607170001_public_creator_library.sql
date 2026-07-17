create extension if not exists pgcrypto;

create table public.creator_submissions (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 60),
  contact_email text not null check (char_length(contact_email) between 3 and 320),
  douyin_url text not null check (douyin_url ~ '^https?://([a-z0-9-]+\.)*douyin\.com/'),
  tutorial_url text check (tutorial_url is null or tutorial_url ~ '^https?://([a-z0-9-]+\.)*douyin\.com/'),
  reference_photo_path text not null unique check (reference_photo_path like 'submissions/%'),
  feature_vector jsonb not null check (jsonb_typeof(feature_vector) = 'object'),
  quality_metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(quality_metrics) = 'object'),
  consent_version text not null,
  consent_confirmed_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  ownership_verified_at timestamptz,
  reviewed_at timestamptz,
  review_note text
);

create index creator_submissions_status_submitted_idx
  on public.creator_submissions (status, submitted_at desc);

alter table public.creator_submissions enable row level security;
revoke all on public.creator_submissions from anon, authenticated;
grant insert (
  id,
  name,
  contact_email,
  douyin_url,
  tutorial_url,
  reference_photo_path,
  feature_vector,
  quality_metrics,
  consent_version
) on public.creator_submissions to anon, authenticated;

create policy "anyone can submit a pending creator application"
  on public.creator_submissions
  for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and reviewed_at is null
    and ownership_verified_at is null
    and consent_version = '2026-07-17'
    and reference_photo_path like ('submissions/' || id::text || '/%')
  );

create table public.creators (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.creator_submissions (id),
  name text not null check (char_length(name) between 1 and 60),
  douyin_url text not null,
  tutorial_url text,
  reference_photo_path text not null unique,
  feature_vector jsonb not null check (jsonb_typeof(feature_vector) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index creators_active_created_idx
  on public.creators (is_active, created_at desc);

alter table public.creators enable row level security;
revoke all on public.creators from anon, authenticated;
grant select on public.creators to anon, authenticated;

create policy "anyone can read active creators"
  on public.creators
  for select
  to anon, authenticated
  using (is_active = true);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'creator-photos',
  'creator-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "anyone can upload a creator submission photo"
  on storage.objects
  for insert
  to anon, authenticated
  with check (
    bucket_id = 'creator-photos'
    and (storage.foldername(name))[1] = 'submissions'
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

create policy "anyone can read approved creator photos"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'creator-photos'
    and exists (
      select 1
      from public.creators
      where creators.reference_photo_path = storage.objects.name
        and creators.is_active = true
    )
  );

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
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'not authorized';
  end if;

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
    reference_photo_path,
    feature_vector
  ) values (
    submission.id,
    submission.name,
    submission.douyin_url,
    submission.tutorial_url,
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

revoke all on function public.approve_creator_submission(uuid) from public, anon, authenticated;
grant execute on function public.approve_creator_submission(uuid) to service_role;
