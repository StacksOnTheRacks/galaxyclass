# Galaxy Class

The front door to **Galaxy Class**: a studio site for larger original games, plus **The Arcade** for the smaller browser games, and the shared Galaxy Class account (sign up, sign in, gamer tag, avatar).

The home page leads with Aphelion Run and links out to [aphelionrun.com](https://aphelionrun.com). It does not embed that game. The Arcade at `/arcade` lists the rooms — Riffle Poker at `/riffle`, Scribble at `/scribble`, Warships at `/warships`, Whodunit? at `/whodunit`. **Enter room** links to the game's same-origin path, which CloudFront serves from that game's own origin (this app never routes or embeds a game). Each room owns its own table list, seats, and presence; this site shows none of that. Account, auth, about, and footer surfaces do not link into a game directly.

User-facing copy always calls the game **Riffle Poker** (never bare "Riffle" or lowercase "riffle"). Code identifiers, the `/riffle` path, and `riffle-*` tokens keep their short names. The naval game is always **Warships**; never use the trademarked board-game name for it. The mystery game is always **Whodunit?** (with the question mark), set at Starfall Manor with its own original suspects, weapons, and rooms; never use the trademarked board-game name or any of its character names for it.

Scribble, Warships, and Whodunit? are members-only, so a game path is on the `safe-next` allowlist (`GAME_PATHS` in `src/lib/auth/safe-next.ts`): after sign-in the browser loads it in full instead of client-routing into a Next 404. Add every new game root there.

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

Two themes, one shell. The studio is the default. The Arcade opts into the neon lobby with `theme="arcade"` on `SiteShell`, which adds the `.arcade` class.

- **Shell**: `SiteShell` = sticky top bar (`Nav`, landmark "Main") + phone-only bottom tab bar (`TabBar`, landmark "App": Arcade / About / Account) + slim footer. From `md` up the top bar carries the sections and the tab bar hides. Content clears the tab bar and the iOS safe area. The logo returns home. Home leaves every tab unselected.
- **Screens**: `/` studio home (Aphelion Run, then a doorway to The Arcade), `/arcade` (room tiles, guest prompt, house rules), `/about` (studio, Aphelion Run, The Arcade), auth screens, `/account`.
- **Tokens** live once as CSS custom properties in `src/app/globals.css` (color, spacing, radius, elevation, motion) and are mapped into Tailwind in `tailwind.config.ts` (`bg-panel`, `text-ink-muted`, `rounded-screen`, `shadow-panel`, `h-tabbar`, …). `:root` is the studio. `.arcade` restores the neon channels, press shadow, and arcade faces. Use the tokens; don't add raw hex values. Shared controls use `accent` (filled button) and `mark` (links, focus, current section) so each theme colors them.
- **Type**: Outfit for the studio, via `next/font`. The Arcade switches `--font-display`, `--font-body`, and `--font-hud` to Bungee, Chakra Petch, and Silkscreen. The studio wordmark is the words only; the Arcade shows the GC monogram again.
- **Materials**: `.app-backdrop` is a faint brass wash on the studio and a neon wash plus doodle texture in `.arcade`. `.panel` (raised surface), `.room-card` (room tile; set `--room` to a color channel such as `var(--c-riffle)` for its tint and glow), `.crt` (screen glass with scanlines, arcade art only), `.felt`.
- **Primitives** in `src/components/primitives.tsx` (`buttonClass`, `ButtonLink`, `TextLink`, `HudLabel`, `Chip`) and `src/components/auth/ui.tsx` (`AuthScreen`, `TextField`, `FormAlert`, `SubmitButton`). Studio buttons are flat brass. Arcade buttons keep the pink press.
- **Brands**: each room keeps its own wordmark and colors (`riffle-*`, `scribble-*`, `warships-*`, `whodunit-*` tokens) inside its tile. Studio chrome is ivory on near-black with a brass accent. Arcade chrome is pink, cyan, and amber.
- **Footer**: “Social chips only” renders only in The Arcade.
- **Motion**: hover lift and glow on room tiles (pointer devices, no-preference motion), plus the Warships tile's sonar sweep and ping and the Whodunit? tile's lightning flash (`motion-safe:` only). Everything is static under `prefers-reduced-motion`.

## Stack

- Next.js 15 (App Router, static export)
- Tailwind CSS

## Deploy

AWS CDK deployment will be added later. The static `out/` directory is the deploy artifact.
