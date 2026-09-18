-- Commercialization primitives. Apply only after reviewing provider contracts and retention policy.
create table public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'zpay', 'manual')),
  product_code text not null check (product_code in ('plus', 'ai_credits')),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'created' check (status in ('created','pending','paid','failed','refunded','cancelled')),
  provider_order_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_order_id)
);
create table public.entitlement_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_type text not null check (entitlement_type in ('match','ai_discovery','plus_report')),
  delta integer not null check (delta <> 0),
  reason text not null,
  reference_id uuid,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create table public.ai_discovery_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid,
  event_name text not null check (event_name in ('viewed','consent','requested','succeeded','failed','name_clicked','feedback')),
  locale text,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  platform text,
  result_count integer check (result_count is null or result_count between 0 and 5),
  error_code text,
  created_at timestamptz not null default now()
);
alter table public.payment_orders enable row level security;
alter table public.entitlement_ledger enable row level security;
alter table public.ai_discovery_events enable row level security;
revoke all on table public.payment_orders, public.entitlement_ledger, public.ai_discovery_events from public, anon, authenticated;
grant select, insert, update on table public.payment_orders to service_role;
grant select, insert on table public.entitlement_ledger, public.ai_discovery_events to service_role;
comment on table public.payment_orders is 'Minimal payment state. Never store card data, chat records, receipts, or raw provider payloads.';
comment on table public.entitlement_ledger is 'Immutable idempotent rights ledger, separate from anonymous product analytics.';
comment on table public.ai_discovery_events is 'Aggregated AI discovery behavior; never store photos, prompts, names, or user identifiers.';
