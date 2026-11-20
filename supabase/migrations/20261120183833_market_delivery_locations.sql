-- Optional delivery coordinates and customer-owned saved addresses.
alter table public.market_orders
  add column if not exists delivery_latitude double precision,
  add column if not exists delivery_longitude double precision,
  add column if not exists delivery_landmark text;
alter table public.market_orders
  drop constraint if exists market_orders_delivery_coordinates_pair_check,
  add constraint market_orders_delivery_coordinates_pair_check check (
    (delivery_latitude is null and delivery_longitude is null)
    or (delivery_latitude between -90 and 90 and delivery_longitude between -180 and 180)
  ),
  drop constraint if exists market_orders_delivery_landmark_length_check,
  add constraint market_orders_delivery_landmark_length_check
    check (delivery_landmark is null or char_length(delivery_landmark) <= 200);

create table if not exists public.market_delivery_addresses (
  id uuid primary key default gen_random_uuid(),
  buyer_user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Home',
  recipient_name text not null,
  phone text not null,
  address text not null,
  landmark text,
  latitude double precision,
  longitude double precision,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint market_delivery_addresses_coordinates_pair_check check (
    (latitude is null and longitude is null)
    or (latitude between -90 and 90 and longitude between -180 and 180)
  ),
  constraint market_delivery_addresses_label_length_check check (char_length(label) between 1 and 40),
  constraint market_delivery_addresses_landmark_length_check check (landmark is null or char_length(landmark) <= 200),
  constraint market_delivery_addresses_address_length_check check (char_length(address) between 5 and 500),
  constraint market_delivery_addresses_name_length_check check (char_length(recipient_name) between 2 and 120),
  constraint market_delivery_addresses_phone_length_check check (char_length(phone) between 7 and 30)
);
create index if not exists market_delivery_addresses_buyer_idx
  on public.market_delivery_addresses(buyer_user_id, updated_at desc);
create unique index if not exists market_delivery_addresses_one_default_per_buyer_idx
  on public.market_delivery_addresses(buyer_user_id) where is_default = true;
alter table public.market_delivery_addresses enable row level security;
revoke all on table public.market_delivery_addresses from anon, public, authenticated;
grant select, insert, update, delete on table public.market_delivery_addresses to authenticated;
drop policy if exists "Buyers manage their own delivery addresses" on public.market_delivery_addresses;
create policy "Buyers manage their own delivery addresses"
  on public.market_delivery_addresses for all to authenticated
  using (buyer_user_id = (select auth.uid()))
  with check (buyer_user_id = (select auth.uid()));

drop function if exists public.create_market_order(jsonb, text, text, text, text, uuid);
CREATE OR REPLACE FUNCTION public.create_market_order(p_items jsonb, p_delivery_name text, p_delivery_phone text, p_delivery_address text, p_notes text DEFAULT NULL::text, p_idempotency_key uuid DEFAULT gen_random_uuid(), p_delivery_latitude double precision DEFAULT NULL::double precision, p_delivery_longitude double precision DEFAULT NULL::double precision, p_delivery_landmark text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_buyer uuid := auth.uid();
  v_order_id uuid;
  v_subtotal bigint := 0;
  v_item jsonb;
  v_product public.market_products%rowtype;
  v_qty integer;
begin
  if v_buyer is null then raise exception 'Sign in before checkout'; end if;
  if exists(select 1 from public.profiles where id = v_buyer and suspended = true) then
    raise exception 'This account is suspended';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'Cart must contain between 1 and 30 products';
  end if;
  if (select count(*) from jsonb_array_elements(p_items))
     <> (select count(distinct value->>'product_id') from jsonb_array_elements(p_items)) then
    raise exception 'Cart contains duplicate product entries';
  end if;
  if length(trim(coalesce(p_delivery_name, ''))) < 2
     or length(trim(coalesce(p_delivery_phone, ''))) < 7
     or length(trim(coalesce(p_delivery_address, ''))) < 5 then
    raise exception 'Enter a valid recipient name, phone number and delivery address';
  end if;
  if (p_delivery_latitude is null) <> (p_delivery_longitude is null)
     or (p_delivery_latitude is not null and
         (p_delivery_latitude not between -90 and 90 or p_delivery_longitude not between -180 and 180)) then
    raise exception 'Delivery pin coordinates are invalid';
  end if;
  if char_length(coalesce(p_delivery_landmark, '')) > 200 then
    raise exception 'Delivery landmark must be 200 characters or fewer';
  end if;

  select id into v_order_id
  from public.market_orders
  where buyer_user_id = v_buyer and idempotency_key = p_idempotency_key;
  if v_order_id is not null then return v_order_id; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(v_item->>'product_id', '') !~* '^[0-9a-f-]{36}$' then
      raise exception 'Invalid product';
    end if;
    v_qty := (v_item->>'quantity')::integer;
    if v_qty < 1 or v_qty > 99 then raise exception 'Invalid quantity'; end if;
    select * into v_product
    from public.market_products
    where id = (v_item->>'product_id')::uuid
    for update;
    if not found or v_product.status <> 'published' then raise exception 'A product is no longer available'; end if;
    if v_product.price_mwk <= 0 then raise exception 'A product has an invalid price'; end if;
    if v_product.stock_quantity < v_qty then raise exception 'Insufficient stock for %', v_product.title; end if;
    if not exists(select 1 from public.market_sellers s where s.id = v_product.seller_id and s.status = 'active') then
      raise exception 'A seller is not currently active';
    end if;
    if exists(
      select 1 from public.market_sellers s
      join public.profiles p on p.id = s.auth_user_id
      where s.id = v_product.seller_id and p.suspended = true
    ) then raise exception 'A seller account is suspended'; end if;
    v_subtotal := v_subtotal + (v_product.price_mwk * v_qty);
    if v_subtotal > 9000000000000000 then raise exception 'Order total is too large'; end if;
  end loop;

  insert into public.market_orders(
    buyer_user_id, status, subtotal_mwk, delivery_fee_mwk, total_mwk,
    delivery_name, delivery_phone, delivery_address, delivery_latitude,
    delivery_longitude, delivery_landmark, notes, payment_provider,
    payment_status, idempotency_key
  )
  values(
    v_buyer, 'pending_payment', v_subtotal, 0, v_subtotal,
    trim(p_delivery_name), trim(p_delivery_phone), trim(p_delivery_address),
    p_delivery_latitude, p_delivery_longitude, nullif(trim(coalesce(p_delivery_landmark, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''), 'onekhusa', 'unpaid', p_idempotency_key
  )
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_product from public.market_products where id = (v_item->>'product_id')::uuid for update;
    update public.market_products
    set stock_quantity = stock_quantity - v_qty, updated_at = now()
    where id = v_product.id;
    insert into public.market_order_items(
      order_id, product_id, seller_id, product_title, unit_price_mwk, quantity, fulfillment_status
    )
    values(v_order_id, v_product.id, v_product.seller_id, v_product.title, v_product.price_mwk, v_qty, 'awaiting_payment');
  end loop;
  return v_order_id;
exception
  when unique_violation then
    select id into v_order_id
    from public.market_orders
    where buyer_user_id = v_buyer and idempotency_key = p_idempotency_key;
    if v_order_id is not null then return v_order_id; end if;
    raise;
end;
$function$

revoke all on function public.create_market_order(jsonb, text, text, text, text, uuid, double precision, double precision, text) from public, anon;
grant execute on function public.create_market_order(jsonb, text, text, text, text, uuid, double precision, double precision, text) to authenticated;
