# Galaxy Class monorepo

Studio site and games for [galaxyclass.app](https://galaxyclass.app).

## Packages

| Package | Path | Description |
|---------|------|-------------|
| `@galaxyclass/accounts` | `packages/accounts` | Player profile shared by the site, games, and AWS: gamer tag rules, the avatar library, the account hint, and the profile Lambdas |
| `@galaxyclass/www` | `packages/www` | Next.js static studio site (Cognito auth, account page, avatar images at `/avatars`) |
| `@galaxyclass/riffle` | `packages/riffle` | Riffle Poker play app (WebSocket + static SPA) |
| `@galaxyclass/scribble` | `packages/scribble` | Scribble, the members-only word game at `/scribble` (WebSocket + static SPA) |
| `@galaxyclass/warships` | `packages/warships` | Warships, the members-only two-player naval game at `/warships` (WebSocket + static SPA, hosted in the Scribble runtime stack) |
| `@galaxyclass/infra` | `packages/infra` | AWS CDK — auth, site, and match runtime stacks |

## Player profiles

Galaxy Class owns every player's public profile: a **gamer tag** and an **avatar**.

- Avatar images live in `packages/www/public/avatars/<id>.webp` (ids 1–116) and are served from `galaxyclass.app/avatars`. Games reference avatars by id; they do not ship copies.
- Profiles are stored in the DynamoDB table `galaxyclass-profiles-prod` (auth stack). A `TAG#<lowercase tag>` item is the uniqueness lock, written in the same transaction as the `USER#<sub>` profile, so two players can never hold the same tag in any letter case.
- Sign-up sends the gamer tag as Cognito client metadata. A PreSignUp trigger validates and reserves it (72 hours); PostConfirmation claims it for the new account.
- The site reads and edits the profile through the HTTP API behind CloudFront `/api/*` (Cognito ID token required, except the public availability check).
- After loading the profile, the site writes the display-only hint `galaxyclass.account` (`{ signedIn, gamerTag, avatarId }`, never email or tokens) to localStorage. Riffle, on the same origin under `/riffle`, reads it to sit players under their gamer tag and avatar. Anonymous players get a random Galaxy Class avatar from the runtime.

Gamer tags: 3–20 characters, letters, numbers, `_` or `-`, starting and ending with a letter or number, no doubled `_`/`-`, and not a reserved word (for example `admin`, `riffle`, `guest`).

## Develop

```bash
npm ci
npm run dev --workspace=@galaxyclass/www   # studio site
npm run dev --workspace=@galaxyclass/riffle # local Hono server
npm run dev --workspace=@galaxyclass/warships # http://localhost:5182/warships with dev sign-in
```

The studio site's room links (`/riffle`, `/scribble`, `/warships`) are same-origin paths that CloudFront serves from each game's origin, so they 404 under `next dev`. Play a game on its own dev server. For Warships, sign in as two different dev members in two tabs (dev tokens are per tab).

## Test

```bash
npm test
```

## Deploy

Production deploy is manual via GitHub Actions **Deploy Galaxy Class** (`workflow_dispatch`) on the `production` environment. It deploys, in order:

1. `GalaxyClassAuth-prod`
2. Build `www` and `riffle` client artifacts
3. `MatchRuntimeStack`
4. `GalaxyClassSite-prod`

Requires `AWS_DEPLOY_ROLE_ARN` (and optional `AWS_REGION`, default `us-east-1`) on the repo `production` environment.
