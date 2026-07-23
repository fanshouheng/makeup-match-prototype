alter table public.product_events
  drop constraint product_events_event_name_check;

alter table public.product_events
  add constraint product_events_event_name_check check (
    event_name in (
      'landing_view',
      'photo_selected',
      'analysis_succeeded',
      'analysis_failed',
      'match_result_view',
      'feedback_yes',
      'feedback_no',
      'creator_link_clicked',
      'share_succeeded'
    )
  );
