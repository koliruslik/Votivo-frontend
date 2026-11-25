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

Sign-in and registration use Keycloak's hosted pages. The local account page shows the signed-in identity and links to the user's polls; it does not open the disabled Keycloak Account Console. Browser settings are in [public/auth-config.json](public/auth-config.json). The frontend client needs an access-token audience mapper for `poll-service`; see [Keycloak setup](docs/keycloak.md).

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

Backend service source and the integration repository's submodule references are managed separately. Profile names and photos use User Service through the same-origin gateway. Email and password changes use Keycloak required actions.

[Result Service](https://github.com/koliruslik/Votivo-result-service) | [Integration repository](https://github.com/koliruslik/Votivo)

## Profile photos

On Account → Profile, add or change a JPEG/PNG photo, position the circular crop and adjust zoom.
The editor uses React and [react-easy-crop](https://github.com/ValentinH/react-easy-crop) inside the
Angular account screen. Its React bundle loads only when the editor opens. Saving exports a square
JPEG up to 512×512 and uploads it as the multipart `file` part to `PUT /api/v1/users/me/photo`.
The source image is limited to 5 MB and 4096×4096; these match the backend defaults.

Photos are fetched with authentication and displayed with temporary blob URLs in the profile and
header. No token is included in image URLs. Remove photo calls DELETE on the same endpoint;
GET restores the stored image after reload. Failed writes preserve the current image, and cancel
never uploads. Session changes clear image URLs and discard late responses. The Node gateway
preserves multipart boundaries and binary responses, and limits photo requests to 6 MB.


## Account deletion

Account → Security → Delete account opens a confirmation dialog. DELETE /api/v1/users/me is
forwarded to User Service with the original access token and DPoP proof. A blocked account (403)
or an owner with PUBLISHED unfinished polls (409) remains signed in and sees the reason in the dialog.
Drafts do not prevent deletion. Both completed deletion (204) and durably queued identity deactivation
(202) clear the local session and return to Explore. Failed requests preserve the current session.


## Poll deadline

Poll settings include Voting ends, entered in the browser's local time zone and sent as a UTC
`endsAt` instant. Drafts may omit it; publication requires a future deadline. Poll review displays
the scheduled end, and voting controls become unavailable when it arrives without a page reload.
Poll Service, Vote Service (including migration 000004) and the gateway must be updated together.

## Administration

Users with the Keycloak realm role `admin` land on `/admin` after signing in. The realm administrator
creates their accounts and assigns the role in Keycloak, so they do not register through the site.
The Users panel lists accounts with server-side search, status filters and pagination. Block/unblock
requires confirmation; self-blocking is unavailable. Changes use the existing User Service admin API.
Persistent Users and Polls tabs keep moderation one click away, including while reviewing a poll.
User search, filters and pagination survive tab changes; the poll list remembers its page.
At `/admin/polls`, administrators can review poll content and block it with confirmation.
They cannot unblock polls, vote, view results, create or manage personal polls, or edit a profile.
The gateway and backend enforce these boundaries even when `admin` also includes `user`.
See docs/keycloak.md for provisioning and role boundaries.

Blocking a user disables their Keycloak account, revokes their sessions and denies authorized
requests even with an unexpired JWT. For every authorized Poll/Vote/Result request, the gateway
checks current access through User Service's secret-protected internal endpoint; failures deny access.
`INTERNAL_AUTH_SECRET` must match in the gateway, User Service and the other backend services.
The browser clears a revoked session and returns to Explore. Visible tabs also check access every
30 seconds and when becoming visible. Ordinary permission errors do not sign users out.
Account blocking preserves profile data, votes and published polls. Polls retain their scheduled
deadline; moderation blocking is separate and is never reversed by unblocking the account.
Unblocking requires a new login: User Service's durable session-revocation cutoff keeps older JWTs
invalid. Apply migration V5 and deploy User Service and the gateway together.
