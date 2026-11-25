# Tests

## Angular

`npm test -- --watch=false` checks account initialization, session expiry, registration/sign-in/logout controls, API payloads, pagination, link access, HTTP failures, single/multiple-choice voting and anonymous-vote restrictions. The Keycloak adapter and HTTP boundaries are test doubles.

## Gateway

`npm run test:server` uses real signed RSA and EC tokens, an isolated HTTP upstream and ephemeral ports. It checks JWT signature/issuer/audience/expiry, DPoP proof binding and replay, administrator authorization, private result access and rejection of a forged `X-User-ID`.

## Browser

`npm run test:e2e` starts Angular and a loopback OIDC fixture. The suite uses an isolated browser context per test and intercepts API responses. It covers desktop and mobile catalog navigation, filtering, error recovery, results, route handling, login with the real Keycloak JavaScript adapter, DPoP headers, creation/editing, question order and settings, unsaved changes, publication, voting/withdrawal, link-only anonymous access, closure, archival and administrator blocking.

Local runs use installed Chrome. On Linux CI use `npx playwright install --with-deps chromium` first; `CI=true` selects the installed Playwright browser. Traces are retained for failures. Screenshots and traces are ignored by Git.

These browser checks do not prove that a real Keycloak realm or the complete backend is configured correctly. Run the acceptance checks in [Keycloak setup](../docs/keycloak.md) for that environment. The separate live-service checks performed on 2026-11-22 are recorded in [service readiness](../docs/service-readiness.md).

## Production browser checks

Run `npm run build` followed by `npm run test:production`. This suite starts the Node production server instead of Angular's dev server. On desktop and mobile it verifies anonymous silent SSO, login, restoration after a reload and logout, including the callback's framing headers. It uses the loopback identity fixture and intercepted poll API responses.

CI runs this after the build and the regular browser suite, so the two servers never compete for port 4200. All browser fixtures use disposable contexts. Neither suite enters real credentials or changes the actual Keycloak realm.

## Profile photo checks

Photo tests cover authenticated binary loading, multipart uploads, failed changes, stale responses
and URL cleanup. Gateway tests verify multipart bytes, DPoP forwarding, binary responses,
request-size limits and rejected requests. Desktop/mobile browser tests exercise cropping, zoom,
JPEG resizing, reload, replacement, deletion, cancellation and retry after failure.

When the usual ports are occupied, use isolated ports in PowerShell:

```powershell
$env:E2E_PORT = '4201'
$env:E2E_OIDC_PORT = '18090'
npm.cmd run test:e2e
```


## Poll deadlines

Poll browser scenarios also verify local-time deadline conversion and round-trip editing,
publication disabled without a future deadline, and voting controls expiring without a reload.
Gateway tests reject cast/change/revoke after the deadline while preserving status and result reads.

## Administrator panel

Account blocking scenarios verify clearing a revoked session on a protected request and on tab
visibility checks, while public browsing remains available. Gateway coverage exercises stale JWT
rejection, preserved polls/votes, separate poll blocking, unblocking and fail-closed status checks.

The identity fixture issues the user role by default. Administrator scenarios opt in with the
votivo-test-admin cookie on the disposable test issuer; this mechanism exists only in tests.
Admin panel checks cover automatic landing, ordinary-user route denial, self-block protection,
server-side search/filter/paging, confirmation, block/unblock, cancellation and recovery from failure.
Gateway tests validate the user-service audience, realm role and forwarded query parameters.
They also reject administrator profile/photo, participant and poll-owner operations. Browser checks
cover persistent Users/Polls navigation, preserved search state, read-only poll review and blocking,
and redirects away from regular-user pages on desktop and mobile.
