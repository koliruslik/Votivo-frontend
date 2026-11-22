import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import Keycloak from 'keycloak-js';
import { firstValueFrom, timeout } from 'rxjs';
import { AuthConfig, parseAuthConfig } from './auth-config';
import { KEYCLOAK_FACTORY } from './keycloak-client';

export type AuthStatus = 'loading' | 'disabled' | 'unavailable' | 'anonymous' | 'authenticated';
export class SessionExpiredError extends Error {
  constructor() {
    super('Your session expired. Please sign in again.');
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly createClient = inject(KEYCLOAK_FACTORY);
  private readonly currentStatus = signal<AuthStatus>('loading');
  private readonly currentUser = signal('');
  private readonly currentMessage = signal<string | null>(null);
  private readonly actionPending = signal(false);
  private readonly registrationAllowed = signal(false);
  private readonly subject = signal('');
  private readonly admin = signal(false);
  private client?: Keycloak;
  private rejectedSession = false;
  private initialization?: Promise<void>;

  readonly status = this.currentStatus.asReadonly();
  readonly displayName = this.currentUser.asReadonly();
  readonly message = this.currentMessage.asReadonly();
  readonly busy = this.actionPending.asReadonly();
  readonly authenticated = computed(() => this.status() === 'authenticated');
  readonly canSignIn = computed(() => this.status() === 'anonymous' && !this.busy());
  readonly canRegister = computed(() => this.canSignIn() && this.registrationAllowed());
  readonly registrationEnabled = this.registrationAllowed.asReadonly();
  readonly userId = this.subject.asReadonly();
  readonly isAdmin = this.admin.asReadonly();

  async request(path: string, init: RequestInit): Promise<Response> {
    const url = new URL(path, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/v1/')) {
      throw new Error('API requests must use the same origin.');
    }
    if (!this.client || !this.authenticated()) return fetch(url, init);
    await this.refreshSession(this.client);
    if (!this.authenticated() || !this.client.token) throw new SessionExpiredError();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.client.token}`);
    return this.client.fetch(url, { ...init, headers });
  }

  async manageAccount(): Promise<void> {
    if (this.authenticated()) await this.perform((client) => client.accountManagement());
  }

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

      const initialization = client.init({
        onLoad: 'check-sso',
        flow: 'standard',
        pkceMethod: 'S256',
        checkLoginIframe: false,
        silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
        silentCheckSsoFallback: false,
        messageReceiveTimeout: 5000,
        dpopConfig: this.dpopConfig(config),
      });
      await this.withIdentityDeadline(initialization);
      this.updateSession(client);
    } catch {
      if (this.client) {
        this.client.onAuthSuccess = undefined;
        this.client.onAuthRefreshSuccess = undefined;
        this.client.onAuthLogout = undefined;
        this.client.onTokenExpired = undefined;
        void this.client.clearToken().catch(() => undefined);
        this.client = undefined;
      }
      this.currentUser.set('');
      this.subject.set('');
      this.admin.set(false);
      this.currentStatus.set('unavailable');
      this.currentMessage.set('Sign-in is unavailable. You can still browse polls.');
    }
  }

  private dpopConfig(config: AuthConfig): { mode: 'strict' | 'auto' } | undefined {
    return config.dpopMode === 'off' ? undefined : { mode: config.dpopMode };
  }

  private updateSession(client: Keycloak): void {
    if (this.rejectedSession) return;
    if (!client.authenticated) {
      this.clearSession();
      return;
    }
    const claims = client.idTokenParsed ?? client.tokenParsed;
    this.currentUser.set(claims?.['name'] ?? claims?.['preferred_username'] ?? 'Account');
    this.subject.set(client.tokenParsed?.sub ?? '');
    this.admin.set(client.hasRealmRole?.('admin') ?? false);
    this.currentMessage.set(null);
    this.currentStatus.set('authenticated');
  }

  private clearSession(): void {
    this.currentUser.set('');
    this.currentStatus.set('anonymous');
    this.subject.set('');
    this.admin.set(false);
  }

  private async refreshSession(client: Keycloak): Promise<void> {
    try {
      await this.withIdentityDeadline(client.updateToken(30));
      this.updateSession(client);
    } catch {
      this.rejectedSession = true;
      client.onAuthSuccess = undefined;
      client.onAuthRefreshSuccess = undefined;
      client.onTokenExpired = undefined;
      void client.clearToken().catch(() => undefined);
      this.clearSession();
      this.currentMessage.set('Your session expired. Please sign in again.');
    }
  }

  private async withIdentityDeadline<T>(operation: Promise<T>): Promise<T> {
    let deadline: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          deadline = setTimeout(() => reject(new Error('Sign-in connection timed out')), 8000);
        }),
      ]);
    } finally {
      clearTimeout(deadline!);
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
    const params = new URLSearchParams(window.location.search);
    const target = params.get('returnTo');
    const fallback = new URL(
      window.location.pathname + window.location.search,
      window.location.origin,
    );
    if (!target || !target.startsWith('/') || /[\\\u0000-\u0020]/.test(target))
      return fallback.href;
    const destination = new URL(target, window.location.origin);
    return destination.origin === window.location.origin ? destination.href : fallback.href;
  }
}
