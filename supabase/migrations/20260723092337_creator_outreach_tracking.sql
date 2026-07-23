create table public.creator_outreach (
  id uuid primary key default gen_random_uuid(),
  candidate_no bigint generated always as identity unique,
  display_name text not null check (char_length(display_name) between 1 and 60),
  profile_url text not null unique check (
    char_length(profile_url) <= 2048
    and profile_url ~ '^https://'
  ),
  first_contacted_at date not null,
  status text not null default 'contacted' check (
    status in (
      'contacted',
      'replied',
      'interested',
      'submitted',
      'approved',
      'active',
      'declined',
      'no_reply'
    )
  ),
  next_follow_up_at date,
  loss_reason text check (loss_reason is null or char_length(loss_reason) <= 200),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (next_follow_up_at is null or next_follow_up_at >= first_contacted_at),
  check (
    status not in ('declined', 'no_reply')
    or char_length(btrim(coalesce(loss_reason, ''))) between 1 and 200
  )
);

comment on table public.creator_outreach is
  'Private operator ledger for creator outreach. Never expose rows in public reports.';

create index creator_outreach_status_updated_idx
  on public.creator_outreach (status, updated_at desc);

create index creator_outreach_follow_up_idx
  on public.creator_outreach (next_follow_up_at)
  where next_follow_up_at is not null;

alter table public.creator_outreach enable row level security;

revoke all on table public.creator_outreach from public, anon, authenticated;
revoke all on sequence public.creator_outreach_candidate_no_seq from public, anon, authenticated;
grant select, insert, update, delete on table public.creator_outreach to service_role;
grant usage, select on sequence public.creator_outreach_candidate_no_seq to service_role;
