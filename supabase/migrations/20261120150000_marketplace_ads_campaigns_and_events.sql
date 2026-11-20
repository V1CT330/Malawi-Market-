create table public.market_ad_campaigns (
 id uuid primary key default gen_random_uuid(),
 advertiser_user_id uuid not null references auth.users(id) on delete cascade,
 business_name text not null check (char_length(btrim(business_name)) between 2 and 120),
 contact_email text not null check (char_length(contact_email) <= 254),
 title text not null check (char_length(btrim(title)) between 3 and 120),
 body text not null check (char_length(btrim(body)) between 10 and 500),
 destination_url text not null check (destination_url ~* '^https://'),
 image_url text not null check (image_url ~* '^https://'),
 placement text not null check (placement in ('homepage','search','feed','business')),
 budget_mwk bigint not null check (budget_mwk between 1000 and 100000000),
 spent_mwk bigint not null default 0 check (spent_mwk >= 0 and spent_mwk <= budget_mwk),
 status text not null default 'draft' check (status in ('draft','pending_payment','active','paused','completed','rejected','suspended')),
 payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','paid','failed','reversed','refunded','review_required')),
 payment_reference text unique,
 provider_transaction_reference text,
 starts_at timestamptz,
 ends_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 activated_at timestamptz,
 admin_note text
);
create index market_ad_campaigns_active_placement_idx on public.market_ad_campaigns(placement,status,starts_at,ends_at);
create index market_ad_campaigns_advertiser_idx on public.market_ad_campaigns(advertiser_user_id,created_at desc);
create table public.market_ad_events (
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.market_ad_campaigns(id) on delete cascade,
 event_type text not null check (event_type in ('impression','click')),
 visitor_hash text,
 created_at timestamptz not null default now()
);
create index market_ad_events_campaign_time_idx on public.market_ad_events(campaign_id,event_type,created_at desc);
alter table public.market_ad_campaigns enable row level security;
alter table public.market_ad_events enable row level security;
create policy "Advertisers read own campaigns" on public.market_ad_campaigns for select to authenticated using (advertiser_user_id = (select auth.uid()) or public.has_role((select auth.uid()),'admin'::public.app_role));
create policy "Advertisers create own campaigns" on public.market_ad_campaigns for insert to authenticated with check (advertiser_user_id = (select auth.uid()) and status = 'draft' and payment_status = 'unpaid');
create policy "Advertisers update own drafts" on public.market_ad_campaigns for update to authenticated using (advertiser_user_id = (select auth.uid()) and status in ('draft','paused')) with check (advertiser_user_id = (select auth.uid()) and status in ('draft','paused'));
create policy "Admins manage campaigns" on public.market_ad_campaigns for all to authenticated using (public.has_role((select auth.uid()),'admin'::public.app_role)) with check (public.has_role((select auth.uid()),'admin'::public.app_role));
create policy "Public read active ad creative" on public.market_ad_campaigns for select to anon, authenticated using (status='active' and payment_status='paid' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
create policy "Admins read ad events" on public.market_ad_events for select to authenticated using (public.has_role((select auth.uid()),'admin'::public.app_role));
revoke insert,update,delete on public.market_ad_events from anon,authenticated;
grant select on public.market_ad_campaigns to anon,authenticated;
grant insert,select,update on public.market_ad_campaigns to authenticated;
grant select on public.market_ad_events to authenticated;
