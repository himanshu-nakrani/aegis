# Aegis frontend

Next.js 14 (App Router) workbench for the Aegis backend: the React Flow canvas, run/observability surfaces, prompts, playground, and hosted chat.

## Develop

```bash
cp .env.local.example .env.local   # set NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev                      # http://localhost:3000
```

Requires the backend running (`../backend`, default `http://127.0.0.1:8000`).

## Gate

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run build
```

All backend calls go through `src/lib/api.ts`; TanStack Query cache keys live in `src/lib/query-keys.ts`; SSE proxies under `src/app/api/*/stream/route.ts`.
