# Malawi Market Android

Native Android app for Malawi Market, built with Expo and React Native.

## Development

- `npm install`
- `npm run typecheck`
- `npx expo start`

## APK

GitHub Actions builds a debug APK on pushes to `Filorux-Blockchain` or via **Actions → Build Malawi Market APK → Run workflow**. The APK is uploaded as the `malawi-market-debug-apk` artifact.

The first frontend milestone includes the storefront, product browsing, local cart and wishlist interactions. Authentication, live catalogue data, and checkout/payment are not yet integrated.

Android SDK build setup uses the hosted runner's SDK manager directly.

Build workflow uses the hosted Android SDK command-line tools path.
