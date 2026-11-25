# Keycloak setup and handoff

The frontend delegates sign-in and registration to Keycloak. Its local account page does not open the Keycloak Account Console, which is disabled in realm snapshot v7. The frontend does not handle passwords. Administrators manage user status through the protected User Service API.

The account Security page starts password changes using the adapter's
`login({ action: 'UPDATE_PASSWORD' })` application-initiated action. Keycloak
collects the password and redirects to `/account?section=security`. The adapter's
`onActionUpdate` callback supplies success/cancellation/error feedback. This does
not require enabling Account Console or exposing an administrative client secret.
Keep the UPDATE_PASSWORD required action enabled in Keycloak. Account deletion
remains a local placeholder.

## Runtime configuration

Edit public/auth-config.json before running locally. In a deployed build, edit or mount the served auth-config.json file; a bundle rebuild is not required.

| Setting             | Default                | Meaning                                                                   |
| ------------------- | ---------------------- | ------------------------------------------------------------------------- |
| enabled             | true                   | Set false to leave only the public shell without contacting Keycloak.     |
| url                 | http://localhost:18080 | Keycloak base URL reachable from the browser.                             |
| realm               | votivo                 | Realm name.                                                               |
| clientId            | votivo-frontend        | Public OIDC client.                                                       |
| registrationEnabled | true                   | Enables the header's Register button; realm registration must also be on. |
| dpopMode            | strict                 | Require DPoP support advertised by Keycloak. Other values: auto or off.   |

Keep all fields present, including when enabled is false. This file is public: never add client secrets, passwords, SMTP keys, or administrative credentials.

The integration repository v7 export enables registration, DPoP-bound tokens, and the public frontend client. Account Console is disabled.

## Settings for the Keycloak administrator

1. Start the Keycloak environment from the integration repository and create or import realm votivo.
2. Configure client votivo-frontend as OpenID Connect, Client authentication Off (public client), Standard flow On, and PKCE method S256.
3. Keep Direct access grants and Implicit flow Off.
4. Set Valid Redirect URIs to http://localhost:4200/* and Web Origins to http://localhost:4200.
5. Set Valid Post Logout Redirect URIs to http://localhost:4200/*.
6. Keep DPoP-bound access tokens enabled when the frontend uses dpopMode strict. The browser must have Web Crypto support; use localhost for development and HTTPS for deployment.
7. Enable Realm settings > Login > User registration for the Register button to work. The runtime configuration already sets registrationEnabled true. For environments that only use pre-created users, set registrationEnabled false and create a test user with a non-temporary password.
8. Add an OpenID Connect Audience mapper to the frontend client or an attached client scope. Include custom audience `poll-service` in the access token; do not add it only to the ID token. The gateway and Poll Service both require it. Keep access-token signing on RS256 for this gateway configuration.
9. If email verification or password-reset delivery is required, configure working SMTP separately.

Use the browser's actual origin. A hostname or port change requires matching updates to redirect URIs, logout URIs, and Web Origins. Docker-internal hostnames such as keycloak are not normally reachable by a browser on the host.

Do not use the confidential administrative client votivo-user-admi or its secret in Angular.

## Flow and DPoP

Initialization uses Authorization Code flow with PKCE S256 and silent check-sso. It does not force anonymous users to log in. The adapter uses /silent-check-sso.html as a silent callback.

The pinned keycloak-js 26.2.5 adapter uses the dpopConfig initialization option. The shell maps dpopMode strict/auto to that option; off omits it. Keep this in sync with the realm client configuration. Do not turn DPoP off on one side only.

Authenticated API calls use the pinned adapter's `fetch` method, which adds a DPoP proof when the access token is bound. The included Node gateway verifies the proof and access token before forwarding requests to the private services. Configure `KEYCLOAK_ISSUER`, `KEYCLOAK_JWKS_URL`, `KEYCLOAK_AUDIENCE` and `PUBLIC_ORIGIN` on that server. Poll Service still validates the forwarded token itself; it must use the same issuer and audience. The client-side route guards do not replace these checks.

Access and refresh tokens stay in adapter memory. DPoP key persistence is managed by the adapter. No tokens are written to localStorage by this application.

Before each authenticated API request, `updateToken(30)` refreshes the access token
when it has less than 30 seconds remaining. The adapter uses its refresh token;
no separate refresh endpoint, client secret, or offline_access scope is needed.
Concurrent requests share one refresh operation. Token expiry also triggers a
refresh. A refresh failure/timeout or an authenticated gateway response of 401
clears the local session and asks the user to sign in again. Modifying requests
are not automatically replayed. A 403 is an authorization failure and does not
clear the session.

Local realm settings checked on 2026-11-23: access token 300 seconds, SSO idle
timeout 1800 seconds, maximum session 36000 seconds. Refresh-token revocation
(`revokeRefreshToken`) is off; `refreshTokenMaxReuse` is therefore inactive.
Refreshing does not extend the session beyond its configured maximum lifetime.

## Existing realm exports

