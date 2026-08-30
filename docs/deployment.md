# Initial deployment

The initial production topology uses two Vercel projects and one Neon database:

```text
Browser -> Vercel /frontend -> /api rewrite -> Vercel /backend -> Neon Postgres
```

Keeping browser requests on the frontend origin is important for the HttpOnly
session cookie and Google OIDC callback. The backend remains a separate Vercel
Function, while `frontend/next.config.ts` proxies `/api/*` to it.

## Backend project

Use `backend/` as the Vercel project root. The Fastify entrypoint is detected at
`src/server.ts`; `vercel.json` keeps the function in São Paulo. Fluid Compute's
default function duration is five minutes.

Required production variables:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=3001
LOG_LEVEL=info
CORS_ORIGIN=https://your-frontend.vercel.app
DATABASE_URL=postgresql://...-pooler.../bound?sslmode=require

AUTH_MODE=oidc
AUTH_SESSION_TTL_SECONDS=28800
AUTH_LOGIN_TRANSACTION_TTL_SECONDS=600
AUTH_OIDC_ISSUER=https://accounts.google.com
AUTH_OIDC_CLIENT_ID=...
AUTH_OIDC_CLIENT_SECRET=...
AUTH_OIDC_CALLBACK_URL=https://your-frontend.vercel.app/api/auth/v1/login/google/callback

KYA_MODE=EXTERNAL_OPTIONAL
KYA_PROVIDER=didit
KYA_API_BASE_URL=https://verification.didit.me
KYA_API_KEY=...
KYA_WORKFLOW_ID=...
KYA_WEBHOOK_SECRET=...
KYA_REQUEST_TIMEOUT_MS=5000
KYA_ATTESTATION_TTL_SECONDS=31536000
```

The OpenAI, TravelBot, SerpApi and optional Langfuse variables retain the names
documented in `backend/.env.example`. Never expose them to the frontend.

Use Neon's pooled connection string for the running API. Apply migrations with
a direct or pooled Neon connection before deploying:

```bash
DATABASE_URL='postgresql://...' pnpm --filter @bound/backend db:migrate
```

## Frontend project

Use `frontend/` as the Vercel project root and configure:

```dotenv
NEXT_PUBLIC_API_URL=/api
BACKEND_URL=https://your-backend.vercel.app
```

`BACKEND_URL` is server-side build configuration. `NEXT_PUBLIC_API_URL=/api`
ensures cookies, OAuth redirects and browser calls share the frontend origin.

After both projects exist, add the exact frontend production URL to
`CORS_ORIGIN`, use it as the base of `AUTH_OIDC_CALLBACK_URL`, and add the exact
callback URL to the Google OAuth client's authorized redirect URIs.
