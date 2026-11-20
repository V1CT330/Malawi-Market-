drop policy if exists "Advertisers update own drafts" on public.market_ad_campaigns;

revoke all on table public.market_ad_campaigns from public, anon, authenticated;
grant select (
  id, business_name, title, body, destination_url, image_url, placement,
  budget_mwk, spent_mwk, status, payment_status, starts_at, ends_at,
  created_at, activated_at
) on table public.market_ad_campaigns to anon, authenticated;
grant insert (
  advertiser_user_id, business_name, contact_email, title, body,
  destination_url, image_url, placement, budget_mwk
) on table public.market_ad_campaigns to authenticated;

revoke all on table public.market_ad_events from public, anon, authenticated;
grant select on table public.market_ad_events to authenticated;

create or replace function public.admin_update_market_ad_campaign(
  p_campaign_id uuid,
  p_status text,
  p_admin_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment_status text;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Administrator access required';
  end if;
  if p_status not in ('paused','suspended','rejected','active') then
    raise exception 'Invalid advertising campaign status';
  end if;
  select payment_status into v_payment_status
  from public.market_ad_campaigns
  where id = p_campaign_id
  for update;
  if not found then raise exception 'Advertising campaign not found'; end if;
  if p_status = 'active' and v_payment_status <> 'paid' then
    raise exception 'Only paid advertising campaigns can be activated';
  end if;
  update public.market_ad_campaigns
  set status = p_status,
      admin_note = nullif(trim(coalesce(p_admin_note,'')), ''),
      updated_at = now()
  where id = p_campaign_id;
  return true;
end;
$$;
revoke execute on function public.admin_update_market_ad_campaign(uuid,text,text) from public, anon;
grant execute on function public.admin_update_market_ad_campaign(uuid,text,text) to authenticated;
