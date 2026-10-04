# Design System (ported from web)

> Source: `financial-consultant-web/app/globals.css` and `components/*`. The iOS app keeps the same
> visual identity so a user moving between web and mobile feels at home.

## Brand

- Product name: **provisional — "Financial Consultant"** until a real name is chosen. The web's
  in-app wordmark currently reads "grana". Keep the name in one constant so the rename is a
  one-line change.
- Final logo and App Store assets: pending (out of scope until naming is decided).

## Colour tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| canvas | `#E9B48F` | `#241C16` | App background, splash |
| panel | `#FFFCF8` | `#2C231C` | Main surface |
| sidebar | `#F6ECE0` | `#271F18` | Secondary surface / menus |
| card | `#FBF4EC` | `#342A21` | Cards |
| ink | `#33281F` | `#F3E9DF` | Primary text |
| ink-soft | `#6E6156` | `#C3B4A5` | Secondary text |
| ink-faint | `#9C8E80` | `#8E7F70` | Tertiary text |
| hair | `#EADFD1` | `#3D3128` | Dividers |
| accent (coral) | `#E1552F` | `#F0714E` | Primary actions, hero card |
| accent-hover | `#C94420` | `#F5866B` | Pressed state |
| amber | `#E39A2B` | `#EBA744` | "A pagar" |
| ok / ok-bg | `#3E7A5E` / `#E1EEE6` | `#8FCDAF` / `#253A31` | Paid, income |
| warn / warn-bg | `#96601A` / `#F8E7C9` | `#E7B25E` / `#3E301A` | Due soon |
| danger / danger-bg | `#B23A1F` / `#F8DED4` | `#EE8064` / `#43261D` | Overdue, destructive |
| cat-moradia / bg | `#7C6FC4` / `#E9E4F6` | `#B3A6EE` / `#322A4A` | Category / group colour |
| cat-contas / bg | `#3D82B0` / `#DEECF4` | `#77B6DE` / `#1F3547` | Category / group colour |
| cat-lazer / bg | `#C0567F` / `#F6E0E8` | `#E68BB0` / `#402331` | Category / group colour |
| cat-transporte / bg | `#2F927A` / `#DBEFE9` | `#74C9AE` / `#1E3A32` | Category / group colour |
| grp-coral / bg | `#C0567F` / `#F6E0E8` | `#E68BB0` / `#402331` | Group colour |

Theme: Light / Dark / System, default **System**, user choice persisted locally.

## Typography

- **Bitter** (slab serif, 400/600/700) for display text and money figures — bundle the font.
- System font (SF Pro) for everything else.
- Tabular figures for all numbers.

## Shape & elevation

- Radii: panel 30, cards 18, buttons 12–13.
- Panel shadow: warm brown, `0 40 90 -30 rgba(120,62,28,.55)` + `0 8 24 -12 rgba(120,62,28,.35)`.

## Category icon & colour inference

Keyword-based (case-insensitive) — port as a pure function:

| Keywords | Colour | Icon |
|---|---|---|
| moradia, aluguel | moradia (purple) | home |
| conta, internet, energia, água | contas (blue) | wifi / bolt |
| lazer, academia, streaming | lazer (pink) | dumbbell |
| transporte, carro, uber | transporte (teal) | car |
| anything else | accent | tag |

Default categories: Moradia, Contas, Alimentação, Transporte, Saúde, Lazer, Educação, Outros.

## Motion (respect Reduce Motion)

- KPI cards: staggered fade-up (~80 ms apart, 0.55 s).
- Money values count up (600 ms, ease-out).
- Flip cards: 3D rotate 0.5 s.
- Press: slight scale-down; sheets slide up, drag to dismiss.
- Charts draw in (area chart ~1.4 s).
- Easing for slides: cubic-bezier(0.16, 1, 0.3, 1).

## Known UX note to fix on mobile

- The "Marcar como pago" button in the expanded bill row has no outline and does not read as
  tappable (from the developer's notes). Give it a clear button affordance on iOS.
