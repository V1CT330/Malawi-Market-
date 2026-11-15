-- Trigger functions are invoked by their table triggers, not exposed as client RPCs.
-- Run them as the caller and remove direct EXECUTE grants from API roles.
alter function public.enforce_market_kyc_submission() security invoker;
revoke execute on function public.enforce_market_kyc_submission() from public, anon, authenticated;

alter function public.protect_market_seller_approval() security invoker;
revoke execute on function public.protect_market_seller_approval() from public, anon, authenticated;
