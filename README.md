# Votivo Frontend

Angular frontend foundation for the Votivo polling and voting application.

## Run

Use Node.js 24.15 or newer within the 24.x release line, and npm.

```bash
npm ci
npm start
```

Open `http://localhost:4200`. No backend, database, or Docker is needed.

On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

## Laboratory 4 scope

This is a runnable project skeleton, not a completed application. It includes the application shell, routing, a basic poll-list component, the Poll model, and PollService.

PollService currently returns an empty list, and the page displays an empty state. API integration and the creation, voting, results, and account flows are planned for later work.

## Structure

- `src/app/app.*` - root component, configuration, and routes.
- `src/app/core/models/` - shared models.
- `src/app/core/services/` - service layer.
- `src/app/features/polls/` - poll-list component.
- `tests/` - reserved test area.
- `docs/` - development notes.

## Build

```bash
npm run build
```

## Team responsibility

Ruslan Kolisnychenko owns the Angular frontend and Result Service. The rest of the team owns User Service, Poll Service, and Vote Service.

[Result Service](https://github.com/koliruslik/Votivo-result-service/tree/main) | [Integration repository](https://github.com/koliruslik/Votivo/tree/main)

## Working locally

Work directly inside `Votivo/frontend` on this repository's feature branch. Commit changes here and review them through a PR. Updating the submodule reference in the parent repository is a separate step.
