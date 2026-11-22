# Keycloak setup and handoff

The frontend delegates sign-in, registration and account pages to Keycloak. The frontend does not handle user passwords or administer accounts.

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

The current integration repository export matches the default realm/client settings and has DPoP-bound tokens enabled. Registration remains disabled there.

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
