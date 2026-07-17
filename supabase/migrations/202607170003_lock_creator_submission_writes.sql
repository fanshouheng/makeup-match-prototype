drop policy if exists "anyone can submit a pending creator application"
  on public.creator_submissions;

revoke insert (
  id,
  name,
  contact_email,
  douyin_url,
  tutorial_url,
  reference_photo_path,
  feature_vector,
  quality_metrics,
  consent_version
) on public.creator_submissions from anon, authenticated;

drop policy if exists "anyone can upload a creator submission photo"
  on storage.objects;
