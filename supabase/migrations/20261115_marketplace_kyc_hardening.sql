-- Malawi Market: secure KYC submissions and require approved KYC for seller publishing.
-- Reuses the existing kyc_submissions table and existing KYC storage policies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kyc-docs',
  'kyc-docs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create or replace function public.enforce_market_kyc_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or new.user_id <> auth.uid() then
    raise exception 'KYC submissions must belong to the signed-in user';
  end if;

  if new.document_url is null
     or new.document_url not like auth.uid()::text || '/%'
     or new.selfie_url is null
     or new.selfie_url not like auth.uid()::text || '/%' then
    raise exception 'KYC files must be uploaded to the private KYC folder';
  end if;

  if exists (
    select 1
    from public.kyc_submissions k
    where k.user_id = new.user_id
      and k.status = 'approved'::public.kyc_status
      and k.created_at >= coalesce(
        (select max(k2.created_at)
         from public.kyc_submissions k2
         where k2.user_id = new.user_id
           and k2.status = 'rejected'::public.kyc_status),
        '-infinity'::timestamptz
      )
  ) then
    raise exception 'This account already has an approved KYC submission';
  end if;

  new.status := 'pending'::public.kyc_status;
  new.notes := null;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists enforce_market_kyc_submission on public.kyc_submissions;
create trigger enforce_market_kyc_submission
before insert on public.kyc_submissions
for each row execute function public.enforce_market_kyc_submission();

create unique index if not exists kyc_submissions_one_pending_per_user
on public.kyc_submissions (user_id)
where status = 'pending'::public.kyc_status;

alter policy "Active sellers can create their own products"
on public.market_products
with check (
  exists (
    select 1
    from public.market_sellers s
    where s.id = market_products.seller_id
      and s.auth_user_id = (select auth.uid())
      and s.status = 'active'
      and (
        select k.status
        from public.kyc_submissions k
        where k.user_id = s.auth_user_id
        order by k.created_at desc
        limit 1
      ) = 'approved'::public.kyc_status
  )
  and not exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.suspended = true
  )
);

alter policy "Sellers can update their own products"
on public.market_products
using (
  exists (
    select 1
    from public.market_sellers s
    where s.id = market_products.seller_id
      and s.auth_user_id = (select auth.uid())
      and s.status = 'active'
      and (
        select k.status
        from public.kyc_submissions k
        where k.user_id = s.auth_user_id
        order by k.created_at desc
        limit 1
      ) = 'approved'::public.kyc_status
  )
  and not exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.suspended = true
  )
)
with check (
  exists (
    select 1
    from public.market_sellers s
    where s.id = market_products.seller_id
      and s.auth_user_id = (select auth.uid())
      and s.status = 'active'
      and (
        select k.status
        from public.kyc_submissions k
        where k.user_id = s.auth_user_id
        order by k.created_at desc
        limit 1
      ) = 'approved'::public.kyc_status
  )
  and not exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.suspended = true
  )
);
