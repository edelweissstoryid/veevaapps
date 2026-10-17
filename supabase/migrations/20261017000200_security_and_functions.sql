-- Authorization helpers. SECURITY DEFINER avoids RLS recursion when checking profiles;
-- callers still cannot choose which user is checked: auth.uid() is the source of identity.
create or replace function public.is_active_user()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.is_active = true);
$$;

create or replace function public.is_admin_user()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.is_active = true and p.role = 'admin');
$$;

create or replace function public.is_owner_user()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.is_active = true and p.role = 'owner');
$$;

alter table public.profiles enable row level security;
alter table public.product_categories enable row level security;
alter table public.transaction_categories enable row level security;
alter table public.products enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles for select to authenticated using (id = auth.uid() and public.is_active_user());

drop policy if exists product_categories_select_active_user on public.product_categories;
create policy product_categories_select_active_user on public.product_categories for select to authenticated using (public.is_active_user());

drop policy if exists transaction_categories_select_active_user on public.transaction_categories;
create policy transaction_categories_select_active_user on public.transaction_categories for select to authenticated using (public.is_active_user());

drop policy if exists products_select_active_user on public.products;
create policy products_select_active_user on public.products for select to authenticated using (public.is_active_user() and (is_active = true or public.is_admin_user()));

drop policy if exists transactions_select_active_user on public.transactions;
create policy transactions_select_active_user on public.transactions for select to authenticated using (public.is_active_user() and deleted_at is null);

drop policy if exists transaction_items_select_active_user on public.transaction_items;
create policy transaction_items_select_active_user on public.transaction_items for select to authenticated using (
  public.is_active_user() and exists (
    select 1 from public.transactions t where t.id = transaction_items.transaction_id and t.deleted_at is null
  )
);

drop policy if exists inventory_movements_select_active_user on public.inventory_movements;
create policy inventory_movements_select_active_user on public.inventory_movements for select to authenticated using (public.is_active_user());

-- No direct insert/update/delete policies exist for operational ledgers. Mutations use
-- SECURITY DEFINER RPCs below, each of which checks the caller's Admin role explicitly.
revoke all on public.profiles, public.product_categories, public.transaction_categories, public.products,
  public.transactions, public.transaction_items, public.inventory_movements, public.audit_logs from anon, authenticated;
grant select on public.profiles, public.product_categories, public.transaction_categories, public.products,
  public.transactions, public.transaction_items, public.inventory_movements to authenticated;
grant usage on schema public to authenticated;
revoke all on function public.is_active_user() from public;
revoke all on function public.is_admin_user() from public;
revoke all on function public.is_owner_user() from public;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_admin_user() to authenticated;
grant execute on function public.is_owner_user() to authenticated;

create or replace function public.save_product(p_product jsonb)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_id uuid;
  v_sku text := upper(trim(coalesce(p_product->>'sku','')));
  v_name text := trim(coalesce(p_product->>'name',''));
  v_category_id uuid := nullif(p_product->>'category_id','')::uuid;
  v_selling_price numeric := coalesce(nullif(p_product->>'selling_price','')::numeric, 0);
  v_cost_price numeric := nullif(p_product->>'cost_price','')::numeric;
  v_unit text := trim(coalesce(p_product->>'unit','pcs'));
  v_min_stock numeric := coalesce(nullif(p_product->>'min_stock','')::numeric, 5);
  v_initial_stock numeric := coalesce(nullif(p_product->>'initial_stock','')::numeric, 0);
  v_before jsonb;
  v_existing public.products%rowtype;
