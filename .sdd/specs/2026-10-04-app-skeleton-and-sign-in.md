# iOS App Skeleton & Google Sign-In (Phase 1)

## Goal & context

Financial Consultant (provisional name) is a bills-to-pay product with a web PWA and a FastAPI
backend. This repo holds its **native iOS app**, which must reach full parity with the web
(`docs/01-web-feature-inventory.md`) over several phases (`docs/04-phased-plan.md`).

This spec covers **Phase 1**: the app's foundation. A person can install a development or
TestFlight build, sign in with Google, see their own profile, move between the app's sections
(still empty), switch theme, and sign out. Because the same Google account resolves to the same
backend user, a person who already uses the web is recognised as the **same user** on iOS.

It depends on the web BFF's mobile auth gateway
(`financial-consultant-web/.sdd/specs/2026-10-04-mobile-auth-gateway.md`): the app exchanges a
Google ID token for a BFF-issued mobile session token (7-day lifetime) and calls the BFF's
existing `/api/v1/*` routes with it as a bearer credential. The app never talks to the `-api`
directly.

All user-facing copy is **pt-BR**; Portuguese strings below are UI copy, quoted verbatim.

## Scope

### In scope

- The app project, targeting **iOS 17+**, bundle identifier
  **`com.felipeoliveira.financialconsultant`**.
