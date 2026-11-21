import { InjectionToken } from '@angular/core';
import Keycloak, { KeycloakConfig } from 'keycloak-js';

export const KEYCLOAK_FACTORY = new InjectionToken<(config: KeycloakConfig) => Keycloak>(
  'KEYCLOAK_FACTORY',
  { providedIn: 'root', factory: () => (config) => new Keycloak(config) },
);
