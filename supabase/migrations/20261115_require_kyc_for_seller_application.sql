-- Enforce identity approval before a user can create a seller application.
alter policy "Users can create a pending seller profile"
on public.market_sellers
with check (
  auth_user_id = (select auth.uid())
  and status = 'pending'::text
  and is_verified = false
  and (
    select k.status
    from public.kyc_submissions k
    where k.user_id = auth_user_id
    order by k.created_at desc
    limit 1
  ) = 'approved'::public.kyc_status
  and not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.suspended = true
  )
);
