# Votivo Frontend

Angular frontend foundation for Votivo, with a small Keycloak account shell.

## Run

Use Node.js 24.15 or newer within the 24.x release line, and npm.

```bash
npm ci
npm start
```

Open `http://localhost:4200`. On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

The public poll page remains available when Keycloak is offline. Sign-in requires the configured Keycloak server.

## Account shell

The header offers Sign in and Register. Authentication happens on Keycloak's hosted pages. After sign-in, the header shows the account name and Sign out.

Non-secret runtime settings live in [public/auth-config.json](public/auth-config.json). The defaults target the integration repository's `votivo` realm and `votivo-frontend` public client at `http://localhost:18080`.

The Register button is enabled in the runtime configuration. The Keycloak administrator must also enable self-registration in the realm. The integration repository's initial realm export still has registration disabled; changing the live realm does not update that export automatically. Set `registrationEnabled: false` to disable the button in an environment without registration.

See [Keycloak setup and handoff](docs/keycloak.md) for the exact server settings, DPoP configuration, and acceptance checks. There is no client secret or password form in this frontend.

## Current scope

The application has a public `/polls` page, Poll model, and PollService. PollService returns an empty list. The account shell adds sign-in, registration navigation, logout, and session state.

Poll creation, vote submission, result visualization, backend API calls, and gateway authorization remain separate work. Account state in the header does not enforce API permissions.

## Structure

- `src/app/app.*` - application shell, account header, initialization, and routes.
- `src/app/core/auth/` - authentication state, runtime config validation, and Keycloak adapter.
- `src/app/core/models/` - shared models.
- `src/app/core/services/` - poll service.
- `src/app/features/polls/` - public poll-list component.
- `public/` - runtime auth settings and silent SSO callback.
- `tests/` - test instructions.
- `docs/` - development and Keycloak configuration notes.

## Checks

```bash
npm test -- --watch=false
npm run build
```

Automated tests use a mocked Keycloak adapter and exercise the shell's state transitions and controls. Complete login/registration acceptance requires a configured Keycloak and a test user.

## Team responsibility

Ruslan Kolisnychenko owns the Angular frontend and Result Service. The rest of the team owns User Service, Poll Service, and Vote Service.

[Result Service](https://github.com/koliruslik/Votivo-result-service/tree/main) | [Integration repository](https://github.com/koliruslik/Votivo/tree/main)

## Working locally

Work directly inside `Votivo/frontend` on this repository's feature branch. Commit changes here and review them through a PR. Updating the parent repository's component reference is a separate step.
