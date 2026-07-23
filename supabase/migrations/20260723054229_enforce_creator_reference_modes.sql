alter table public.creator_submissions
  add constraint creator_submissions_audience_content_check check (
    reference_audience = 'men'
    or content_types = array['makeup']::text[]
  );

alter table public.creators
  add constraint creators_audience_content_check check (
    reference_audience = 'men'
    or content_types = array['makeup']::text[]
  );
