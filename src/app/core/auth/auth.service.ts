import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import Keycloak from 'keycloak-js';
import { firstValueFrom, timeout } from 'rxjs';
import { AuthConfig, parseAuthConfig } from './auth-config';
import { KEYCLOAK_FACTORY } from './keycloak-client';

export type AuthStatus = 'loading' | 'disabled' | 'unavailable' | 'anonymous' | 'authenticated';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly createClient = inject(KEYCLOAK_FACTORY);
  private readonly currentStatus = signal<AuthStatus>('loading');
  private readonly currentUser = signal('');
  private readonly currentMessage = signal<string | null>(null);
  private readonly actionPending = signal(false);
  private readonly registrationAllowed = signal(false);
  private client?: Keycloak;
  private initialization?: Promise<void>;

  readonly status = this.currentStatus.asReadonly();
  readonly displayName = this.currentUser.asReadonly();
  readonly message = this.currentMessage.asReadonly();
  readonly busy = this.actionPending.asReadonly();
  readonly authenticated = computed(() => this.status() === 'authenticated');
  readonly canSignIn = computed(() => this.status() === 'anonymous' && !this.busy());
  readonly canRegister = computed(() => this.canSignIn() && this.registrationAllowed());
  readonly registrationEnabled = this.registrationAllowed.asReadonly();

  initialize(): Promise<void> {
    this.initialization ??= this.initializeClient();
    return this.initialization;
  }

  retry(): void {
    window.location.reload();
  }

  async signIn(): Promise<void> {
    if (this.canSignIn()) {
      await this.perform((client) => client.login({ redirectUri: this.returnUri() }));
    }
  }

  async register(): Promise<void> {
    if (this.canRegister()) {
      await this.perform((client) => client.register({ redirectUri: this.returnUri() }));
    }
  }

  async signOut(): Promise<void> {
    if (this.authenticated() && !this.busy()) {
      await this.perform((client) => client.logout({ redirectUri: window.location.origin }));
    }
  }

  private async initializeClient(): Promise<void> {
    try {
      const value = await firstValueFrom(
        this.http.get<unknown>('/auth-config.json').pipe(timeout(5000)),
      );
      const config = parseAuthConfig(value);
      this.registrationAllowed.set(config.registrationEnabled);
      if (!config.enabled) {
        this.currentStatus.set('disabled');
        return;
      }
      const client = this.createClient({
        url: config.url,
        realm: config.realm,
        clientId: config.clientId,
      });
      this.client = client;
      client.onAuthSuccess = () => this.updateSession(client);
      client.onAuthRefreshSuccess = () => this.updateSession(client);
      client.onAuthLogout = () => this.clearSession();
      client.onTokenExpired = () => {
        void this.refreshSession(client);
      };

      await client.init({
        onLoad: 'check-sso',
        flow: 'standard',
        pkceMethod: 'S256',
        checkLoginIframe: false,
        silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
        silentCheckSsoFallback: false,
        messageReceiveTimeout: 5000,
        dpopConfig: this.dpopConfig(config),
      });
      this.updateSession(client);
    } catch {
      if (this.client) {
        await this.client.clearToken().catch(() => undefined);
      }
      this.currentUser.set('');
      this.currentStatus.set('unavailable');
      this.currentMessage.set('Sign-in is unavailable. You can still browse polls.');
    }
  }

  private dpopConfig(config: AuthConfig): { mode: 'strict' | 'auto' } | undefined {
    return config.dpopMode === 'off' ? undefined : { mode: config.dpopMode };
  }

  private updateSession(client: Keycloak): void {
    if (!client.authenticated) {
      this.clearSession();
      return;
    }
    const claims = client.idTokenParsed ?? client.tokenParsed;
    this.currentUser.set(claims?.['name'] ?? claims?.['preferred_username'] ?? 'Account');
    this.currentMessage.set(null);
    this.currentStatus.set('authenticated');
  }

  private clearSession(): void {
    this.currentUser.set('');
    this.currentStatus.set('anonymous');
  }

  private async refreshSession(client: Keycloak): Promise<void> {
    try {
      await client.updateToken(30);
      this.updateSession(client);
    } catch {
      await client.clearToken().catch(() => undefined);
      this.clearSession();
      this.currentMessage.set('Your session expired. Please sign in again.');
    }
  }

  private async perform(action: (client: Keycloak) => Promise<void>): Promise<void> {
    if (!this.client || this.busy()) return;
    this.actionPending.set(true);
    this.currentMessage.set(null);
    try {
      await action(this.client);
    } catch {
      this.currentMessage.set('The account action could not be completed. Please try again.');
    } finally {
      this.actionPending.set(false);
    }
  }

  private returnUri(): string {
    return window.location.origin + window.location.pathname;
  }
}
