# Malawi Market

Malawi Market is a native Android marketplace app built with **Expo, React Native, TypeScript, and Supabase**. It is designed for browsing products, connecting buyers and sellers, and managing marketplace activity from an Android device.

> This repository contains the native mobile application. It is not a WebView wrapper.

## Current technology

- Expo SDK 54
- React Native 0.81
- React 19
- TypeScript
- Supabase (Postgres, Auth, Storage, Realtime, and Edge Functions)
- AsyncStorage for local persisted app state
- Expo Image Picker for product and profile images

## Main app areas

The app is organised around these areas:

- **Marketplace:** home storefront, product discovery, search, product details, and category browsing.
- **Wishlist and cart:** save products and manage a shopping cart.
- **Account and authentication:** account screens, sign-in, and password recovery.
- **Seller portal:** seller onboarding and listing management.
- **Checkout and orders:** checkout flow and order-related screens.
- **Explore:** marketplace content and discovery screens.
- **Admin dashboard:** seller and listing moderation, marketplace operations, and curated content management.
- **Product reviews:** product feedback and review UI.

The exact availability of an action depends on account permissions and backend configuration. Do not assume that a visible payment or content feature is connected to a live external provider.

## Requirements

- Node.js 22 (matches the repository's Android CI workflow)
- npm
- Android Studio / Android SDK for local Android builds
- Java 17 for Gradle Android builds

## Run locally

1. Clone the repository:

   ```bash
   git clone https://github.com/V1CT330/Malawi-Market-.git
   cd Malawi-Market-
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Check TypeScript:

   ```bash
   npm run typecheck
   ```

4. Start Expo:

   ```bash
   npx expo start
   ```

To run on an Android emulator or connected device:

```bash
npm run android
```

The app's Expo configuration is in `app.json`; package scripts and dependencies are in `package.json`.

## Build an Android APK with GitHub Actions

The repository includes **Build Malawi Market APK** at [`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml).

1. Open the repository on GitHub.
2. Select **Actions**.
3. Choose **Build Malawi Market APK**.
4. Select **Run workflow** and run it against the branch you want to build.
5. When the run succeeds, open the run and download the `malawi-market-debug-apk` artifact.

The workflow installs Node.js 22 and Java 17, installs Android SDK packages, runs `npm run typecheck`, generates the Android project with Expo Prebuild, and builds a debug APK with Gradle. The artifact is retained for 14 days.

**Important:** automatic push builds are currently configured for the `Filorux-Blockchain` branch. Builds from `main` can be started manually through Actions.

## Backend

The mobile app connects to the dedicated Malawi Market Supabase project. Backend setup and operational notes are maintained separately in [`supabase/README.md`](supabase/README.md).

That guide covers:

- Storage bucket and image upload policies.
- Admin role provisioning and dashboard permissions.
- News synchronization and content publishing.
- Password recovery redirect configuration.
- In-app notifications and Realtime.
- Order, stock reservation, and payment verification rules.

Use the Malawi Market Supabase project only. Do not substitute credentials from another application.

### Credentials and security

The mobile client may contain a Supabase publishable/anonymous key; that key is intended for client use and is not a substitute for database security. Access must be enforced with Row Level Security and backend authorization.

**Never put a Supabase service-role key, payment secret, private API key, or other server credential in the app bundle or commit it to Git.** Keep privileged operations in secured backend functions and restrict them by role.

## Payment status

Payment-provider credentials and settlement configuration are intentionally not considered live merely because checkout or payment-related code exists. See the backend operations guide for the current provider configuration and transaction safeguards before enabling real transactions.

## Project structure

```text
.
├── App.tsx                  # Main app shell and marketplace navigation
├── app.json                 # Expo app configuration
├── eas.json                 # EAS build profiles
├── assets/                  # App branding and image assets
├── src/
│   ├── components/          # Reusable UI components
│   ├── data/                # App data and supporting definitions
│   ├── lib/                 # Supabase client and shared utilities
│   └── screens/             # Account, auth, seller, checkout, admin, etc.
├── supabase/                # Backend operations documentation/functions
└── .github/workflows/       # APK and dependency workflows
```

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm install` | Install JavaScript dependencies |
| `npm run typecheck` | Run TypeScript checks |
| `npx expo start` | Start the Expo development server |
| `npm run android` | Prebuild/run the Android app locally |

## Contributing

1. Create a focused branch for your change.
2. Keep the native React Native implementation; do not replace it with a WebView.
3. Preserve existing authentication, seller, order, and admin permission checks.
4. Run `npm run typecheck` before submitting changes.
5. Never commit credentials, signing files, generated build output, or user data.

## Project

- Repository: [V1CT330/Malawi-Market-](https://github.com/V1CT330/Malawi-Market-)
- Android application ID: `mw.wealthgrid.malawimarket`
- Expo slug: `malawi-market`
