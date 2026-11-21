# Development notes

The application shell hosts RouterOutlet. The /polls route loads PollList, which obtains an empty list from PollService.

An application initializer loads /auth-config.json and initializes the Keycloak adapter before the router starts processing the login callback URL. Configuration failures and unavailable Keycloak servers resolve to a visible unavailable state instead of preventing Angular from starting.

AuthService owns authentication signals and delegates hosted sign-in, registration, and logout to keycloak-js. Successful login or token refresh updates the header. Failed refresh clears the displayed account and asks the user to sign in again. The adapter stores access/refresh tokens in memory; application code does not persist them or expose them in the UI.

The optional silent SSO callback is served from /silent-check-sso.html. A browser may block silent SSO; automatic full-page fallback is disabled to keep anonymous browsing available. An explicit Sign in remains possible. Login iframe monitoring is disabled, so another tab's logout is detected on a subsequent refresh rather than immediately.

Runtime config and callback paths assume hosting at the origin root. For a deployment under a subpath, adjust these paths and the registered redirect URLs together. Serve auth-config.json with a short-lived or no-cache policy when runtime settings need to change.

The public page does not call protected APIs. There are no route guards, token interceptors, or gateway access rules in this change. Configure them only after agreeing the gateway contract, including DPoP proof validation when sender-constrained tokens are used.

See keycloak.md for the server-side configuration handoff.