begin
  if not public.is_admin_user() then raise exception 'Akses ditolak: hanya Admin yang dapat mengubah barang.' using errcode = '42501'; end if;
  if v_sku = '' or v_name = '' or v_unit = '' then raise exception 'ID barang, nama barang, dan satuan wajib diisi.'; end if;
  if v_selling_price < 0 or coalesce(v_cost_price,0) < 0 or v_min_stock < 0 then raise exception 'Harga dan ambang stok tidak boleh negatif.'; end if;

  if nullif(p_product->>'id','') is not null then
    v_id := (p_product->>'id')::uuid;
    select * into v_existing from public.products where id = v_id and is_active = true for update;
    if not found then raise exception 'Barang tidak ditemukan atau sudah diarsipkan.'; end if;
    v_before := to_jsonb(v_existing);
    update public.products set sku=v_sku, name=v_name, category_id=v_category_id,
      selling_price=v_selling_price, cost_price=v_cost_price, unit=v_unit, min_stock=v_min_stock,
      updated_at=now()
    where id=v_id;
  else
    if v_initial_stock < 0 then raise exception 'Stok awal tidak boleh negatif.'; end if;
    insert into public.products(sku,name,category_id,selling_price,cost_price,stock_qty,unit,min_stock)
    values(v_sku,v_name,v_category_id,v_selling_price,v_cost_price,v_initial_stock,v_unit,v_min_stock)
    returning id into v_id;
    if v_initial_stock > 0 then
      insert into public.inventory_movements(product_id,movement_type,quantity_delta,stock_before,stock_after,reason,created_by)
      values(v_id,'opening_balance',v_initial_stock,0,v_initial_stock,'Stok awal saat barang dibuat',auth.uid());
    end if;
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),case when v_before is null then 'create' else 'update' end,'product',v_id,v_before,
    (select to_jsonb(p) from public.products p where p.id=v_id));
  return v_id;
end;
$$;

create or replace function public.adjust_stock(p_product_id uuid, p_delta numeric, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_product public.products%rowtype;
  v_before numeric;
  v_after numeric;
begin
  if not public.is_admin_user() then raise exception 'Akses ditolak: hanya Admin yang dapat menyesuaikan stok.' using errcode = '42501'; end if;
  if p_delta is null or p_delta = 0 then raise exception 'Perubahan stok harus bukan nol.'; end if;
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Alasan penyesuaian minimal 3 karakter.'; end if;
  select * into v_product from public.products where id=p_product_id and is_active=true for update;
  if not found then raise exception 'Barang tidak ditemukan atau tidak aktif.'; end if;
  v_before := v_product.stock_qty;
  v_after := v_before + p_delta;
  if v_after < 0 then raise exception 'Stok tidak mencukupi. Stok saat ini: %, perubahan yang diminta: %.', v_before, p_delta; end if;
  update public.products set stock_qty=v_after, updated_at=now() where id=p_product_id;
  insert into public.inventory_movements(product_id,movement_type,quantity_delta,stock_before,stock_after,reason,created_by)
  values(p_product_id,'manual_adjustment',p_delta,v_before,v_after,trim(p_reason),auth.uid());
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),'stock_adjustment','product',p_product_id,
    jsonb_build_object('stock_qty',v_before),jsonb_build_object('stock_qty',v_after,'delta',p_delta,'reason',trim(p_reason)));
  return jsonb_build_object('product_id',p_product_id,'stock_before',v_before,'stock_after',v_after,'quantity_delta',p_delta);
end;
$$;

create or replace function public.archive_product(p_product_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare v_before jsonb; v_after jsonb;
begin
  if not public.is_admin_user() then raise exception 'Akses ditolak: hanya Admin yang dapat mengarsipkan barang.' using errcode = '42501'; end if;
  select to_jsonb(p) into v_before from public.products p where p.id=p_product_id and p.is_active=true for update;
  if v_before is null then raise exception 'Barang tidak ditemukan atau sudah diarsipkan.'; end if;
  update public.products set is_active=false, updated_at=now() where id=p_product_id;
  select to_jsonb(p) into v_after from public.products p where p.id=p_product_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),'archive','product',p_product_id,v_before,v_after);
end;
$$;

