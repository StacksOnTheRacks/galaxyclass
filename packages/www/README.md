# Galaxy Class Gaming

Public marketing site for **Galaxy Class Gaming** — a design-focused gaming studio.

**First featured game:** [Riffle](https://github.com/StacksOnTheRacks/riffle-poker) — no-limit Texas Hold'em with play chips. The home's **Play Riffle** links to same-origin `/riffle`, which CloudFront serves from Riffle's own origin (this app never routes or embeds it).

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

## Stack

- Next.js 15 (App Router, static export)
- Tailwind CSS
- Framer Motion (respects `prefers-reduced-motion`)

## Deploy

AWS CDK deployment will be added later. The static `out/` directory is the deploy artifact.
