# Votivo Frontend

Angular interface for creating polls, voting and reading results. A same-origin Node server serves the production build and routes API requests to Poll, Vote and Result Service.

## Run locally

Use Node.js 24.16+ in the 24.x line and npm. The backend must include the RabbitMQ integration, not only the older service skeletons.

```powershell
npm.cmd ci
npm.cmd run start:server
```

In a second terminal:

```powershell
npm.cmd start
```

Open `http://localhost:4200`. Angular proxies `/api` to the Node server on port 4300. The server defaults to Poll on 18082, Vote on 18083 and Result on 18084. Override its settings using environment variables; `.env.example` lists them. To load that file explicitly, use `node --env-file=.env server/index.mjs` after making a local `.env` copy.

Sign-in, registration and profile/security settings use Keycloak's hosted pages. Browser settings are in [public/auth-config.json](public/auth-config.json). The frontend client needs an access-token audience mapper for `poll-service`; see [Keycloak setup](docs/keycloak.md).

## Interface

- Explore: public polls, server pagination, and search/filter within the current page.
- My polls: the signed-in user's drafts, open, closed and archived polls.
- Poll builder: single/multiple-choice questions, ordering, options, visibility, anonymity and vote-change settings. Unsaved edits require confirmation before leaving.
- Poll page: draft preview, publication, voting, editing/withdrawing permitted votes, sharing, closing, archiving and draft deletion.
- Results: per-option counts and percentages, total ballots and explicit refresh for asynchronous updates.
- Moderation: administrator poll list and blocking with confirmation.
- Account, help, unavailable-service states and a not-found page.

Layouts adapt to phones and desktop screens. Fonts are served locally under their included SIL Open Font Licenses.

## Production build and local Docker

```powershell
npm.cmd run build
$env:PORT = '4200'
npm.cmd run start:server
```

The Node server serves `dist/votivo-frontend/browser`, including SPA deep links. Runtime auth configuration is served without a long-lived cache.

Alternatively, after the integration backend is running on `votivo_internal`:

```powershell
docker compose up -d --build --wait
```

[compose.yml](compose.yml) builds the frontend and joins that existing network. Set `BACKEND_NETWORK` if its name differs. Browser-facing URLs still use the host's address; internal API/JWKS requests use Docker service names. `PUBLIC_ORIGIN` must match the browser URL, including its port.

## API boundary

The browser sends requests only to `/api/v1` on its own origin. The pinned Keycloak adapter refreshes tokens and attaches DPoP proofs. The Node server verifies RS256 access-token signatures, issuer, audience and expiry. For DPoP-bound tokens it also checks the proof signature, key thumbprint, access-token hash, method, URL, time and replay ID. It derives `X-User-ID` from the verified subject and never trusts the browser's identity header.

Vote and result access is checked against Poll Service. Link-only access carries the share token; knowing a poll ID alone does not grant access through this server. Keep Vote and Result private behind the gateway in deployment, because their direct APIs do not implement this boundary themselves.

The server is intended for a single instance. DPoP replay IDs are held in memory for 70 seconds; multi-instance operation and restart-resistant replay protection require a shared replay store. Production requires HTTPS and matching Keycloak URLs. This repository does not claim a completed production infrastructure setup.

## Checks

```powershell
npm.cmd test -- --watch=false
npm.cmd run test:server
npm.cmd run test:e2e
npm.cmd run build
npm.cmd run test:production
```

Browser tests use Chrome locally; on CI they use Playwright Chromium. They run a local identity fixture and intercepted API responses. The separate production browser suite also verifies the built application, silent SSO, session restoration and logout through the Node server. These suites use a test issuer; they do not establish authenticated access in a real Keycloak realm. See [tests](tests/README.md), [architecture](docs/development.md) and the dated [service readiness check](docs/service-readiness.md).

Backend service source and the integration repository's submodule references are managed separately. This frontend does not implement the unfinished User Service APIs; profile and security controls open Keycloak account management.

[Result Service](https://github.com/koliruslik/Votivo-result-service) | [Integration repository](https://github.com/koliruslik/Votivo)