create or replace function public.save_transaction(p_transaction jsonb, p_items jsonb default '[]'::jsonb)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_id uuid;
  v_idempotency_key uuid := nullif(p_transaction->>'idempotency_key','')::uuid;
  v_duplicate_id uuid;
  v_type text := coalesce(p_transaction->>'transaction_type','');
  v_payment text := coalesce(p_transaction->>'payment_method','');
  v_direction text := nullif(p_transaction->>'stock_direction','');
  v_occurred_at timestamptz := nullif(p_transaction->>'occurred_at','')::timestamptz;
  v_amount numeric := nullif(p_transaction->>'amount','')::numeric;
  v_category_id uuid := nullif(p_transaction->>'category_id','')::uuid;
  v_description text := nullif(trim(coalesce(p_transaction->>'description','')),'');
  v_applies_to text;
  v_item jsonb;
  v_old_item record;
  v_product_id uuid;
  v_qty numeric;
  v_price numeric;
  v_line_total numeric;
  v_sum numeric := 0;
  v_before numeric;
  v_after numeric;
  v_delta numeric;
  v_old_direction text;
  v_existing public.transactions%rowtype;
  v_before_data jsonb;
  v_after_data jsonb;
begin
  if not public.is_admin_user() then raise exception 'Akses ditolak: hanya Admin yang dapat menambah atau mengubah transaksi.' using errcode = '42501'; end if;
  if v_type not in ('income','expense') then raise exception 'Tipe transaksi tidak valid.'; end if;
  if v_payment not in ('transfer','cash') then raise exception 'Metode pembayaran tidak valid.'; end if;
  if v_occurred_at is null then raise exception 'Tanggal transaksi wajib diisi.'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'Nominal transaksi harus lebih besar dari nol.'; end if;
  if v_category_id is null then raise exception 'Kategori transaksi wajib dipilih.'; end if;
  select applies_to into v_applies_to from public.transaction_categories where id=v_category_id and is_active=true;
  if not found then raise exception 'Kategori transaksi tidak ditemukan atau tidak aktif.'; end if;
  if v_applies_to not in (v_type,'both') then raise exception 'Kategori tidak sesuai dengan tipe transaksi yang dipilih.'; end if;
  if coalesce(jsonb_typeof(p_items),'array') <> 'array' then raise exception 'Format detail barang tidak valid.'; end if;

  if jsonb_array_length(coalesce(p_items,'[]'::jsonb)) > 0 then
    if v_direction is null then raise exception 'Detail barang harus memiliki dampak stok yang dipilih.'; end if;
    if (v_type='income' and v_direction<>'out') or (v_type='expense' and v_direction<>'in') then
      raise exception 'Arah stok tidak sesuai dengan tipe transaksi. Pemasukan barang mengurangi stok; pengeluaran pembelian menambah stok.';
    end if;
    for v_item in select e.value from jsonb_array_elements(p_items) e(value) order by (e.value->>'product_id')::uuid loop
      if nullif(v_item->>'product_id','') is null then raise exception 'Barang pada detail transaksi wajib dipilih.'; end if;
      v_product_id := (v_item->>'product_id')::uuid;
      v_qty := nullif(v_item->>'quantity','')::numeric;
      v_price := nullif(v_item->>'unit_price','')::numeric;
      if v_qty is null or v_qty <= 0 then raise exception 'Kuantitas barang harus lebih besar dari nol.'; end if;
      if v_price is null or v_price < 0 then raise exception 'Harga per unit tidak boleh negatif dan harus terisi.'; end if;
      if not exists(select 1 from public.products where id=v_product_id and is_active=true) then raise exception 'Barang tidak ditemukan atau tidak aktif: %',v_product_id; end if;
      v_sum := v_sum + round(v_qty*v_price,2);
    end loop;
    if abs(v_sum-v_amount) > 0.01 then raise exception 'Nominal transaksi (%) tidak sama dengan total detail barang (%).',v_amount,v_sum; end if;
  elsif v_direction is not null then
    raise exception 'Arah stok dipilih tetapi belum ada detail barang.';
  end if;

  v_id := nullif(p_transaction->>'id','')::uuid;
  if v_id is null and v_idempotency_key is not null then
    select id into v_duplicate_id from public.transactions where idempotency_key=v_idempotency_key;
    if v_duplicate_id is not null then return v_duplicate_id; end if;
  end if;

  if v_id is not null then
    select * into v_existing from public.transactions where id=v_id and deleted_at is null for update;
    if not found then raise exception 'Transaksi tidak ditemukan atau sudah dihapus.'; end if;
    v_before_data := to_jsonb(v_existing);
    v_old_direction := v_existing.stock_direction;
    if v_old_direction is not null then
      for v_old_item in select ti.* from public.transaction_items ti where ti.transaction_id=v_id order by ti.product_id,ti.id for update loop
        select stock_qty into v_before from public.products where id=v_old_item.product_id for update;
        if v_before is null then raise exception 'Barang pada transaksi lama tidak ditemukan.'; end if;
        v_delta := case when v_old_direction='out' then v_old_item.quantity else -v_old_item.quantity end;
        v_after := v_before + v_delta;
        if v_after < 0 then raise exception 'Perubahan dibatalkan karena stok % tidak cukup untuk membalik transaksi sebelumnya. Periksa transaksi penjualan/pembelian setelah transaksi ini.',v_old_item.product_id; end if;
        update public.products set stock_qty=v_after,updated_at=now() where id=v_old_item.product_id;
        insert into public.inventory_movements(product_id,movement_type,quantity_delta,stock_before,stock_after,transaction_id,reason,created_by)
        values(v_old_item.product_id,'transaction_reversal',v_delta,v_before,v_after,v_id,'Pembalikan detail transaksi sebelum perubahan',auth.uid());
      end loop;
    end if;
    delete from public.transaction_items where transaction_id=v_id;
    update public.transactions set occurred_at=v_occurred_at,transaction_type=v_type,payment_method=v_payment,amount=v_amount,
      category_id=v_category_id,description=v_description,stock_direction=v_direction,updated_by=auth.uid(),updated_at=now()
    where id=v_id;
  else
    insert into public.transactions(occurred_at,transaction_type,payment_method,amount,category_id,description,stock_direction,idempotency_key,created_by,updated_by)
    values(v_occurred_at,v_type,v_payment,v_amount,v_category_id,v_description,v_direction,v_idempotency_key,auth.uid(),auth.uid())
    returning id into v_id;
  end if;

  if v_direction is not null then
    for v_item in select e.value from jsonb_array_elements(p_items) e(value) order by (e.value->>'product_id')::uuid loop
      v_product_id := (v_item->>'product_id')::uuid;
      v_qty := (v_item->>'quantity')::numeric;
      v_price := (v_item->>'unit_price')::numeric;
      v_line_total := round(v_qty*v_price,2);
      select stock_qty into v_before from public.products where id=v_product_id and is_active=true for update;
      if v_before is null then raise exception 'Barang tidak aktif atau tidak ditemukan: %',v_product_id; end if;
      v_delta := case when v_direction='in' then v_qty else -v_qty end;
      v_after := v_before + v_delta;
      if v_after < 0 then raise exception 'Stok tidak cukup untuk barang %. Stok tersedia %, kuantitas diminta %.',v_product_id,v_before,v_qty; end if;
      update public.products set stock_qty=v_after,updated_at=now() where id=v_product_id;
      insert into public.transaction_items(transaction_id,product_id,quantity,unit_price,line_total,stock_direction)
      values(v_id,v_product_id,v_qty,v_price,v_line_total,v_direction);
      insert into public.inventory_movements(product_id,movement_type,quantity_delta,stock_before,stock_after,transaction_id,reason,created_by)
      values(v_product_id,case when v_direction='in' then 'purchase_in' else 'sale_out' end,v_delta,v_before,v_after,v_id,
        case when v_direction='in' then 'Barang masuk melalui transaksi pengeluaran/pembelian' else 'Barang keluar melalui transaksi pemasukan/penjualan' end,auth.uid());
    end loop;
  end if;

  select to_jsonb(t) into v_after_data from public.transactions t where t.id=v_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),case when v_before_data is null then 'create' else 'update' end,'transaction',v_id,v_before_data,v_after_data);
  return v_id;
