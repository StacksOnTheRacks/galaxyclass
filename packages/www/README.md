# Galaxy Class Gaming

Public marketing site for **Galaxy Class Gaming** — a design-focused gaming studio.

**First featured game:** [Riffle Poker](https://github.com/StacksOnTheRacks/riffle-poker) — no-limit Texas Hold'em with play chips. The home's featured marquee and game library **Play Riffle Poker** buttons link to same-origin `/riffle`, which CloudFront serves from Riffle Poker's own origin (this app never routes or embeds it). Player card, account, auth, and footer surfaces do not link to Riffle Poker directly; players reach it from the game library or the URL.

User-facing copy always calls the game **Riffle Poker** (never bare "Riffle" or lowercase "riffle"). Code identifiers, the `/riffle` path, and `riffle-*` tokens keep their short names.

## Develop

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Check

```bash
npm test       # Vitest + React Testing Library
npm run lint
npm run build
```

## Build

Static export for S3 + CloudFront (CDK-ready):

```bash
npm run build
```

Output lands in `out/`.

## Design system

"Arcade floor, launcher navigation": a late-night game room you browse like a game library.

- **Tokens** live once as CSS custom properties in `src/app/globals.css` (color, spacing, radius, elevation, motion) and are mapped into Tailwind in `tailwind.config.ts` (`bg-panel`, `text-ink-muted`, `rounded-screen`, `shadow-cabinet`, …). Use the tokens; don't add raw hex values.
- **Type**: Bungee (display/marquee), Chakra Petch (UI and body), Silkscreen (small HUD labels only), via `next/font` so the static export self-hosts them.
- **Materials**: `.arcade-floor` (carpet backdrop), `.cabinet` + `.t-molding` (panels with a lit edge; set `--molding` per game), `.crt` (screen glass with scanlines), `.marquee-strip` + `Bulbs`.
- **Primitives** in `src/components/primitives.tsx` (`buttonClass`, `ButtonLink`, `TextLink`, `HudLabel`, `StatusTag`) and `src/components/auth/ui.tsx` (`AuthScreen`, `TextField`, `FormAlert`, `SubmitButton`). Pages compose these inside `SiteShell`.
- **Brands**: Riffle Poker keeps its own wordmark and felt green (`riffle-*` tokens) inside its cabinet; studio chrome stays pink/cyan/amber.
- **Motion**: marquee bulb chase, CRT power-on, card deal, and "press play" blink. Every animated node carries `data-motion` and renders static under `prefers-reduced-motion`.

## Stack

- Next.js 15 (App Router, static export)
- Tailwind CSS
- Framer Motion (respects `prefers-reduced-motion`)

## Deploy

AWS CDK deployment will be added later. The static `out/` directory is the deploy artifact.
