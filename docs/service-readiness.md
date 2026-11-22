# Service readiness — 2026-11-22

Checked the fetched service `main` branches and the RabbitMQ integration branch. Existing application worktrees were preserved; Java service verification used separate worktrees and disposable databases. This is a dated functional assessment, not a production certification or a whole-repository code audit.

| Component              | Checked commit     | Observed readiness                                                                                                                                                                         |
| ---------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Poll Service           | `a0a5932`          | Draft CRUD, public/link access, owner permissions, publication/closure/archive, moderation, JWT checks and outbox delivery are implemented.                                                |
| Vote Service           | `6f05808`          | UUID voting, duplicate prevention, vote status/change/revoke, anonymous ballots, poll-event projection and outbox events are implemented. Trusts gateway `X-User-ID`.                      |
| Result Service         | `1e289cd`          | PostgreSQL counters, poll/vote consumers, deduplication, result breakdown and DLQs are implemented. Direct endpoint has no access control.                                                 |
| User Service           | `fec03c8`          | Spring Boot entry point, configuration and package placeholders. No implemented user controllers or profile use cases in `main`.                                                           |
| Integration repository | `1180ae2` (`main`) | Its compose file still starts only the earlier service subset. Poll/Result wiring is present in `origin/feat/rabbitmq-event-integration`; merge coordination and submodule updates remain. |

## Poll Service checks

- `gradlew.bat test --no-daemon`: 36 tests passed.
- `gradlew.bat postgresTest --no-daemon`: 4 tests passed on PostgreSQL 16.
- `gradlew.bat messagingTest --no-daemon`: 2 tests passed on a separate RabbitMQ, including late consumers and dead-letter delivery.

Startup reports existing Hibernate `HHH160246` warnings for the ordered inverse collections `Poll.questions` and `Question.options`. PostgreSQL persistence tests passed; the mapping warnings still deserve owner review. These service mappings were not changed by the frontend work.

## Vote Service checks

`go test ./...` passed in the official Go 1.26 container. Packages without tests are reported as such by Go. The service ran against its own test database and consumed actual poll events in the live chain below.

## Result Service checks

- `gradlew.bat test --no-daemon`: 18 tests passed.
- `gradlew.bat postgresTest --no-daemon`: 5 tests passed, including 200 concurrent counter updates.

## Live service chain

Started current Poll, Vote and Result Service with separate PostgreSQL databases and a disposable RabbitMQ. Used the frontend's gateway and real signature verification against a local test issuer's JWKS. The issuer was a test fixture, not the existing Keycloak realm; User Service was not involved.

42 successful HTTP status assertions covered creation, publication, event propagation, single/multiple-choice counts, duplicate rejection, vote changes, revocation, link-only result access, closure, archival, administrator blocking, draft deletion, personal/admin lists and forged identity rejection. Asynchronous checks waited for actual projected results.

## Remaining system work

- Merge and align the integration repository's service references and compose wiring.
- Implement User Service's intended application features if they remain required; the frontend currently uses Keycloak for account management.
- Complete real-user login/API acceptance in the `votivo` realm and carry the approved audience mapper into its versioned export for fresh installations.
- Keep Vote/Result inaccessible directly from public clients; the frontend gateway enforces identity and visibility but their raw endpoints still bypass that boundary.
- Define production TLS, shared/restart-resistant replay storage if needed, DLQ replay procedures and operational monitoring. These are not established by local functional tests.

## Real Keycloak configuration

Read the running local `votivo` realm. Registration, the public frontend client, Authorization Code flow, localhost:4200 redirects/web origins and DPoP are enabled. With explicit user approval, added the missing explicit `poll-service` access-token audience mapper to `votivo-frontend` and verified its saved configuration. The ID token is excluded. Its source JSON is `poll-service-audience-mapper.json`.

No real-user password or account was used for acceptance. That login/API check remains separate from the successful test-issuer chain, and the integration repository's versioned realm export still needs the mapper for a fresh setup.

## Frontend verification

Based on frontend commit `ec8c877`, implemented on `feat/complete-polling-interface` without pre-existing worktree edits. Updating the integration repository's frontend submodule reference is a separate step after the component changes are merged.

- Production Angular build passed without compiler or bundle warnings.
- The repeated audit passed 31 Angular tests, 5 gateway tests, 16 desktop/mobile interaction tests and 2 production SSO tests.
- Prettier verification and `git diff --check` passed. No separate linter is configured.
- The Docker image built successfully using Node.js 24.16.0, and Compose configuration validated.

Screenshots use clearly separated browser fixtures and are saved under the workspace's `output/votivo-frontend-2026-11-22` directory. No demo records or test identity provider are included in the runtime application.

## Repeated frontend audit

The repeat review found and fixed faults in the local frontend implementation, including framing denial on the silent SSO callback, stale asynchronous state, editing while saving, expired-session controls and treating a missing vote projection as an uncast vote. See [frontend audit](frontend-audit.md) for scope, corrections and validation limits.

A fresh Chrome context also verified production initialization against the actual local `votivo` Keycloak realm, navigation to its real login form and the PKCE S256 request. No credentials were entered. Authenticated real-user voting remains unverified; the service-chain and browser checks described above use test tokens.
