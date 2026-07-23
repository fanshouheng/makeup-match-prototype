create table public.product_events (
  session_id uuid not null,
  event_name text not null check (
    event_name in (
      'photo_selected',
      'analysis_succeeded',
      'analysis_failed',
      'match_result_view',
      'feedback_yes',
      'feedback_no',
      'share_succeeded'
    )
  ),
  created_at timestamptz not null default now(),
  primary key (session_id, event_name)
);

comment on table public.product_events is
  'Privacy-safe, session-deduplicated product funnel events. Contains no photo or match data.';

create index product_events_created_at_idx
  on public.product_events (created_at);

alter table public.product_events enable row level security;

revoke all on table public.product_events from public, anon, authenticated;
grant select, insert, delete on table public.product_events to service_role;
