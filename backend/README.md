# Bound backend

Fastify v5 API using TypeScript, ESM, Zod environment validation and Node's test runner through `tsx`.

## Commands

```bash
pnpm dev:backend
pnpm --filter @bound/backend lint
pnpm --filter @bound/backend typecheck
pnpm --filter @bound/backend test
pnpm --filter @bound/backend build
```

The API listens on `http://localhost:3001` by default. Copy `.env.example` to `.env` to override local configuration.

## Initial boundaries

- `src/routes`: HTTP transport only.
- `src/config`: validated environment and runtime configuration.
- Future domain modules should live under `src/modules/<module>` and expose services to routes.
- Payment credentials and vendor secrets stay behind server-side adapters; they never enter route responses or agent tools.
