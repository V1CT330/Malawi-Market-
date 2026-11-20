create or replace function public.guard_market_profile_privileged_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is not null
     and auth.uid() = old.id
     and not public.has_role(auth.uid(), 'admin'::public.app_role)
     and (
       new.phone_verified is distinct from old.phone_verified
       or new.is_developer is distinct from old.is_developer
       or new.developer_name is distinct from old.developer_name
       or new.kyc_status is distinct from old.kyc_status
       or new.suspended is distinct from old.suspended
       or new.reputation_score is distinct from old.reputation_score
       or new.follower_count is distinct from old.follower_count
       or new.developer_terms_accepted_at is distinct from old.developer_terms_accepted_at
     ) then
    raise exception 'Protected account fields can only be changed by authorized administrators or trusted server operations';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_market_profile_privileged_fields on public.profiles;
create trigger guard_market_profile_privileged_fields
before update on public.profiles
for each row execute function public.guard_market_profile_privileged_fields();

create or replace function public.guard_market_seller_verification_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is not null
     and auth.uid() = old.auth_user_id
     and not public.has_role(auth.uid(), 'admin'::public.app_role)
     and (
       new.status is distinct from old.status
       or new.is_verified is distinct from old.is_verified
       or new.auth_user_id is distinct from old.auth_user_id
     ) then
    raise exception 'Seller verification and account ownership fields are administrator-controlled';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_market_seller_verification_fields on public.market_sellers;
create trigger guard_market_seller_verification_fields
before update on public.market_sellers
for each row execute function public.guard_market_seller_verification_fields();

create or replace function public.enforce_market_product_review_purchase()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is not null
     and not public.has_role(auth.uid(), 'admin'::public.app_role)
     and not exists (
       select 1
       from public.market_order_items oi
       join public.market_orders o on o.id = oi.order_id
       where oi.product_id = new.product_id
         and o.buyer_user_id = auth.uid()
         and o.payment_status = 'paid'
         and oi.fulfillment_status = 'delivered'
     ) then
    raise exception 'A verified purchase must be paid and delivered before reviewing this product';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_market_product_review_purchase on public.market_product_reviews;
create trigger enforce_market_product_review_purchase
before insert or update on public.market_product_reviews
for each row execute function public.enforce_market_product_review_purchase();

create unique index if not exists market_product_reviews_product_reviewer_uidx
on public.market_product_reviews(product_id, reviewer_user_id);