The integration repository imports configuration only for a realm that does not already exist. Editing its JSON and restarting Keycloak does not update an existing realm. Apply changes through the Admin Console or Admin API and follow the team's versioned-export workflow. Do not delete database volumes to apply configuration updates.

The registrationEnabled flag affects the frontend button only. Keycloak remains responsible for allowing or denying registration.

## Acceptance checks with a real server

- Open /polls while signed out: the page is public, and Sign in is available.
- Click Sign in: the browser opens the correct realm's login page and returns to Votivo after successful login.
- Confirm that the account name and Sign out appear.
- Reload the page and confirm SSO restoration where browser cookie policy allows it.
- Click Sign out and confirm return to the public shell.
- Enable registration in the realm and runtime config; verify Register opens Keycloak's registration page and a new account can be created.
- Stop Keycloak and reload: the poll page still renders, account controls are disabled, and Retry connection is offered.

Angular tests mock the adapter; browser tests use the real adapter against a loopback identity fixture. Neither establishes the real realm's configuration. Complete these real-server acceptance checks for the target environment, then create/publish a poll, submit a vote and confirm that Result Service receives it through RabbitMQ.

## References

- [Keycloak JavaScript adapter](https://www.keycloak.org/securing-apps/javascript-adapter)
- [Keycloak realm import/export](https://www.keycloak.org/server/importExport)

## Local realm configuration on 2026-11-22

The running local `votivo` realm has registration, the public frontend client, Authorization Code flow, localhost:4200 redirect/web origins and DPoP-bound tokens enabled. With the user's explicit approval, the `poll-service-audience` mapper was added to `votivo-frontend` and read back successfully. It adds `poll-service` to access tokens and excludes the ID token.

The exact mapper is saved in [poll-service-audience-mapper.json](poll-service-audience-mapper.json) for another environment. Existing sessions need a token refresh or a new sign-in to obtain the updated audience. The integration repository's versioned realm export needs the same mapper for future fresh installations; this task updated the running local realm only.

Real-user sign-in and voting against that realm have not been exercised. The browser suite uses a test identity provider, while the separate live-service chain uses its signed test tokens.

## User Service profile integration

After sign-in, the frontend loads `/api/v1/users/me/header`. Header names/initials
come only from User Service, never from JWT name/email claims. If unavailable,
identity is displayed as Account; account settings offer retry.
The account page loads `/api/v1/users/me`, shows email/emailVerified, and PATCHes
only firstName/lastName. A successful PATCH updates the header immediately.
Email changes use `login({action: 'UPDATE_EMAIL'})`, return to the Profile section,
and are reflected through the existing Keycloak events/synchronization. Reopening the account page re-reads the projection if event delivery has not completed yet.

The gateway routes only GET /users/me/header and GET/PATCH /users/me. These routes
verify audience user-service and forward the original Authorization/DPoP pair.
The service verifies the proof independently; controlled X-Forwarded-Host/Proto
preserve the browser URI. Compose enables SERVER_FORWARD_HEADERS_STRATEGY=framework
and publishes User Service on loopback. Do not expose an alternative untrusted
proxy path to the forwarded-header-enabled service. For standalone development,
set SERVER_FORWARD_HEADERS_STRATEGY=framework on User Service too.
Configure USER_URL on the gateway (Compose: http://user-service:8080).
UPDATE_EMAIL must be enabled; realm snapshot v8 includes it.
Token claims still supply authentication identity and authorization, not display
profile fields. Account deletion remains a placeholder and is not proxied.


## Administrator accounts

The realm administrator provisions administrator accounts in Keycloak; no public registration or
special frontend password is required. In realm votivo, create an enabled user, configure credentials,
and assign the realm role `admin` in Role mapping. Use the realm role, not the master-realm administrator
or a service-account client. The existing admin composite includes user. Email verification and any
required password change still follow the configured Keycloak policies.

On sign-in, the frontend reads the signed token's realm_access.roles through the Keycloak adapter
and opens `/admin`. User Service synchronizes the account by UUID and receives role updates through
its existing identity event listener. No administrator is seeded with a hard-coded password and public
registration never assigns admin. The browser remains a public client; management client credentials
stay inside User Service.

The Users panel supports server-side name/email search, active/blocked filtering, pagination and
confirmed block/unblock operations. Self-blocking is disabled in the UI and rejected by User Service.
The gateway requires the user-service audience and admin role, forwards the original DPoP proof,
and preserves query parameters. User Service also checks the local account's status and admin role.
Blocked/deleted accounts and stale administrator permissions are rejected by the backend.
The poll moderation screen is available at `/admin/polls`, with read-only poll review and blocking.
The administrator UI exposes only user listing/blocking/unblocking and poll listing/review/blocking.
Regular profile, photo, voting, results and personal poll actions are unavailable to administrators;
the gateway enforces this even for the composite `admin` + `user` role. Poll Service separately
rejects administrator owner actions, and User Service denies administrator profile/photo operations.

Administrator profiles do not offer account deletion. Their accounts can only be removed through Keycloak by the realm administrator; DELETE /api/v1/users/me rejects admin accounts with 403.
