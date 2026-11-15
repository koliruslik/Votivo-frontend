# Development and integration

Standalone feature components own page state; DemoPollService supplies explicit development fixtures. ResultsApiService owns HTTP requests and keeps transport details outside templates.

The results API contract is defined in core/models/poll-result.ts. Percentages represent the share of submissions answering each question; multi-select percentages may exceed 100% in total. Unknown question and option IDs are displayed as IDs until poll metadata integration is available.

The development proxy routes only /api requests to Result Service. A production host must serve index.html for client routes and configure an API reverse proxy separately. No deployment configuration is included at this stage.

Account routes intentionally do not collect credentials until the team agrees Keycloak integration. Poll drafts and selections are local previews; they never report successful publication or vote submission.

Work on a feature branch in this submodule. Keep parent-repository pointer changes separate.
