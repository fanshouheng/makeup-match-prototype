create table public.match_negative_feedback (
  session_id uuid primary key,
  creator_ids uuid[] not null check (cardinality(creator_ids) between 1 and 3),
  algorithm_version text not null check (algorithm_version = 'weighted-rms-v1'),
  reason_codes text[] not null check (
    cardinality(reason_codes) between 1 and 5
    and reason_codes <@ array[
      'analysis_incorrect',
      'creator_mismatch',
      'style_mismatch',
      'problem_not_solved',
      'other'
    ]::text[]
  ),
  other_reason text check (
    other_reason is null
    or (char_length(other_reason) between 1 and 160 and 'other' = any(reason_codes))
  ),
  created_at timestamptz not null default now()
);

comment on table public.match_negative_feedback is
  'Structured match rejection feedback. Stores no user photo, face data, score, creator name, link, or recommendation order.';

comment on column public.match_negative_feedback.creator_ids is
  'Sorted, order-free set of creator IDs shown in the rejected result.';

create index match_negative_feedback_created_at_idx
  on public.match_negative_feedback (created_at);

alter table public.match_negative_feedback enable row level security;

revoke all on table public.match_negative_feedback from public, anon, authenticated;
grant select, insert, delete on table public.match_negative_feedback to service_role;