- Two environments: **development** (talks to the BFF running locally on the developer's Mac) and
  **production** (talks to the production BFF on Cloud Run, used by TestFlight builds).
- The **login screen as the signed-out home**.
- Native Google sign-in, exchange for a mobile session token, secure on-device storage of the
  session, silent renewal, and sign-out.
- A first authenticated call to `/api/v1/me` to confirm the backend identity.
- The navigation shell: bottom tab bar **Painel · Contas · Grupos · Recorrentes · Mais**, with
  **Mais** listing **Categorias**, **Relatórios**, and **Ajustes**.
- Placeholder content for every section except Ajustes.
- **Ajustes** with: Perfil (avatar, name, email, Sair) and Aparência (Claro / Escuro / Sistema).
- The visual foundation from `docs/03-design-system.md`: colour tokens (light/dark), the Bitter
  display font, and a single place that holds the provisional product name.

### Out of scope

- Any data screen content (Painel, Contas, Grupos, Recorrentes, Categorias, Relatórios) —
  Phases 2–4.
- Persisted data cache and offline browsing — Phase 2.
- Notifications (in-app or push) and the Ajustes notification toggle — Phase 5.
- Spreadsheet import — Phase 6.
- App Store submission, final name, logo, and store assets.
- Android, iPad-specific layouts.
- Server-side session revocation.
- A staging environment or an in-app environment switcher.

## Requirements

### Launch & routing

- **R1 — Signed-out launch.** Given no stored session, when the app launches, then the login
  screen is shown.
- **R2 — Signed-in launch.** Given a stored, valid session, when the app launches, then the user
  lands on **Painel** without seeing the login screen.
- **R3 — No landing page.** There is no marketing or onboarding screen; the login screen is the
  only signed-out screen.

### Login screen

- **R4 — Content.** The login screen shows the brand mark, the provisional product name
  "Financial Consultant", the tagline "Suas contas do mês, sempre sob controle.", and a single
  **"Entrar com Google"** button, on the `canvas` background of the active theme.
- **R5 — Sign-in success.** Given the user completes Google sign-in, when the app exchanges the
  Google ID token with the BFF and receives a session, then the session is stored securely on the
  device and the user lands on **Painel**.
- **R6 — Sign-in cancelled.** Given the user dismisses the Google sign-in, then they stay on the
  login screen with no error message.
- **R7 — Sign-in failure.** Given Google sign-in or the BFF exchange fails, then the login screen
  shows a pt-BR error message and the button is usable again. A network failure shows a message
  distinct from a rejected sign-in.
- **R8 — No dead taps.** While sign-in is in progress, the button shows progress and cannot be
  tapped again.

### Session

- **R9 — Secure storage.** The mobile session token is stored only in the device's secure system
  storage, never in plain app storage or logs.
- **R10 — Renewal at launch.** Given a stored session that is expired or expires within the next
  **24 hours**, when the app launches or returns to the foreground, then it silently obtains a
  fresh Google ID token and exchanges it for a new session before loading any authenticated
  screen.
- **R11 — Renewal on 401.** Given an authenticated request returns unauthorized, then the app
  silently renews **once** and retries the original request once; if the retry also fails or the
  renewal fails, the user is signed out locally and sent to the login screen with
  "Sua sessão expirou. Entre novamente para continuar."
- **R12 — Offline tolerance.** Given the device is offline when a renewal is due, then the user
  is **not** signed out; the app keeps the current session and retries the renewal when the
  connection returns.
- **R13 — Identity check.** After sign-in, the app calls `/api/v1/me` and keeps the returned
  `user_id` as the current user identity for the session.
- **R14 — Same user as web.** Given a Google account that already uses the web app, when it signs
  in on iOS, then `/api/v1/me` returns the same `user_id` the web receives.

### Navigation shell

- **R15 — Tab bar.** Signed-in screens show a bottom tab bar with **Painel, Contas, Grupos,
  Recorrentes, Mais**, in that order; tapping a tab switches section and preserves each tab's own
  navigation position.
- **R16 — Mais.** The Mais tab lists **Categorias**, **Relatórios**, and **Ajustes**; tapping one
  opens that section.
- **R17 — Placeholders.** Every section except Ajustes shows its title and a short pt-BR
  "coming soon" message in the app's visual style.

### Ajustes

- **R18 — Perfil.** Shows the Google avatar, name, and email from the sign-in response. If the
  avatar is missing or fails to load, the user's initials are shown instead. If the name is
  missing, "Usuário" is shown.
- **R19 — Sair.** Tapping **Sair** asks "Sair da conta?" — "Você precisará entrar novamente para
  acessar suas contas." Confirming removes the stored session and all locally held user data,
  signs out of Google on the device, and returns to the login screen. Cancelling does nothing.
- **R20 — Aparência.** A three-way control **Claro / Escuro / Sistema**, default **Sistema**.
  The choice applies immediately to every screen, including the login screen, and persists
  across launches. With **Sistema**, the app follows the device's appearance live.

### Visual foundation

- **R21 — Tokens.** Colours, radii, and typography follow `docs/03-design-system.md`, in both
  light and dark.
- **R22 — Name in one place.** The provisional product name is defined once, so renaming the
  product is a single change.
- **R23 — Accessibility basics.** Text supports Dynamic Type, interactive elements have
  accessibility labels, and motion respects Reduce Motion.

### Environments & builds

- **R24 — Development.** A development build runs on the iOS Simulator on the developer's Mac and
  talks to the BFF running locally there.
- **R25 — Production.** A release build talks to the production BFF and can be uploaded to
  TestFlight.
- **R26 — No secrets in the binary.** The app contains no server secrets; the only Google
  configuration it holds is the public iOS OAuth client identifier.

## Constraints

- Built with **Expo / React Native + TypeScript** (decision D2, `docs/04-phased-plan.md`).
- iOS 17 is the minimum supported version.
- Authentication goes exclusively through the web BFF's mobile auth gateway; the app never calls
  the `-api` directly and never holds `WEB_API_SECRET`.
- The iOS OAuth client is created in GCP project `financial-consultant-501119`, with bundle
  identifier `com.felipeoliveira.financialconsultant`.
- Profile data (name, email, avatar) comes only from the sign-in response — it is never sent to
  or stored by the backend.
- Google sign-in requires a development build of the app (it cannot run inside a generic
  preview client).

## Edge cases & error handling

- **BFF gateway not deployed / not configured:** the exchange is rejected; the login screen shows
  the rejected-sign-in message (R7).
- **Google signing keys unreachable on the BFF** (service-unavailable response): shown as a
  temporary failure, user stays on the login screen, retry allowed; during renewal it is treated
  like offline (R12) — no sign-out.
- **User revoked the app in their Google account:** the next renewal fails → sign-out with the
  session-expired message (R11).
- **Different Google account signs in after a sign-out:** no profile or identity from the
  previous account is visible at any point.
- **App killed during sign-in:** on next launch the user is on the login screen with no partial
  session stored.
- **Theme changes while on the login screen:** applied immediately.

## Success criteria

- On the iOS Simulator (development) and on a TestFlight build (production), a person signs in
  with Google, sees Painel, their profile in Ajustes, and can sign out.
- For an account that already uses the web, the `user_id` on iOS matches the web's.
- A session older than 7 days renews without showing the login screen, as long as the device is
  online and Google access was not revoked.
- Every requirement R1–R26 is covered by an automated test or a documented manual check.
- No server secret is present in the app bundle.

## Open questions

- **Splash screen and app icon for Phase 1:** assume the existing web brand mark on the `canvas`
  colour (light/dark), since final branding is pending.
- **Which copy for the "coming soon" placeholders:** assume a short neutral line such as
  "Em breve por aqui." unless you prefer something else.
