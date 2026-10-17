-- Veeva Inventory schema. Apply with Supabase SQL Editor or `supabase db push`.
-- This migration intentionally does not create Auth users or auto-assign a role.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null check (role in ('admin','owner')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.transaction_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  applies_to text not null default 'both' check (applies_to in ('income','expense','both')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  category_id uuid references public.product_categories(id) on delete restrict,
  selling_price numeric(14,2) not null default 0 check (selling_price >= 0),
  cost_price numeric(14,2) check (cost_price is null or cost_price >= 0),
  stock_qty numeric(14,3) not null default 0 check (stock_qty >= 0),
  unit text not null default 'pcs',
  min_stock numeric(14,3) not null default 5 check (min_stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_sku_not_blank check (length(trim(sku)) > 0),
  constraint products_name_not_blank check (length(trim(name)) > 0),
  constraint products_unit_not_blank check (length(trim(unit)) > 0)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null,
  transaction_type text not null check (transaction_type in ('income','expense')),
  payment_method text not null check (payment_method in ('transfer','cash')),
  amount numeric(14,2) not null check (amount > 0),
  category_id uuid not null references public.transaction_categories(id) on delete restrict,
  description text,
  stock_direction text check (stock_direction is null or stock_direction in ('in','out')),
  idempotency_key uuid unique,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict,
  deleted_by uuid references public.profiles(id) on delete restrict,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_stock_direction_consistency check (
    stock_direction is null or
    (transaction_type = 'income' and stock_direction = 'out') or
    (transaction_type = 'expense' and stock_direction = 'in')
  )
);

create table if not exists public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  stock_direction text not null check (stock_direction in ('in','out')),
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null check (movement_type in ('opening_balance','purchase_in','sale_out','manual_adjustment','transaction_reversal')),
  quantity_delta numeric(14,3) not null check (quantity_delta <> 0),
  stock_before numeric(14,3) not null check (stock_before >= 0),
  stock_after numeric(14,3) not null check (stock_after >= 0),
  transaction_id uuid references public.transactions(id) on delete set null,
  reason text not null default '',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint inventory_movement_balance check (abs((stock_before + quantity_delta) - stock_after) < 0.0011)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_transactions_active_date on public.transactions (occurred_at desc) where deleted_at is null;
create index if not exists idx_transactions_active_type_date on public.transactions (transaction_type, occurred_at desc) where deleted_at is null;
create index if not exists idx_transactions_category on public.transactions (category_id);
create index if not exists idx_transaction_items_transaction on public.transaction_items (transaction_id);
create index if not exists idx_transaction_items_product on public.transaction_items (product_id);
create index if not exists idx_products_name on public.products (name);
create index if not exists idx_products_category on public.products (category_id) where is_active;
create index if not exists idx_inventory_movements_product_date on public.inventory_movements (product_id, created_at desc);
create index if not exists idx_inventory_movements_transaction on public.inventory_movements (transaction_id);
create index if not exists idx_audit_logs_entity_date on public.audit_logs (entity_type, entity_id, created_at desc);

insert into public.product_categories(name) values
  ('ATK'), ('Kertas'), ('Jasa Cetak'), ('Perlengkapan'), ('Lainnya')
on conflict (name) do nothing;

insert into public.transaction_categories(name, applies_to) values
  ('Penjualan', 'income'),
  ('Pendapatan Jasa', 'income'),
  ('Operasional', 'expense'),
  ('Bahan Baku', 'expense'),
  ('Pembelian Stok', 'expense'),
  ('Sewa', 'expense'),
  ('Listrik & Internet', 'expense'),
  ('Lainnya', 'both')
on conflict (name) do nothing;
