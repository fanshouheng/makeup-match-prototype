with params as (
  select timestamptz '2026-07-23 08:20:41+00' as period_start
),
event_names(event_name) as (
  values
    ('landing_view'),
    ('photo_selected'),
    ('women_photo_selected'),
    ('men_photo_selected'),
    ('analysis_succeeded'),
    ('analysis_failed'),
    ('match_result_view'),
    ('feedback_yes'),
    ('feedback_no'),
    ('creator_link_clicked'),
    ('share_succeeded')
),
event_counts as (
  select names.event_name, count(events.session_id)::int as event_count
  from event_names names
  cross join params
  left join public.product_events events
    on events.event_name = names.event_name
   and events.created_at >= params.period_start
  group by names.event_name
),
submission_counts as (
  select
    count(*) filter (where submitted_at >= params.period_start)::int as new_total,
    count(*) filter (where submitted_at >= params.period_start and status = 'pending')::int as pending,
    count(*) filter (where submitted_at >= params.period_start and status = 'approved')::int as approved,
    count(*) filter (where submitted_at >= params.period_start and status = 'rejected')::int as rejected,
    count(*) filter (where status = 'pending' and submitted_at < now() - interval '7 days')::int as pending_over_7_days
  from public.creator_submissions
  cross join params
),
creator_counts as (
  select
    count(*) filter (where created_at >= params.period_start and is_active)::int as active_new_creators,
    count(*) filter (where is_active)::int as active_total
  from public.creators
  cross join params
)
select jsonb_build_object(
  'project_ref', 'srydzphmmepcywepcccq',
  'captured_at', now(),
  'period_start', (select period_start from params),
  'metrics', (select jsonb_object_agg(event_name, event_count) from event_counts),
  'submissions', jsonb_build_object(
    'new_total', submissions.new_total,
    'pending', submissions.pending,
    'approved', submissions.approved,
    'rejected', submissions.rejected,
    'pending_over_7_days', submissions.pending_over_7_days,
    'active_new_creators', creators.active_new_creators,
    'active_total', creators.active_total
  )
) as snapshot
from submission_counts submissions
cross join creator_counts creators;
