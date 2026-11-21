# Keycloak setup and handoff

This shell delegates account pages to Keycloak. The frontend does not handle user passwords or administer accounts.

## Runtime configuration

Edit public/auth-config.json before running locally. In a deployed build, edit or mount the served auth-config.json file; a bundle rebuild is not required.

| Setting             | Default                | Meaning                                                                     |
| ------------------- | ---------------------- | --------------------------------------------------------------------------- |
| enabled             | true                   | Set false to leave only the public shell without contacting Keycloak.       |
| url                 | http://localhost:18080 | Keycloak base URL reachable from the browser.                               |
| realm               | votivo                 | Realm name.                                                                 |
| clientId            | votivo-frontend        | Public OIDC client.                                                         |
| registrationEnabled | false                  | Enable the header's Register button only after enabling realm registration. |
| dpopMode            | strict                 | Require DPoP support advertised by Keycloak. Other values: auto or off.     |

Keep all fields present, including when enabled is false. This file is public: never add client secrets, passwords, SMTP keys, or administrative credentials.

The current integration repository export matches the default realm/client settings and has DPoP-bound tokens enabled. Registration remains disabled there.

## Settings for the Keycloak administrator

1. Start the Keycloak environment from the integration repository and create or import realm votivo.
2. Configure client votivo-frontend as OpenID Connect, Client authentication Off (public client), Standard flow On, and PKCE method S256.
3. Keep Direct access grants and Implicit flow Off.
4. Set Valid Redirect URIs to http://localhost:4200/* and Web Origins to http://localhost:4200.
5. Set Valid Post Logout Redirect URIs to http://localhost:4200/*.
6. Keep DPoP-bound access tokens enabled when the frontend uses dpopMode strict. The browser must have Web Crypto support; use localhost for development and HTTPS for deployment.
7. Create a test user with a non-temporary password, or enable Realm settings > Login > User registration. To expose the registration button, also set registrationEnabled true in auth-config.json.
8. If email verification or password-reset delivery is required, configure working SMTP separately.

Use the browser's actual origin. A hostname or port change requires matching updates to redirect URIs, logout URIs, and Web Origins. Docker-internal hostnames such as keycloak are not normally reachable by a browser on the host.

Do not use the confidential administrative client votivo-user-admi or its secret in Angular.

## Flow and DPoP

Initialization uses Authorization Code flow with PKCE S256 and silent check-sso. It does not force anonymous users to log in. The adapter uses /silent-check-sso.html as a silent callback.

The pinned keycloak-js 26.2.5 adapter uses the dpopConfig initialization option. The shell maps dpopMode strict/auto to that option; off omits it. Keep this in sync with the realm client configuration. Do not turn DPoP off on one side only.

This change connects account navigation and session state, not API authentication. A future gateway integration must handle DPoP-bound tokens with proof validation; adding a normal Bearer header alone is not a complete DPoP integration. Likewise, the header's account state is not a substitute for server-side authorization.

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

The automated suite uses a mocked adapter. These real-server acceptance checks must be completed by the developer configuring Keycloak.

## References

- [Keycloak JavaScript adapter](https://www.keycloak.org/securing-apps/javascript-adapter)
- [Keycloak realm import/export](https://www.keycloak.org/server/importExport)
