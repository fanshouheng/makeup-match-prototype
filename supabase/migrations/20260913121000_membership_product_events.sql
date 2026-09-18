alter table public.product_events
  drop constraint if exists product_events_event_name_check;
alter table public.product_events
  add constraint product_events_event_name_check check (event_name in (
    'landing_view', 'photo_selected', 'women_photo_selected', 'men_photo_selected',
    'analysis_succeeded', 'analysis_failed', 'match_result_view', 'feedback_yes',
    'feedback_no', 'creator_link_clicked', 'share_succeeded',
    'plus_offer_viewed', 'plus_offer_opened', 'plus_offer_configured',
    'plus_intent_yes', 'plus_intent_price_high', 'plus_intent_not_needed',
    'plus_page_viewed', 'plus_checkout_started', 'points_page_viewed',
    'points_checkout_started', 'membership_page_viewed', 'membership_checkout_started',
    'membership_cycle_granted', 'membership_payment_failed',
    'plus_invite_redeemed', 'plus_job_created', 'plus_job_succeeded',
    'plus_job_failed', 'plus_credit_refunded', 'plus_report_saved_local',
    'plus_usage_feedback', 'ai_discovery_viewed', 'ai_discovery_consent',
    'ai_discovery_requested', 'ai_discovery_succeeded', 'ai_discovery_failed',
    'ai_creator_name_clicked', 'ai_discovery_feedback'
  ));
