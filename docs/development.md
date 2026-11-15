# Development notes

The application shell hosts RouterOutlet. The /polls route loads PollList, which obtains its list from PollService. Poll is the initial frontend model.

PollService returns an empty list as the initial implementation. The application starts independently without HTTP requests or demo data.

Laboratory 4 establishes the project structure and minimal component/service behavior. Backend integration, authentication, forms, voting, result visualization, and automated test scenarios remain later work.
