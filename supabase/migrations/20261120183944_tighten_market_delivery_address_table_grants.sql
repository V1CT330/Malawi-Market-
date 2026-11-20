-- Remove default table grants; expose only the CRUD operations needed by authenticated owners.
revoke all on table public.market_delivery_addresses from anon, public, authenticated;
grant select, insert, update, delete on table public.market_delivery_addresses to authenticated;
