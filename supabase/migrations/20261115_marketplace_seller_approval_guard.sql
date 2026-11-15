-- Prevent sellers from granting themselves active or verified status.
create or replace function public.protect_market_seller_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and auth.uid() = old.auth_user_id
     and not public.has_role(auth.uid(), 'admin'::public.app_role) then
    new.status := old.status;
    new.is_verified := old.is_verified;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_market_seller_approval on public.market_sellers;
create trigger protect_market_seller_approval
before update on public.market_sellers
for each row execute function public.protect_market_seller_approval();
