# Galaxy Class monorepo

Studio site and games for [galaxyclass.app](https://galaxyclass.app).

## Packages

| Package | Path | Description |
|---------|------|-------------|
| `@galaxyclass/www` | `packages/www` | Next.js static studio site (Cognito auth) |
| `@galaxyclass/riffle` | `packages/riffle` | Riffle Poker play app (WebSocket + static SPA) |
| `@galaxyclass/infra` | `packages/infra` | AWS CDK — auth, site, and match runtime stacks |

## Develop

```bash
npm ci
npm run dev --workspace=@galaxyclass/www   # studio site
npm run dev --workspace=@galaxyclass/riffle # local Hono server
```

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
