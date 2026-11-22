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
