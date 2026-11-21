# Tests

Run npm test -- --watch=false to verify the account shell's initialization, configured registration, sign-in/logout delegation, expired sessions, and unavailable-server behavior.

The suite mocks the Keycloak adapter and HTTP runtime configuration. It does not create users or prove that an external realm is correctly configured.

Run the real-server acceptance checklist in ../docs/keycloak.md after configuring Keycloak.
