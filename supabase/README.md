# Malawi Market transactional backend

The Android app uses the Malawi Market Supabase project only. Do not reuse the Malawian App Store (MAS) project or credentials.

## OneKhusa Edge Function

Function: `onekhusa-payments`

- Buyer payment initiation: `POST https://fbkzzqzwxsnuvkszrcxq.supabase.co/functions/v1/onekhusa-payments`
  - JSON body: `{"action":"initiate","order_id":"<market-order-uuid>"}`
  - Requires the buyer's Supabase access token in the Authorization header.
- OneKhusa callback: `POST https://fbkzzqzwxsnuvkszrcxq.supabase.co/functions/v1/onekhusa-payments/webhook`
  - Verify webhook events `payrequest.success` and `payrequest.reversed` are subscribed in the OneKhusa portal.

## Required Edge Function secrets

Set these in Supabase Dashboard → Project → Edge Functions → Secrets. Never put them in the APK or GitHub:

- `ONEKHUSA_API_KEY`
- `ONEKHUSA_API_SECRET`
- `ONEKHUSA_ORGANISATION_ID`
- `ONEKHUSA_MERCHANT_ACCOUNT_NUMBER` (8-digit merchant account number)
- `ONEKHUSA_CAPTURED_BY` (OneKhusa-authorized user/email)
- `ONEKHUSA_WEBHOOK_SECRET`
- `ONEKHUSA_ENV` = `sandbox` until sandbox transactions have been verified; use `live` only after OneKhusa activates production credentials.

The Edge Function also needs the project's server-side Supabase secret/service-role environment key, which Supabase supplies to hosted functions.

## Transaction rules

- Order totals and prices are calculated from database product records, not client-submitted prices.
- Stock is reserved atomically when an order is placed.
- Buyers may cancel unpaid orders; stock is restored.
- Orders become paid only after a valid OneKhusa HMAC-SHA512 webhook with a matching reference and amount.
- Sellers can fulfil only paid order items.
- Payment reversals and mismatched amounts are moved to manual review.
- TAN expiry is 15 minutes. Buyers can request a new TAN for an unpaid order.
- Delivery fee is currently zero in checkout; sellers must disclose any separate delivery arrangement before the buyer pays.
