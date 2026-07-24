alter table public.product_events
  add column experiment_variant text;

alter table public.product_events
  drop constraint product_events_event_name_check;

alter table public.product_events
  add constraint product_events_event_name_check check (
    event_name in (
      'landing_view',
      'photo_selected',
      'women_photo_selected',
      'men_photo_selected',
      'analysis_succeeded',
      'analysis_failed',
      'match_result_view',
      'feedback_yes',
      'feedback_no',
      'creator_link_clicked',
      'share_succeeded',
      'plus_offer_viewed',
      'plus_offer_opened',
      'plus_offer_configured',
      'plus_intent_yes',
      'plus_intent_price_high',
      'plus_intent_not_needed'
    )
  );

alter table public.product_events
  add constraint product_events_experiment_variant_check check (
    (
      event_name in (
        'plus_offer_viewed',
        'plus_offer_opened',
        'plus_offer_configured',
        'plus_intent_yes',
        'plus_intent_price_high',
        'plus_intent_not_needed'
      )
      and experiment_variant in ('price_9_9', 'price_19_9', 'price_29_9')
    )
    or (
      event_name not in (
        'plus_offer_viewed',
        'plus_offer_opened',
        'plus_offer_configured',
        'plus_intent_yes',
        'plus_intent_price_high',
        'plus_intent_not_needed'
      )
      and experiment_variant is null
    )
  );

create unique index product_events_one_plus_intent_per_session_idx
  on public.product_events (session_id)
  where event_name in (
    'plus_intent_yes',
    'plus_intent_price_high',
    'plus_intent_not_needed'
  );

comment on column public.product_events.experiment_variant is
  'Allowlisted Plus price group. Contains no scene, makeup style, photo, face, creator, contact, or payment data.';
