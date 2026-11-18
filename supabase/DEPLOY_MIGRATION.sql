-- =====================================================
-- Supabase Migration: Secured Users (2x Plan Registration)
-- =====================================================
-- Copy and paste this entire script into Supabase SQL Editor
-- Then click "Run"
-- =====================================================

create table if not exists public.secured_user_nonces (
  nonce text primary key,
  wallet_address text not null,
  purpose text not null check (purpose in ('submit', 'list')),
  message text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists secured_user_nonces_wallet_created_idx
  on public.secured_user_nonces (wallet_address, created_at);

create table if not exists public.secured_users (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null unique,
  mobile_number text not null,
  id_file_path text not null unique,
  security_asset text not null check (security_asset in ('Gold coin', 'Silver coin')),
  quantity integer not null check (quantity > 0),
  weight_grams numeric(18, 3) not null check (weight_grams > 0),
  price numeric(20, 6) not null check (price > 0),
  referrer_name text not null,
  referrer_mobile_number text not null,
  referrer_address text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.secured_user_nonces enable row level security;
alter table public.secured_users enable row level security;

revoke all on table public.secured_user_nonces from anon, authenticated;
revoke all on table public.secured_users from anon, authenticated;
grant all on table public.secured_user_nonces to service_role;
grant all on table public.secured_users to service_role;

create or replace function public.consume_secured_user_nonce(
  p_wallet_address text,
  p_nonce text,
  p_purpose text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from public.secured_user_nonces
  where wallet_address = lower(p_wallet_address)
    and nonce = p_nonce
    and purpose = p_purpose
    and expires_at > now();

  get diagnostics deleted_count = row_count;
  return deleted_count = 1;
end;
$$;

revoke all on function public.consume_secured_user_nonce(text, text, text) from public, anon, authenticated;
grant execute on function public.consume_secured_user_nonce(text, text, text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'secured-user-ids',
  'secured-user-ids',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

