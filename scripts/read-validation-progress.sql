create or replace function pg_temp.read_ai_dimensions(p_start timestamptz, p_end timestamptz)
returns jsonb
language plpgsql
as $$
declare
  has_columns boolean;
  result jsonb;
begin
  select count(*) = 3 into has_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'ai_creator_discovery_logs'
    and column_name in ('locale', 'country_code', 'platform');
  if not has_columns then
    return jsonb_build_object(
      'available', false,
      'locale', jsonb_build_object('zh-CN', 0, 'en-US', 0, 'en-GB', 0, 'ja-JP', 0, 'ko-KR', 0),
      'country_code', jsonb_build_object('global', 0, 'CN', 0, 'JP', 0, 'KR', 0, 'US', 0, 'GB', 0),
      'platform', jsonb_build_object('all', 0, 'youtube', 0, 'instagram', 0, 'tiktok', 0, 'xiaohongshu', 0, 'douyin', 0)
    );
  end if;
  execute $query$
    select jsonb_build_object(
      'available', true,
      'locale', jsonb_build_object(
        'zh-CN', count(*) filter (where locale = 'zh-CN'),
        'en-US', count(*) filter (where locale = 'en-US'),
        'en-GB', count(*) filter (where locale = 'en-GB'),
        'ja-JP', count(*) filter (where locale = 'ja-JP'),
        'ko-KR', count(*) filter (where locale = 'ko-KR')
      ),
      'country_code', jsonb_build_object(
        'global', count(*) filter (where country_code is null),
        'CN', count(*) filter (where country_code = 'CN'),
        'JP', count(*) filter (where country_code = 'JP'),
        'KR', count(*) filter (where country_code = 'KR'),
        'US', count(*) filter (where country_code = 'US'),
        'GB', count(*) filter (where country_code = 'GB')
      ),
      'platform', jsonb_build_object(
        'all', count(*) filter (where platform = 'all'),
        'youtube', count(*) filter (where platform = 'youtube'),
        'instagram', count(*) filter (where platform = 'instagram'),
        'tiktok', count(*) filter (where platform = 'tiktok'),
        'xiaohongshu', count(*) filter (where platform = 'xiaohongshu'),
        'douyin', count(*) filter (where platform = 'douyin')
      )
    )
    from public.ai_creator_discovery_logs
    where created_at >= $1 and created_at < $2
  $query$ into result using p_start, p_end;
  return result;
end;
$$;

create or replace function pg_temp.read_payment_summary(p_start timestamptz, p_end timestamptz)
returns jsonb
language plpgsql
as $$
declare
  has_table boolean;
  result jsonb;
begin
  select to_regclass('public.payment_orders') is not null into has_table;
  if not has_table then
    return jsonb_build_object(
      'available', false,
      'order_count', 0,
      'by_status', jsonb_build_object('created', 0, 'pending', 0, 'paid', 0, 'failed', 0, 'refunded', 0, 'cancelled', 0),
      'by_provider', jsonb_build_object('stripe', 0, 'zpay', 0, 'manual', 0),
      'by_product', jsonb_build_object('plus', 0, 'ai_credits', 0, 'points', 0),
      'by_package', jsonb_build_object('light', 0, 'standard', 0, 'value', 0),
      'paid_points', 0,
      'paid_amounts_minor', jsonb_build_object('CNY', 0, 'USD', 0, 'EUR', 0, 'JPY', 0, 'KRW', 0, 'GBP', 0)
    );
  end if;
  execute $query$
    select jsonb_build_object(
      'available', true,
      'order_count', count(*),
      'by_status', jsonb_build_object(
        'created', count(*) filter (where status = 'created'),
        'pending', count(*) filter (where status = 'pending'),
        'paid', count(*) filter (where status = 'paid'),
        'failed', count(*) filter (where status = 'failed'),
        'refunded', count(*) filter (where status = 'refunded'),
        'cancelled', count(*) filter (where status = 'cancelled')
      ),
      'by_provider', jsonb_build_object(
        'stripe', count(*) filter (where provider = 'stripe'),
        'zpay', count(*) filter (where provider = 'zpay'),
        'manual', count(*) filter (where provider = 'manual')
      ),
      'by_product', jsonb_build_object(
        'plus', count(*) filter (where product_code = 'plus'),
        'ai_credits', count(*) filter (where product_code = 'ai_credits'),
        'points', count(*) filter (where product_code = 'points')
      ),
      'by_package', jsonb_build_object(
        'light', count(*) filter (where package_code = 'light'),
        'standard', count(*) filter (where package_code = 'standard'),
        'value', count(*) filter (where package_code = 'value')
      ),
      'paid_points', coalesce(sum(points_granted) filter (where status = 'paid'), 0),
      'paid_amounts_minor', jsonb_build_object(
        'CNY', coalesce(sum(amount_minor) filter (where status = 'paid' and currency = 'CNY'), 0),
        'USD', coalesce(sum(amount_minor) filter (where status = 'paid' and currency = 'USD'), 0),
        'EUR', coalesce(sum(amount_minor) filter (where status = 'paid' and currency = 'EUR'), 0),
        'JPY', coalesce(sum(amount_minor) filter (where status = 'paid' and currency = 'JPY'), 0),
        'KRW', coalesce(sum(amount_minor) filter (where status = 'paid' and currency = 'KRW'), 0),
        'GBP', coalesce(sum(amount_minor) filter (where status = 'paid' and currency = 'GBP'), 0)
      )
    )
    from public.payment_orders
    where created_at >= $1 and created_at < $2
  $query$ into result using p_start, p_end;
  return result;
