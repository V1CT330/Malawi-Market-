# Malawi Market backend operations

Malawi Market uses Supabase project `fbkzzqzwxsnuvkszrcxq`. Do not use the Malawian App Store project or its credentials. OneKhusa payment configuration and seller settlement are intentionally paused.

## Media uploads

- Storage bucket: `market-media` (public read, 5 MB maximum).
- Product and avatar uploads use the Expo image picker.
- Objects are stored under the authenticated user's UUID folder; upload, update and delete policies restrict writes to that user's folder.
- Supported image types: JPEG, PNG and WebP.

## Admin access

The admin dashboard is protected by the `user_roles` table and the `has_role` check. The old `claim_first_admin()` function has had EXECUTE revoked because allowing any signed-in user to claim the first admin role would expose the marketplace.

After confirming the owner's exact login email, grant the role from the Supabase SQL editor using the matching auth user:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from auth.users
where lower(email) = lower('OWNER_LOGIN_EMAIL')
on conflict (user_id, role) do nothing;
```

Replace the placeholder with the exact account email. Do not expose this operation through the mobile app.

Admin capabilities:
- Approve, suspend and reactivate seller accounts.
- Publish/archive product listings.
- View marketplace orders and paid order value.
- Suspend/reactivate users.
- Review, resolve or dismiss product/user reports.
- Publish sourced jobs, stock quotes and football fixtures/standings.

## News feed

Edge Function: `market-content-sync` (JWT verification enabled; admin role required).

The Admin Dashboard's **Sync Malawi24 RSS news** action imports article headlines and short summaries from:
- `https://malawi24.com/feed/`
- `https://malawi24.com/business/feed/`

Original article links and source attribution are retained. The app links readers to the publisher; it does not reproduce full articles. A unique source URL index prevents duplicate article records.

Jobs, Malawi Stock Exchange quotes and football fixtures are currently published through the admin content forms. Do not label these as live provider feeds until an authoritative provider or feed is connected.

## Password recovery

The app uses the redirect URI:

```
mw.wealthgrid.malawimarket://auth/reset-password
```

Add that exact URI under Supabase Dashboard → Authentication → URL Configuration → Redirect URLs. The app handles recovery links and lets the user set a new password after the recovery session is established.

## Notifications

Database triggers create in-app notifications for:
- New seller applications (to admins).
- Order creation (buyer and seller).
- Verified payment confirmation (buyer and seller).
- Fulfilment status updates (buyer).
- Order cancellation (buyer).
- New marketplace reports (admins).

`market_notifications` is enabled for Supabase Realtime. No push notification provider is configured.

## Transaction rules

- Order totals and prices are calculated from database product records.
- Stock is reserved atomically when an order is placed.
- Buyers may cancel unpaid orders; stock is restored.
- Orders become paid only after a valid OneKhusa webhook with matching reference and amount.
- Sellers can fulfil only paid order items.
- Payment reversals and mismatched amounts are moved to manual review.
- TAN expiry is 15 minutes. Buyers can request a new TAN from Order History.
- Delivery fee is currently zero in checkout; sellers must disclose any separate delivery arrangement before the buyer pays.

OneKhusa merchant credentials and settlement settings remain unconfigured by design.