end;
$$;

create or replace function public.delete_transaction(p_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_existing public.transactions%rowtype;
  v_item record;
  v_before numeric;
  v_after numeric;
  v_delta numeric;
  v_before_data jsonb;
  v_after_data jsonb;
begin
  if not public.is_admin_user() then raise exception 'Akses ditolak: hanya Admin yang dapat menghapus transaksi.' using errcode = '42501'; end if;
  select * into v_existing from public.transactions where id=p_id and deleted_at is null for update;
  if not found then raise exception 'Transaksi tidak ditemukan atau sudah dihapus.'; end if;
  v_before_data := to_jsonb(v_existing);
  if v_existing.stock_direction is not null then
    for v_item in select ti.* from public.transaction_items ti where ti.transaction_id=p_id order by ti.product_id,ti.id for update loop
      select stock_qty into v_before from public.products where id=v_item.product_id for update;
      if v_before is null then raise exception 'Barang pada transaksi tidak ditemukan.'; end if;
      v_delta := case when v_existing.stock_direction='out' then v_item.quantity else -v_item.quantity end;
      v_after := v_before + v_delta;
      if v_after < 0 then raise exception 'Penghapusan dibatalkan karena stok barang % tidak cukup untuk membalik transaksi. Periksa penjualan atau pembelian setelah transaksi ini.',v_item.product_id; end if;
      update public.products set stock_qty=v_after,updated_at=now() where id=v_item.product_id;
      insert into public.inventory_movements(product_id,movement_type,quantity_delta,stock_before,stock_after,transaction_id,reason,created_by)
      values(v_item.product_id,'transaction_reversal',v_delta,v_before,v_after,p_id,'Pembalikan stok akibat penghapusan transaksi',auth.uid());
    end loop;
  end if;
  update public.transactions set deleted_at=now(),deleted_by=auth.uid(),updated_by=auth.uid(),updated_at=now() where id=p_id;
  select to_jsonb(t) into v_after_data from public.transactions t where t.id=p_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),'soft_delete','transaction',p_id,v_before_data,v_after_data);