end;
$$;

create or replace function pg_temp.read_point_activity(p_start timestamptz, p_end timestamptz)
returns jsonb
language plpgsql
as $$
declare
  has_table boolean;
  result jsonb;
begin
  select to_regclass('public.point_reservations') is not null into has_table;
  if not has_table then
    return jsonb_build_object(
      'available', false,
      'consumed_points', 0,
      'refunded_points', 0,
      'by_purpose', jsonb_build_object(
        'ai_discovery', jsonb_build_object('reserved', 0, 'consumed', 0, 'refunded', 0),
        'makeup_report', jsonb_build_object('reserved', 0, 'consumed', 0, 'refunded', 0)
      )
    );
  end if;
  execute $query$
    select jsonb_build_object(
      'available', true,
      'consumed_points', coalesce(sum(points) filter (where status = 'consumed'), 0),
      'refunded_points', coalesce(sum(points) filter (where status = 'refunded'), 0),
      'by_purpose', jsonb_build_object(
        'ai_discovery', jsonb_build_object(
          'reserved', count(*) filter (where purpose = 'ai_discovery' and status = 'reserved'),
          'consumed', count(*) filter (where purpose = 'ai_discovery' and status = 'consumed'),
          'refunded', count(*) filter (where purpose = 'ai_discovery' and status = 'refunded')
        ),
        'makeup_report', jsonb_build_object(
          'reserved', count(*) filter (where purpose = 'makeup_report' and status = 'reserved'),
          'consumed', count(*) filter (where purpose = 'makeup_report' and status = 'consumed'),
          'refunded', count(*) filter (where purpose = 'makeup_report' and status = 'refunded')
        )
      )
    )
    from public.point_reservations
    where created_at >= $1 and created_at < $2
  $query$ into result using p_start, p_end;
  return result;
end;
$$;

