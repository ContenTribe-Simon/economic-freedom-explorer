# Frihedsmodel Design System

**Frihedsmodel** (*frihed* = freedom) is a Danish tool that answers one question for
ordinary people: *when can I afford to stop working?* It turns complex pension and savings
projections into a calm, honest answer first, then lets people explore the details. The
public interface is in Danish.

The product touches an anxious topic (money, retirement, "will my money last?"), so the
whole system is built to feel **calm, trustworthy, human, Nordic daylight** — reassuring
and clear, never alarming or hype-y. Light mode only. This is deliberately *not* a generic
SaaS dashboard and *not* a dark "ops" dashboard.

The signature is the **horizon line**: a calm net-worth-over-a-lifetime curve from the
user's current age to life expectancy, with the earliest age they can stop working marked
like a small sunrise (the one warm accent). Everything else stays quiet and spacious.

---

## Sources

This system was built from materials supplied by the team. You may not have access, but
they are recorded here so you can go deeper if you do.

- **Result-screen mockup** (the visual anchor): `frihedsmodel-resultat-mockup_1.html`
  — embodies the palette, Spectral + Public Sans, the horizon signature, and the copy
  tone. Mirrored into the brand cards and the public UI kit.
- **Product repository:** `ContenTribe-Simon/economic-freedom-explorer`
  (https://github.com/ContenTribe-Simon/economic-freedom-explorer). A Vite + React +
  TypeScript app (shadcn/ui + Tailwind). Source of the Danish UI vocabulary, the
  public-MVP journey, and the simple-input set. **Explore it further** to build
  higher-fidelity recreations of the advanced (expert) surfaces.
  - Useful reads: `README.md`, `docs/public-mvp-scope-v1.md` (the de-facto public PRD),
    `src/lib/finance/MODEL.md`, `src/components/AppShell.tsx` (nav vocabulary),
    `src/pages/*` (the advanced expert app).
  > Note: the repo's own `src/index.css` ships an *earlier* visual direction
  > (Fraunces + Inter + terracotta on cream). That is **superseded** by this system —
  > Spectral + Public Sans on Nordic daylight. Do not lift colours or fonts from the repo;
  > use the tokens here.

---

## Content fundamentals

The voice is **plain, human Danish**. It is the most important part of the brand.

- **Tone:** honest and reassuring, never salesy or alarmist. The product calms an anxious
  question; the words do the calming.
- **Person:** address the user as *du*. Speak to one person.
- **Casing:** sentence case everywhere, including headings and buttons ("Justér dine tal",
  not "Justér Dine Tal").
- **Sentences:** short. Active voice. One idea per sentence.
- **Numbers:** use **"ca."** for figures to avoid false precision ("ca. 3,5 mio. kr", never
  "3.487.214 kr"). Danish grouping and decimals (3,5 — comma decimal). Currency is "kr".
- **Framing:** always a calculation, never advice. The standing line is
  *"Et regneeksempel, ikke økonomisk rådgivning."* State once, clearly, that amounts are in
  **nutidskroner** (today's money).
- **Punctuation:** **no em dashes.** Use full stops or commas.
- **Avoid:** hype ("lås din frihed op"), alarmism ("dine penge løber tør, handl nu"),
  filler, and classic AI phrasings. No emoji.

Example, the headline answer:
> **Du kan tidligst stoppe med at arbejde omkring _alder 57_.**
> Med dine nuværende tal rækker pengene hele vejen til 90. Du kan altså stoppe et par år
> før din egen plan på 60.

Status words are gentle: *På sporet* · *Lidt stramt* · *Pas på* (never "FEJL", "KRITISK").

---

## Visual foundations

**Palette (light).** Background `#F4F6F2` (paper), text `#17302B` (ink). Primary is
`#1C4A50` (*fjord* — deep teal-blue: trust and horizon). One warm accent, `#CC8A43`
(*dawn* — honey/sunrise), used **sparingly for the single most important moment only**
(the frihedspunkt). Status tones are muted, never neon: on track `#5E8A6F` (sage), tight
`#CC8A43` (amber/dawn), risk `#B5503C` (clay). Borders are soft, around `#DCE4DF`. See
`tokens/colors.css` for the full base + semantic set.

**Typography.** Display = **Spectral** (a clean, calm serif) used with restraint for the
headline answer, section heads, and result numbers — the big answer sits *light* (300).
Body and UI = **Public Sans**. Result figures sit in the serif for warmth and use
**tabular figures** for alignment. No Inter, Roboto, or Poppins. See `tokens/typography.css`.

**Spacing & layout.** Generous whitespace; a 4px base step. Answer-first: lead with the
plain-language answer, not a wall of inputs or a number in a gradient box. Reading column
~720px inside a ~920–980px frame. See `tokens/spacing.css`.

**Backgrounds.** Flat paper. **No** heavy gradients, no glassmorphism, no photographic
hero, no repeating texture. The only gradients are functional and faint: the soft fjord
area-fill under the horizon curve, and the small radial *glow* behind the sunrise dot.

**Corners & cards.** Gentle radii, **not** pill-everything: controls 11px, cards 16px,
framed panels (the chart) 18px. Pills (999px) are reserved for status badges and chips.
Cards are a near-white warm surface (`#FBFCFA`) with a 1px soft border and a very quiet
shadow — mostly the border carries the edge.

**Shadows / elevation.** Soft daylight, tinted with ink (not pure black). Resting surfaces
use a hairline + `--shadow-xs`; raised cards use `--shadow-card`; dialogs/menus use
`--shadow-pop`. Never heavy drop shadows. See `tokens/effects.css`.

**Borders.** 1px `#DCE4DF` default; 1.5px for inputs and emphasis hairlines. Dashed
hairline (faint) only for the quiet "your plan" tick on the chart.

**Motion.** Restrained and gentle. A calm page-load *rise* (fade + small translateY,
~0.9s, eased) and a one-time *draw* of the horizon line. No bounces, no infinite decorative
loops. Everything is gated behind `@media (prefers-reduced-motion: no-preference)`.

**Hover / press.** Primary buttons darken (`fjord → fjord-deep`); secondary/ghost get a
faint fjord wash. Press nudges down 1px (no shrink-scale on buttons; the slider thumb
scales slightly on grab). Focus shows a visible dawn-soft ring (`--ring-color`, 3px).

**Imagery.** Minimal. The brand's "image" is the horizon chart itself. Colour vibe is cool
daylight (fjord/sage) with one warm sunrise note. No stock photography in the system.

**Transparency / blur.** Used only for the chart fills and the sunrise glow. No backdrop
blur, no frosted panels.

---

## Iconography

- **System:** [Lucide](https://lucide.dev) — the same set the product uses (`lucide-react`
  in the repo). Clean, rounded, **2px stroke**, no fill. It pairs well with Public Sans.
- **How to use:** prefer the design system's own **`Icon`** component
  (`components/core/Icon.jsx`) — `<Icon name="info" size={18} />`. It carries the curated
  brand set (wayfinding, the explanation layer, controls, money, account, plus the
  `sunrise` mark glyph); `ICON_NAMES` lists every glyph and the Icons card in the Design
  System tab shows them all. For one-off HTML artifacts you can also load Lucide from CDN
  (`https://unpkg.com/lucide@latest`) or inline a single SVG.
- **Info tooltips:** use the **`Tooltip`** component (`components/feedback/Tooltip.jsx`) for
  the explanation layer. With no children it renders the default **info-dot** (the info
  icon) to sit beside a label; wrap your own trigger for a text affordance. Shows on hover
  and keyboard focus, toggles on tap, closes on Escape.
- **Colour:** icons take the surrounding text colour (`currentColor`); use ink for neutral,
  fjord for interactive, status tones inside callouts/badges.
- **Emoji / unicode:** never. No emoji anywhere. No unicode glyphs as icons.
- **The mark:** the brand mark is a small **sunrise dot** (a honey radial circle with a
  soft dawn halo) — see `assets/mark.svg`. It echoes the frihedspunkt on the chart. The
  wordmark is "Frihedsmodel" set in Spectral medium. The horizon motif lives at
  `assets/horizon.svg`.

---

## Index / manifest

**Root**
- `styles.css` — the single entry point consumers link. `@import`s only.
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `effects.css`, `fonts.css`.
- `assets/` — `mark.svg` (sunrise mark), `horizon.svg` (the signature motif).
- `readme.md` — this guide. `SKILL.md` — Agent-Skill wrapper.

**Components** (`window.FrihedsmodelDesignSystem_25764f`)
- `components/core/` — `Button`, `StatusBadge`, `Stat`, `Card`, `Icon` (brand icon set + `ICON_NAMES`)
- `components/forms/` — `Field`, `Lever`, `Segmented`
- `components/feedback/` — `Callout`, `Tooltip` (info-icon + explanation bubble)
- `components/dataviz/` — `HorizonChart` (the signature element)

**UI kits**
- `ui_kits/frihedsmodel-public/` — the answer-first public app (Welcome, Form, Result with
  live levers). `index.html` is the interactive entry.

**Foundation cards** (Design System tab) live in `guidelines/` — Colors, Type, Spacing,
and Brand specimen cards. Component and kit cards are tagged in their own directories.

**Fonts:** Spectral and Public Sans are **self-hosted** as `.woff2` in `assets/fonts/`
(latin subset, covers Danish æ ø å); the `@font-face` rules live in `tokens/fonts.css`.
These are the correct brand fonts, not substitutes, with no third-party requests. For the
Vite/React app, the equivalent is the `@fontsource/spectral` and `@fontsource/public-sans`
npm packages.
