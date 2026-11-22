# Frontend audit — 2026-11-22

Reviewed the complete local frontend feature diff from `ec8c877` on `feat/complete-polling-interface`, including untracked modules, gateway, tests, runtime/build configuration and affected documentation. This was a review and correction of the requested frontend implementation. Backend source was checked for API contracts, not subjected to a new repository-wide audit. Existing backend test results remain recorded in [service readiness](service-readiness.md).

## Corrections

| Problem found                                                                                                                        | Corrected behavior                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production sent `X-Frame-Options: DENY` on `silent-check-sso.html`, preventing the Keycloak callback from loading inside its iframe. | That callback alone uses `SAMEORIGIN`; other pages keep `DENY`. A new regression test reproduced the failure before the fix.                                           |
| A pending result request could block the next poll's result load; late draft responses could overwrite a newer draft.                | Request generations discard obsolete responses and prevent old completions from clearing a new loading state. The editor follows current route parameters.             |
| Inputs could change during a save, and reloading after a failed save could discard edits without confirmation.                       | Saving locks fields and navigation, sends a snapshot, and releases navigation after success. Failed saves retain edits; reloading a dirty draft asks for confirmation. |
| A session could expire while the ballot remained editable; refresh failure looked like a network outage.                             | Voting requires an active session and permitted change settings. Session expiry retains a specific sign-in error instead of a connection error.                        |
| Vote-status 404 was interpreted as an uncast vote.                                                                                   | The Vote Service contract says the poll projection may be missing. The ballot stays disabled and offers retry.                                                         |
| A hanging identity-provider request could hold bootstrap or API token refresh indefinitely.                                          | Initialization and refresh each have an eight-second deadline. Rejected sessions ignore late callbacks.                                                                |
| A successful HTTP response containing HTML exposed a JSON parser error in the UI.                                                    | The API layer reports an unexpected service response without exposing parser internals.                                                                                |

Tabs now use a single keyboard tab stop and preserve arrow/Home/End navigation. Runtime Docker files exclude the gateway test module.

## Validation

- 31 Angular tests passed, including the new session, request-race, draft-save and retry regressions.
- 5 Node gateway tests passed, including signed JWT/DPoP checks and production SSO framing headers.
- 16 browser interaction checks passed across desktop and mobile: catalog/filtering, error recovery, results, creation/publication, voting/revocation, editing/reordering/settings, unsaved changes, shared anonymous polls, closure/archive and moderation.
- 2 production-server browser checks passed: silent SSO, sign-in, restoration after reload, logout and another anonymous reload. They use the real adapter with a local test issuer.
- The production Angular bundle and Node.js 24.16.0 Docker image built successfully. Compiler and bundle budgets reported no warnings.
- A separate fresh Chrome context used the actual local Keycloak realm through the production server: anonymous initialization succeeded, the real login page opened, and the authorization request used PKCE S256. No username/password was entered and the realm was not changed during this review.

Prettier verification and `git diff --check` passed after the documentation update. There is no separate configured linter. Existing backend Hibernate warnings are documented in the service readiness report; frontend changes do not address them.

## Remaining boundaries

The frontend implements the scenarios supported by the current API contracts. This does not make the whole system complete: User Service still has no application features, the integration repository needs its compose/submodule changes coordinated, and the approved local audience mapper must be carried into a versioned realm export for a fresh installation.

A real user's authenticated end-to-end vote has not been tested. Production TLS, private backend exposure and multi-instance replay protection remain deployment work described in the README. The integration repository's frontend reference must be updated separately after these component changes are merged. No production deployment was part of the verification.