with params as (
  select now() - interval '7 days' as period_start
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
    ('share_succeeded'),
    ('plus_offer_viewed'),
    ('plus_offer_opened'),
    ('plus_offer_configured'),
    ('plus_intent_yes'),
    ('plus_intent_price_high'),
    ('plus_intent_not_needed'),
    ('plus_page_viewed'),
    ('plus_checkout_started'),
    ('points_page_viewed'),
    ('points_checkout_started'),
    ('plus_invite_redeemed'),
    ('plus_job_created'),
    ('plus_job_succeeded'),
    ('plus_job_failed'),
    ('plus_credit_refunded'),
    ('plus_report_saved_local'),
    ('plus_usage_feedback'),
    ('ai_discovery_viewed'),
    ('ai_discovery_consent'),
    ('ai_discovery_requested'),
    ('ai_discovery_succeeded'),
    ('ai_discovery_failed'),
    ('ai_creator_name_clicked'),
    ('ai_discovery_feedback')
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
analysis_failure_reasons(failure_reason) as (
  values
    ('no_face'),
    ('multiple_faces'),
    ('too_dark'),
    ('pose_issue'),
    ('component_error')
),
analysis_failure_counts as (
  select reasons.failure_reason, count(events.session_id)::int as failure_count
  from analysis_failure_reasons reasons
  cross join params
  left join public.product_events events
    on events.event_name = 'analysis_failed'
   and events.failure_reason = reasons.failure_reason
   and events.created_at >= params.period_start
  group by reasons.failure_reason
),
plus_variants(experiment_variant) as (
  values
    ('price_9_9'),
    ('price_19_9'),
    ('price_29_9')
),
plus_variant_counts as (
  select
    variants.experiment_variant,
    jsonb_build_object(
      'plus_offer_viewed', count(events.session_id) filter (where events.event_name = 'plus_offer_viewed'),
      'plus_offer_opened', count(events.session_id) filter (where events.event_name = 'plus_offer_opened'),
      'plus_offer_configured', count(events.session_id) filter (where events.event_name = 'plus_offer_configured'),
      'plus_intent_yes', count(events.session_id) filter (where events.event_name = 'plus_intent_yes'),
      'plus_intent_price_high', count(events.session_id) filter (where events.event_name = 'plus_intent_price_high'),
      'plus_intent_not_needed', count(events.session_id) filter (where events.event_name = 'plus_intent_not_needed')
    ) as counts
  from plus_variants variants
  cross join params
  left join public.product_events events
    on events.experiment_variant = variants.experiment_variant
   and events.created_at >= params.period_start
  group by variants.experiment_variant
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
),
outreach_counts as (
  select
    count(*)::int as total,
    count(*) filter (where status in ('replied', 'interested', 'submitted', 'approved', 'active', 'declined'))::int as replied,
    count(*) filter (where status in ('interested', 'submitted', 'approved', 'active'))::int as interested,
    count(*) filter (where status in ('submitted', 'approved', 'active'))::int as submitted,
    count(*) filter (where status in ('approved', 'active'))::int as approved,
    count(*) filter (where status = 'active')::int as active,
    count(*) filter (where status = 'declined')::int as declined,
    count(*) filter (where status = 'no_reply')::int as no_reply,
    count(*) filter (
      where next_follow_up_at < (now() at time zone 'Asia/Shanghai')::date
        and status not in ('active', 'declined', 'no_reply')
    )::int as overdue_follow_ups
  from public.creator_outreach
)
select jsonb_build_object(
  'project_ref', 'srydzphmmepcywepcccq',
  'captured_at', now(),
  'period_start', (select period_start from params),
  'metrics', (select jsonb_object_agg(event_name, event_count) from event_counts),
  'analysis_failures', (select jsonb_object_agg(failure_reason, failure_count) from analysis_failure_counts),
  'plus_by_variant', (select jsonb_object_agg(experiment_variant, counts) from plus_variant_counts),
  'ai_dimensions', pg_temp.read_ai_dimensions((select period_start from params), now()),
  'payment_summary', pg_temp.read_payment_summary((select period_start from params), now()),
  'point_activity', pg_temp.read_point_activity((select period_start from params), now()),
  'submissions', jsonb_build_object(
    'new_total', submissions.new_total,
    'pending', submissions.pending,
    'approved', submissions.approved,
    'rejected', submissions.rejected,
    'pending_over_7_days', submissions.pending_over_7_days,
    'active_new_creators', creators.active_new_creators,
    'active_total', creators.active_total
  ),
  'outreach', jsonb_build_object(
    'total', outreach.total,
    'replied', outreach.replied,
    'interested', outreach.interested,
    'submitted', outreach.submitted,
    'approved', outreach.approved,
    'active', outreach.active,
    'declined', outreach.declined,
    'no_reply', outreach.no_reply,
    'overdue_follow_ups', outreach.overdue_follow_ups
  )
) as snapshot
from submission_counts submissions
cross join creator_counts creators
cross join outreach_counts outreach;
