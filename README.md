# Votivo Frontend

Angular interface for creating polls, choosing answers, and viewing poll results.

## Requirements and launch

Use Node.js 24.15 or newer within the 24.x release line, and npm. This project uses Angular 22 standalone components and lazy routes.

```bash
npm ci
npm start
```

Open `http://localhost:4200`.

To view demonstration results, start Result Service separately on port 8083 with its demo profile:

```powershell
# Run inside Votivo/backend/services/result-service:
.\gradlew.bat bootRun --args='--spring.profiles.active=demo'
```

The Angular development server proxies `/api/**` to `http://localhost:8083` using `proxy.conf.json`. Change that file if you run Result Service on another port. No CORS changes are required for this local setup.

## Routes and current behavior

| Route                    | Current behavior                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `/polls`                 | Lists one explicitly labeled sample poll.                                                   |
| `/polls/new`             | Validates a minimal draft and previews it locally without saving.                           |
| `/polls/:pollId/vote`    | Previews selections for the sample poll without sending a vote.                             |
| `/polls/:pollId/results` | Reads real aggregate JSON from Result Service, with loading, error/retry, and empty states. |
| `/login`, `/register`    | Account-page placeholders; no authentication is performed.                                  |
| Other paths              | Not-found page.                                                                             |

## Structure

- `src/app/core/models/` - poll and result contracts.
- `src/app/core/data/` - explicit sample-poll metadata.
- `src/app/core/services/` - HTTP access to Result Service.
- `src/app/features/` - polls, voting, results, account, and not-found pages.
- `src/app/app.routes.ts` - application routes.
- `docs/` - development and integration notes.

## Checks

```bash
npm test -- --watch=false
npm run build
```

## Responsibility and scope

Ruslan Kolisnychenko owns the Angular frontend and Result Service. This is the laboratory 4 foundation. Poll persistence, vote submission, Keycloak integration, access guards, administration, and production deployment are future work.

The sample poll metadata matches the optional Result Service demo fixture. No responses or passwords are stored in this frontend. Drafts and selections disappear when the page is destroyed or reloaded.

[Result Service](https://github.com/koliruslik/Votivo-result-service/tree/main) | [Integration repository](https://github.com/koliruslik/Votivo/tree/main)

## Working as a submodule

Work directly inside `Votivo/frontend`, on this repository's feature branch. Commit here to change the frontend repository. The parent Votivo repository's component reference is updated separately after a component PR is merged.
