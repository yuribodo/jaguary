# Bound frontend

Next.js App Router application with TypeScript, Tailwind CSS v4 and ESLint.

## Commands

```bash
pnpm dev:frontend
pnpm --filter @bound/frontend lint
pnpm --filter @bound/frontend typecheck
pnpm --filter @bound/frontend build
```

Copy `.env.example` to `.env.local` only when the backend URL differs from `http://localhost:3001`.

## Initial boundaries

- `src/app`: routes, layouts and route-level composition.
- `src/components`: reusable UI and client-side behavior.
- Browser code may call the public Bound API, but never receives payment or signing secrets.
