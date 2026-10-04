# Financial Consultant — iOS App

iOS-first Expo / React Native client for the Financial Consultant bills-to-pay product. It mirrors
the web PWA's capabilities, signs in with Google only, and consumes the existing backend through
the web BFF. See `docs/` for the product docs and `CLAUDE.md` for development conventions.

## Prerequisites

- macOS with **Xcode 26.4+** (iOS Simulator runtime installed)
- [Bun](https://bun.sh)
- A `.env` created from `.env.example` (Google iOS client ID and URL scheme)
- The web BFF running on `localhost:3000` (`financial-consultant-web`, `bun run dev`, with
  `MOBILE_OAUTH_CLIENT_IDS` set)

## Run

```bash
bun install && bunx expo run:ios
```

Google Sign-In needs a development build, so Expo Go is not supported.