end;
$$;

create or replace function public.get_dashboard_summary(p_date date, p_month integer, p_year integer)
returns jsonb
language plpgsql stable security invoker
set search_path = public, pg_temp
as $$
declare
  v_day_transfer numeric := 0; v_day_cash numeric := 0; v_day_income numeric := 0; v_day_expense numeric := 0;
  v_month_income numeric := 0; v_year_income numeric := 0; v_month_expense numeric := 0;
  v_count bigint := 0; v_recent jsonb := '[]'::jsonb;
  v_month integer := coalesce(p_month,extract(month from p_date)::integer);
  v_year integer := coalesce(p_year,extract(year from p_date)::integer);
  v_from_month date; v_to_month date; v_from_year date; v_to_year date;
begin
  if p_date is null then raise exception 'Tanggal laporan wajib diisi.'; end if;
  if v_month < 1 or v_month > 12 then raise exception 'Bulan laporan tidak valid.'; end if;
  if v_year < 2000 or v_year > 2100 then raise exception 'Tahun laporan tidak valid.'; end if;
  v_from_month := make_date(v_year,v_month,1);
  v_to_month := case when v_year=extract(year from p_date)::integer and v_month=extract(month from p_date)::integer then p_date else (v_from_month + interval '1 month' - interval '1 day')::date end;
  v_from_year := make_date(v_year,1,1);
  v_to_year := case when v_year=extract(year from p_date)::integer then p_date else make_date(v_year,12,31) end;
  select
    coalesce(sum(amount) filter(where transaction_type='income' and payment_method='transfer'),0),
    coalesce(sum(amount) filter(where transaction_type='income' and payment_method='cash'),0),
    coalesce(sum(amount) filter(where transaction_type='income'),0),
    coalesce(sum(amount) filter(where transaction_type='expense'),0)
  into v_day_transfer,v_day_cash,v_day_income,v_day_expense
  from public.transactions
  where deleted_at is null and (occurred_at at time zone 'Asia/Jakarta')::date=p_date;

  select coalesce(sum(amount) filter(where transaction_type='income'),0), coalesce(sum(amount) filter(where transaction_type='expense'),0)
  into v_month_income,v_month_expense from public.transactions
  where deleted_at is null and (occurred_at at time zone 'Asia/Jakarta')::date between v_from_month and v_to_month;

  select coalesce(sum(amount),0) into v_year_income from public.transactions
  where deleted_at is null and transaction_type='income' and (occurred_at at time zone 'Asia/Jakarta')::date between v_from_year and v_to_year;

  select count(*) into v_count from public.transactions
  where deleted_at is null and (occurred_at at time zone 'Asia/Jakarta')::date=p_date;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'occurred_at',t.occurred_at,'transaction_type',t.transaction_type,'payment_method',t.payment_method,
    'amount',t.amount,'description',t.description,'category_name',c.name
  ) order by t.occurred_at desc),'[]'::jsonb)
  into v_recent from (
    select * from public.transactions where deleted_at is null and (occurred_at at time zone 'Asia/Jakarta')::date=p_date order by occurred_at desc limit 250
  ) t left join public.transaction_categories c on c.id=t.category_id;

  return jsonb_build_object('day_transfer',v_day_transfer,'day_cash',v_day_cash,'day_income',v_day_income,'day_expense',v_day_expense,
    'month_income',v_month_income,'year_income',v_year_income,'month_expense',v_month_expense,'transaction_count',v_count,'recent_transactions',v_recent);
