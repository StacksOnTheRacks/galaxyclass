# Galaxy Class Gaming

The front door to **Galaxy Class Gaming**: an app-style lobby of game rooms, plus the shared Galaxy Class account (sign up, sign in, gamer tag, avatar).

Each game is a **room** — Riffle Poker at `/riffle`, Scribble at `/scribble`. The home screen lists the rooms; **Enter room** links to the game's same-origin path, which CloudFront serves from that game's own origin (this app never routes or embeds a game). Each room owns its own table list, seats, and presence; this site shows none of that. Account, auth, about, and footer surfaces do not link into a game directly.

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

"Game rooms app": a neon, late-night lobby you tap into, built mobile-first.

- **Shell**: `SiteShell` = sticky top bar (`Nav`, landmark "Main") + phone-only bottom tab bar (`TabBar`, landmark "App": Rooms / About / Account) + slim footer. From `md` up the top bar carries the sections and the tab bar hides. Content clears the tab bar and the iOS safe area.
- **Screens**: `/` Rooms (room tiles + guest/account prompt), `/about` (house rules + studio), auth screens, `/account`.
- **Tokens** live once as CSS custom properties in `src/app/globals.css` (color, spacing, radius, elevation, motion) and are mapped into Tailwind in `tailwind.config.ts` (`bg-panel`, `text-ink-muted`, `rounded-screen`, `shadow-panel`, `h-tabbar`, …). Use the tokens; don't add raw hex values.
- **Type**: Bungee (display), Chakra Petch (UI and body), Silkscreen (small HUD labels only), via `next/font` so the static export self-hosts them.
- **Materials**: `.app-backdrop` (neon wash + doodle texture), `.panel` (raised surface), `.room-card` (room tile; set `--room` to a color channel such as `var(--c-riffle)` for its tint and glow), `.crt` (screen glass with scanlines), `.felt`.
- **Primitives** in `src/components/primitives.tsx` (`buttonClass`, `ButtonLink`, `TextLink`, `HudLabel`, `Chip`) and `src/components/auth/ui.tsx` (`AuthScreen`, `TextField`, `FormAlert`, `SubmitButton`).
- **Brands**: each room keeps its own wordmark and colors (`riffle-*`, `scribble-*` tokens) inside its tile; studio chrome stays pink/cyan/amber.
- **Motion**: hover lift and glow on room tiles only (pointer devices, no-preference motion). Everything is static under `prefers-reduced-motion`.

## Stack

- Next.js 15 (App Router, static export)
- Tailwind CSS

## Deploy

AWS CDK deployment will be added later. The static `out/` directory is the deploy artifact.
