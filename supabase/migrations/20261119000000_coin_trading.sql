-- =====================================================
-- Supabase Migration: Coin Trading (Buy/Sell)
-- For 2x plan users to buy/sell gold & silver coins
-- =====================================================

-- Admin pricing table for gold/silver coins
create table if not exists public.coin_prices (
  id uuid primary key default gen_random_uuid(),
  coin_type text not null check (coin_type in ('Gold coin', 'Silver coin')),
  price_per_gram numeric(20, 6) not null check (price_per_gram > 0),
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unique_coin_price unique (coin_type)
);

-- User coin inventory/balance
create table if not exists public.user_coin_balances (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null unique,
  gold_quantity integer not null default 0 check (gold_quantity >= 0),
  gold_weight_grams numeric(18, 3) not null default 0 check (gold_weight_grams >= 0),
  silver_quantity integer not null default 0 check (silver_quantity >= 0),
  silver_weight_grams numeric(18, 3) not null default 0 check (silver_weight_grams >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Transaction history (buy/sell records)
create table if not exists public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  transaction_type text not null check (transaction_type in ('buy', 'sell')),
  coin_type text not null check (coin_type in ('Gold coin', 'Silver coin')),
  quantity integer not null check (quantity > 0),
  weight_grams numeric(18, 3) not null check (weight_grams > 0),
  price_per_gram numeric(20, 6) not null check (price_per_gram > 0),
  total_price numeric(20, 6) not null check (total_price > 0),
  status text not null default 'completed' check (status in ('pending', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fk_wallet foreign key (wallet_address) references public.secured_users (wallet_address) on delete cascade
);

-- RLS policies for coin tables
alter table public.coin_prices enable row level security;
alter table public.user_coin_balances enable row level security;
alter table public.coin_transactions enable row level security;

-- Coin prices: readable by all, writable by service role only
revoke all on table public.coin_prices from anon, authenticated;
grant select on table public.coin_prices to anon, authenticated;
grant all on table public.coin_prices to service_role;

create policy "coin_prices_readable_by_all"
  on public.coin_prices
  for select
  to anon, authenticated
  using (true);

-- User balances: users see their own, service role sees all
revoke all on table public.user_coin_balances from anon, authenticated;
grant all on table public.user_coin_balances to service_role;

create policy "user_balances_readable_by_owner"
  on public.user_coin_balances
  for select
  to anon, authenticated
  using (wallet_address = auth.jwt() ->> 'sub');

-- Transactions: users see their own, service role sees all
revoke all on table public.coin_transactions from anon, authenticated;
grant all on table public.coin_transactions to service_role;

create policy "transactions_readable_by_wallet_owner"
  on public.coin_transactions
  for select
  to anon, authenticated
  using (wallet_address = auth.jwt() ->> 'sub');

-- Initialize default coin prices
insert into public.coin_prices (coin_type, price_per_gram, updated_by)
values 
  ('Gold coin', 65.00, 'system'),
  ('Silver coin', 0.80, 'system')
on conflict (coin_type) do nothing;
