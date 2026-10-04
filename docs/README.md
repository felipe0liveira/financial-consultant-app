# Financial Consultant — iOS App Docs

Working name: **Financial Consultant** (provisional until the product is named).

A mobile client for the Financial Consultant bills-to-pay product. It targets **iOS first**, offers
the same capabilities as the web PWA, signs in with **Google only**, and consumes the existing
backend — it never reimplements business logic.

| Doc | What it covers |
|---|---|
| [01-web-feature-inventory.md](01-web-feature-inventory.md) | Every web feature, screen, and behaviour — the parity baseline |
| [02-api-and-auth.md](02-api-and-auth.md) | The `/api/v1` surface, conventions, entities, and how auth works today |
| [03-design-system.md](03-design-system.md) | Colour tokens, typography, motion, category styling |
| [04-phased-plan.md](04-phased-plan.md) | Open decisions and the phased roadmap |

Sibling repos (same workspace): `../financial-consultant-api` (FastAPI backend) and
`../financial-consultant-web` (Next.js PWA + BFF).