end;
$$;

create or replace function public.get_inventory_summary()
returns jsonb
language plpgsql stable security invoker
set search_path = public, pg_temp
as $$
declare
  v_active bigint := 0;
  v_low bigint := 0;
  v_critical bigint := 0;
  v_low_stock_products jsonb := '[]'::jsonb;
begin
  select count(*),
    count(*) filter (where stock_qty <= min_stock),
    count(*) filter (where stock_qty <= 0)
  into v_active, v_low, v_critical
  from public.products where is_active = true;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'sku',p.sku,'name',p.name,'category_id',p.category_id,
    'selling_price',p.selling_price,'cost_price',p.cost_price,'stock_qty',p.stock_qty,
    'unit',p.unit,'min_stock',p.min_stock,'is_active',p.is_active,
    'product_categories',case when c.id is null then null else jsonb_build_object('name',c.name) end
  ) order by p.stock_qty asc, p.name asc),'[]'::jsonb)
  into v_low_stock_products
  from (
    select p.* from public.products p
    where p.is_active = true and p.stock_qty <= p.min_stock
    order by p.stock_qty asc, p.name asc limit 8
  ) p
  left join public.product_categories c on c.id = p.category_id;

  return jsonb_build_object('active_products',v_active,'low_stock_count',v_low,'critical_count',v_critical,'low_stock_products',v_low_stock_products);
end;
$$;

