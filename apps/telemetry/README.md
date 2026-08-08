# @vectalon-dev/telemetry

The Vectalon telemetry backend — the endpoint the `@vectalon-dev/rn` diagnostics
pipeline (P0) posts to. **Errors-only, opt-out client-side**, liveness
heartbeats, and support-bundle uploads that get emailed to the support address.

Zero runtime dependencies (Node `>=20`, TypeScript). Runs on **Vercel**
(serverless functions + Vercel KV) or any plain Node server.

## Routes

| Route | Method | Purpose |
|---|---|---|
| `/v1/errors` | `POST` | `{ schemaVersion, events: ErrorReport[] }` — store structured errors (capped at 200/request, 500 total) |
| `/v1/heartbeat` | `POST` | `HeartbeatPayload` — liveness ping from `vectalon serve` / `vectalon daemon` |
| `/v1/support` | `POST` | gzipped `SupportBundle` JSON (`Content-Encoding: gzip`, or plain JSON) — stored + emailed |
| `/v1/health` | `GET` | `{ status, now, counts, activeClients }` |
| `/v1/errors` · `/v1/heartbeat` · `/v1/support` | `GET` | recent lists (`?limit=`), used by the dashboard |
| `/` | `GET` | **Health dashboard** — counts, latest errors, active clients, support delivery status (auto-refresh 30s) |

Every JSON response carries permissive CORS headers. Bodies are capped
(1 MiB errors / 128 KiB heartbeat / 8 MiB support), malformed events are
skipped, and oversized payloads get `413`.

## Storage

Pluggable via `Store` — selected automatically:

1. **Vercel KV / Upstash** (production) — used when `KV_REST_API_URL` +
   `KV_REST_API_TOKEN` are set (exactly what Vercel injects when a KV store is
   linked). Plain-fetch Upstash REST, 30-day TTL per collection.
2. **JSON files** (local dev) — `.data/` (override `DATA_DIR`).
3. **In-memory** — fallback; resets per instance.

> **KV is required in production.** Each Vercel function runs its own store
> instance, so without a shared KV store the ingest functions and the
> dashboard/lists would each see only their own in-memory data (i.e. the
> dashboard would show nothing). Link a KV store in Vercel before going live.

## Email forwarding

Support uploads are emailed via [Resend](https://resend.com) (plain fetch, no
SDK) with the sanitized bundle attached as JSON. Requires:

| Env | Default | Purpose |
|---|---|---|
| `RESEND_API_KEY` | — | Resend API key (required to email; bundles are stored regardless) |
| `SUPPORT_TO` | `neofaceless22@gmail.com` | Delivery address |
| `SUPPORT_FROM` | `Vectalon Support <support@vectalon.dev>` | Verified sender — you must verify the domain in Resend |

Without `RESEND_API_KEY` the bundle is stored and shown as pending in the
dashboard — nothing is lost.

## Local dev

```bash
pnpm install
pnpm dev          # http://localhost:8787
pnpm test         # node:test suite (tsx)
pnpm typecheck
```

Smoke test:

```bash
curl -X POST localhost:8787/v1/errors -d '{"events":[{"message":"boom","command":"serve"}]}'
curl -X POST localhost:8787/v1/heartbeat -d '{"kind":"serve","pid":1,"timestamp":'$(date +%s000)'}'
curl localhost:8787/v1/health
curl localhost:8787/                       # dashboard
```

## Deploy to Vercel

```bash
cd apps/telemetry
vercel            # first deploy; then link a KV store + set env vars
vercel env add RESEND_API_KEY
vercel env add SUPPORT_TO neofaceless22@gmail.com
vercel --prod
```

`vercel.json` rewrites `/v1/*` and `/` to the `api/*` functions. Zero-config
TypeScript — Vercel compiles `api/` itself.

## Pointing the client at it

The `rn` client defaults to `https://telemetry.vectalon.dev`. Override per
deployment:

```bash
export RN_VECTALON_TELEMETRY_URL=https://<your-deploy>.vercel.app
```

or update `DEFAULT_TELEMETRY_BASE_URL` in
`packages/rn/src/diagnostics/errorReporter.ts`.

## Security notes

- Endpoints are intentionally anonymous (the client is opt-out privacy-first).
- The dashboard is public by default — gate it behind Vercel auth/CF Access if
  you do not want it exposed.
- There is no rate limiting; add an edge middleware (Vercel WAF) if you expect
  hostile traffic.
