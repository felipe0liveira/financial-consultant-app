# Financial Consultant — iOS App

iOS-first Expo / React Native client for the Financial Consultant bills-to-pay product. It aims
for **feature parity with the web PWA**, signs in with **Google only**, and never reimplements
business logic. The product name is provisional and defined in one place: `src/config/brand.ts`.

This repo is part of the workspace at `../` (siblings: `financial-consultant-api`,
`financial-consultant-web`). Read `../CLAUDE.md` for the cross-repo picture.

> **Language:** code, comments, commits and docs are in **English**. Only user-facing UI copy is
> **pt-BR**.

## Stack

- Expo SDK 57, Expo Router (routes in `src/app/`), TypeScript, Bun.
- Minimum iOS: **17+** (decision D3, 2026-10-04). Building requires **Xcode 26.4+**.
- Google Sign-In via `@react-native-google-signin/google-signin` (needs a development build —
  Expo Go does not work).
- Tests: `jest-expo`.

## Architecture

- The app talks **only to the web BFF** (`financial-consultant-web`), through `src/api/client.ts`,
  using a mobile **bearer token**. It never calls `financial-consultant-api` or Firestore.
- **Auth flow:** Google Sign-In (iOS OAuth client) → Google ID token →
  `POST /api/auth/mobile` → `{ token, expiresAt, profile }` → stored in the Keychain
  (`expo-secure-store`) → bearer on every `/api/v1/*` request.
- **Renewal policy:**
  - At launch / foreground, silently renew if the session is expired or expires within **24 h**.
  - On a `401`, renew **once** and retry the original request once; if that fails, sign out
    locally and return to the login screen.
  - **Never sign out while offline** — network failures keep the session and renewal retries on
    reconnect / foreground.
- **Never embed secrets.** No `WEB_API_SECRET`, no client secrets. Only public identifiers (the
  Google iOS client ID and its URL scheme) come from `.env` at config time.
- Environments: `APP_ENV` (`development` default | `production`) is read by `app.config.ts`, which
  writes `extra.bffUrl` (`http://localhost:3000` in development, `PROD_BFF_URL` in production).
  Local development talks to the web BFF on **`localhost:3000`**.

## Layout

```
src/app/      Expo Router routes (login, tabs, Mais stack)
src/auth/     Google sign-in, session storage, renewal
src/api/      BFF client (bearer, 401 handling)
src/config/   env + brand (provisional name)
src/theme/    design tokens (light/dark/system)
src/ui/       shared components
docs/         product/design docs (feature inventory, API, design system, phased plan)
.sdd/         specs and plans (versioned)
```

## Commands

```bash
bun install
bunx expo run:ios                      # dev build on the iOS Simulator
bun run test                           # jest-expo
bun run typecheck                      # tsc --noEmit
bun run lint                           # expo lint
eas build -p ios --profile production  # TestFlight build (EAS)
eas submit -p ios                      # upload to App Store Connect
```

## Environment

Copy `.env.example` to `.env`. Variables are public identifiers only: `GOOGLE_IOS_CLIENT_ID`,
`GOOGLE_IOS_URL_SCHEME` (reversed client ID), optional `GOOGLE_SERVER_CLIENT_ID`, and
`PROD_BFF_URL` (production builds only). The web BFF must run with `MOBILE_OAUTH_CLIENT_IDS`
containing the iOS client ID.

## Workflow

Spec-driven, as in the workspace: `write-spec` → `write-plan` → `execute-plan`. Specs and plans
live in `.sdd/specs/` and `.sdd/plans/` and are the durable history (no GitHub issues).

- Commit the spec and plan to `main` before implementing.
- Single developer, commits **direct to `main`** — no feature branches or PRs (worktrees only to
  run multiple approved plans in parallel).
- Small, focused **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, ...).
- **Never run `git push`.** Claude commits; the developer pushes.

## Google ID token audience (verified 2026-10-04)

With only `iosClientId` configured, Google Sign-In returns a non-null ID token whose audience is
the **iOS client ID**, which the BFF allow-list (`MOBILE_OAUTH_CLIENT_IDS`) accepts. No
`webClientId` / server client is needed; `GOOGLE_SERVER_CLIENT_ID` stays empty.

## Native build notes

- Xcode 27 (iOS 27 SDK) requires the UIScene life cycle; on Expo SDK 57 it is enabled via
  `expo-build-properties` → `ios.enableSceneSupport` in `app.config.ts`. Drop it on SDK 58+.
- `ios/` is generated (`bunx expo prebuild -p ios`) and git-ignored; run `pod install` inside it
  (CocoaPods needs a UTF-8 locale: `export LANG=en_US.UTF-8`).
