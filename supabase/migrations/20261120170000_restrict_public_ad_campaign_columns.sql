revoke select on table public.market_ad_campaigns from anon, authenticated;
grant select (
  id,
  business_name,
  title,
  body,
  destination_url,
  image_url,
  placement,
  budget_mwk,
  spent_mwk,
  status,
  payment_status,
  starts_at,
  ends_at,
  created_at,
  activated_at
) on table public.market_ad_campaigns to anon, authenticated;