create or replace function public.get_owner_report(p_from date, p_to date)
returns jsonb
language plpgsql stable security invoker
set search_path = public, pg_temp
as $$
declare
  v_count bigint := 0; v_income numeric := 0; v_expense numeric := 0; v_transfer numeric := 0; v_cash numeric := 0;
  v_monthly jsonb := '[]'::jsonb; v_recent jsonb := '[]'::jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to then raise exception 'Rentang tanggal laporan tidak valid.'; end if;
  if p_to - p_from > 400 then raise exception 'Rentang laporan maksimal 400 hari per permintaan.'; end if;
  select count(*),
    coalesce(sum(amount) filter(where transaction_type='income'),0),
    coalesce(sum(amount) filter(where transaction_type='expense'),0),
    coalesce(sum(amount) filter(where transaction_type='income' and payment_method='transfer'),0),
    coalesce(sum(amount) filter(where transaction_type='income' and payment_method='cash'),0)
  into v_count,v_income,v_expense,v_transfer,v_cash
  from public.transactions
  where deleted_at is null and (occurred_at at time zone 'Asia/Jakarta')::date between p_from and p_to;

  with months as (
    select generate_series(date_trunc('month',p_from::timestamp),date_trunc('month',p_to::timestamp),interval '1 month') as month_start
  ), aggregate_months as (
    select date_trunc('month',t.occurred_at at time zone 'Asia/Jakarta') as month_start,
      coalesce(sum(t.amount) filter(where t.transaction_type='income'),0) as income,
      coalesce(sum(t.amount) filter(where t.transaction_type='expense'),0) as expense,
      count(*) as transaction_count
    from public.transactions t
    where t.deleted_at is null and (t.occurred_at at time zone 'Asia/Jakarta')::date between p_from and p_to
    group by date_trunc('month',t.occurred_at at time zone 'Asia/Jakarta')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'month',case extract(month from m.month_start)::int
      when 1 then 'Jan' when 2 then 'Feb' when 3 then 'Mar' when 4 then 'Apr' when 5 then 'Mei' when 6 then 'Jun'
      when 7 then 'Jul' when 8 then 'Agu' when 9 then 'Sep' when 10 then 'Okt' when 11 then 'Nov' when 12 then 'Des' end,
    'month_key',to_char(m.month_start,'YYYY-MM'),'income',coalesce(a.income,0),'expense',coalesce(a.expense,0),'transaction_count',coalesce(a.transaction_count,0)
  ) order by m.month_start),'[]'::jsonb)
  into v_monthly from months m left join aggregate_months a using(month_start);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'occurred_at',t.occurred_at,'transaction_type',t.transaction_type,'payment_method',t.payment_method,
    'amount',t.amount,'description',t.description,'category_name',c.name
  ) order by t.occurred_at desc),'[]'::jsonb)
  into v_recent from (
    select * from public.transactions where deleted_at is null and (occurred_at at time zone 'Asia/Jakarta')::date between p_from and p_to order by occurred_at desc limit 1000
  ) t left join public.transaction_categories c on c.id=t.category_id;

  return jsonb_build_object('from_date',p_from,'to_date',p_to,'total_transactions',v_count,'total_income',v_income,'total_expense',v_expense,
    'transfer_income',v_transfer,'cash_income',v_cash,'monthly',v_monthly,'recent_transactions',v_recent);
end;
$$;

-- Tighten function execution. Browser callers get only the RPCs intentionally exposed.
revoke all on function public.save_product(jsonb) from public;
revoke all on function public.adjust_stock(uuid,numeric,text) from public;
revoke all on function public.archive_product(uuid) from public;
revoke all on function public.save_transaction(jsonb,jsonb) from public;
revoke all on function public.delete_transaction(uuid) from public;
revoke all on function public.get_dashboard_summary(date,integer,integer) from public;
revoke all on function public.get_inventory_summary() from public;
revoke all on function public.get_owner_report(date,date) from public;
grant execute on function public.save_product(jsonb) to authenticated;
grant execute on function public.adjust_stock(uuid,numeric,text) to authenticated;
grant execute on function public.archive_product(uuid) to authenticated;
grant execute on function public.save_transaction(jsonb,jsonb) to authenticated;
grant execute on function public.delete_transaction(uuid) to authenticated;
grant execute on function public.get_dashboard_summary(date,integer,integer) to authenticated;
grant execute on function public.get_inventory_summary() to authenticated;
grant execute on function public.get_owner_report(date,date) to authenticated;
