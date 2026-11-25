import { HttpClient } from '@angular/common/http';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import Keycloak from 'keycloak-js';
import { firstValueFrom, timeout } from 'rxjs';
import { AuthConfig, parseAuthConfig } from './auth-config';
import { KEYCLOAK_FACTORY } from './keycloak-client';

export type AuthStatus = 'loading' | 'disabled' | 'unavailable' | 'anonymous' | 'authenticated';
export interface UserProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  emailVerified: boolean;
  enabled: boolean;
  roles: string[];
  createdAt: string | null;
  updatedAt: string;
}
export class SessionExpiredError extends Error {
  constructor() {
    super('Your session expired. Please sign in again.');
  }
}
export class AccountAccessDeniedError extends Error {
  constructor() {
    super('Your account is blocked or this session has been revoked. Sign in again or contact an administrator.');
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
  readonly passwordChangeMessage = signal<string | null>(null);
  readonly emailChangeMessage = signal<string | null>(null);
  readonly profile = signal<UserProfile | null>(null);
  readonly profileLoading = signal(false);
  readonly profileError = signal<string | null>(null);
  private sessionVersion = 0;
  private readonly subject = signal('');
  private readonly admin = signal(false);
  private readonly accountRestriction = signal(false);
  private client?: Keycloak;
  private rejectedSession = false;
  private initialization?: Promise<void>;
  private refreshPending?: Promise<void>;

  readonly status = this.currentStatus.asReadonly();
  readonly displayName = this.currentUser.asReadonly();
  readonly initials = computed(() =>
    this.displayName()
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => Array.from(part)[0])
      .join('')
      .toLocaleUpperCase(),
  );
  readonly message = this.currentMessage.asReadonly();
  readonly busy = this.actionPending.asReadonly();
  readonly authenticated = computed(() => this.status() === 'authenticated');
  readonly canSignIn = computed(() => this.status() === 'anonymous' && !this.busy());
  readonly canRegister = computed(() => this.canSignIn() && this.registrationAllowed());
  readonly registrationEnabled = this.registrationAllowed.asReadonly();
  readonly userId = this.subject.asReadonly();
  readonly isAdmin = this.admin.asReadonly();
  readonly accountRestricted = this.accountRestriction.asReadonly();

  constructor() {
    const recheck = () => {
      if (this.authenticated() && !document.hidden) void this.refreshHeader();
    };
    const timer = setInterval(recheck, 30_000);
    document.addEventListener('visibilitychange', recheck);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', recheck);
    });
  }

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
    const response = await this.client.fetch(url, { ...init, headers });
    if (response.status === 403 && response.headers.get('X-Account-Access') === 'denied') {
      const error = new AccountAccessDeniedError();
      this.accountRestriction.set(true);
      this.expireSession(this.client, error.message);
      throw error;
    }
    if (response.status === 401) {
      this.expireSession(this.client);
      throw new SessionExpiredError();
    }
    return response;
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

  async changePassword(): Promise<void> {
    if (!this.authenticated() || this.busy()) return;
    this.passwordChangeMessage.set(null);
    await this.perform((client) =>
      client.login({
        action: 'UPDATE_PASSWORD',
        redirectUri: `${window.location.origin}/account?section=security`,
      }),
    );
  }

  async changeEmail(): Promise<void> {
    if (!this.authenticated() || this.busy()) return;
    this.emailChangeMessage.set(null);
    await this.perform((client) =>
      client.login({
        action: 'UPDATE_EMAIL',
        redirectUri: `${window.location.origin}/account?section=profile`,
      }),
    );
  }

  private applyName(value: { firstName: string | null; lastName: string | null }): void {
    if (
      ![value.firstName, value.lastName].every((name) => name === null || typeof name === 'string')
    )
      throw new Error('Invalid profile response');
    this.currentUser.set(
      [value.firstName, value.lastName].filter(Boolean).join(' ').trim() || 'Account',
    );
  }

  async refreshHeader(): Promise<void> {
    const version = this.sessionVersion;
    try {
      const response = await this.request('/api/v1/users/me/header', {
        method: 'GET',
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error('Profile unavailable');
      const header = await response.json();
      if (this.authenticated() && version === this.sessionVersion) this.applyName(header);
    } catch {
      /* Identity stays generic; never substitute stale token profile claims. */
    }
  }

  async loadProfile(): Promise<void> {
    if (!this.authenticated() || this.profileLoading()) return;
    const version = this.sessionVersion;
    this.profileLoading.set(true);
    this.profileError.set(null);
    try {
      const response = await this.request('/api/v1/users/me', {
        method: 'GET',
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error();
      const profile = await response.json();
      if (this.authenticated() && version === this.sessionVersion) this.applyProfile(profile);
    } catch {
      if (version === this.sessionVersion)
        this.profileError.set('Cannot load your profile. Please try again.');
    } finally {
      if (version === this.sessionVersion) this.profileLoading.set(false);
    }
  }

  async saveProfile(firstName: string, lastName: string): Promise<void> {
    if (!this.authenticated()) throw new SessionExpiredError();
    const version = this.sessionVersion;
    const response = await this.request('/api/v1/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok)
      throw new Error(
        response.status === 400
          ? 'Check your first and last name.'
          : 'Could not save your profile. Please try again.',
      );
    const profile = await response.json();
    if (!this.authenticated() || version !== this.sessionVersion) throw new SessionExpiredError();
    this.applyProfile(profile);
  }

  async deleteAccount(): Promise<void> {
    if (!this.authenticated()) throw new SessionExpiredError();
    if (this.isAdmin() || this.profile()?.roles.includes('admin'))
      throw new Error('Administrator accounts can only be deleted in Keycloak.');
    if (this.busy()) throw new Error('Wait for the current account action to finish.');
    const version = this.sessionVersion;
    this.actionPending.set(true);
    try {
      const response = await this.request('/api/v1/users/me', {
        method: 'DELETE',
        signal: AbortSignal.timeout(50000),
      });
      if (!response.ok) {
        const messages: Record<number, string> = {
          403: 'A blocked account cannot be deleted.',
          409: 'Close your published polls before deleting your account. Drafts can stay.',
          503: 'Account deletion is temporarily unavailable. Please try again later.',
        };
        throw new Error(
          messages[response.status] ?? 'Could not delete your account. Please try again.',
        );
      }
      if (!this.authenticated() || version !== this.sessionVersion) throw new SessionExpiredError();
      this.rejectedSession = true;
      this.clearSession();
      try {
        await this.client?.clearToken();
      } catch {
        /* Local session is already cleared. */
      }
    } finally {
      this.actionPending.set(false);
    }
  }

  private applyProfile(profile: UserProfile): void {
    if (
      typeof profile.id !== 'string' ||
      typeof profile.emailVerified !== 'boolean' ||
      !(profile.email === null || typeof profile.email === 'string')
    )
      throw new Error('Invalid profile response');
    this.applyName(profile);
    this.profile.set(profile);
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
      client.onActionUpdate = (status, action) => {
        if (action === 'UPDATE_EMAIL') {
          this.emailChangeMessage.set(
            status === 'success'
              ? 'Email update completed. Refresh your profile if the change is not visible yet.'
              : status === 'cancelled'
                ? 'Email change cancelled.'
                : 'Email change could not be completed. Please try again.',
          );
          return;
        }
        if (action !== 'UPDATE_PASSWORD') return;
        this.passwordChangeMessage.set(
          status === 'success'
            ? 'Your password has been changed.'
            : status === 'cancelled'
              ? 'Password change cancelled.'
              : 'Password change could not be completed. Please try again.',
        );
      };
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
      if (this.authenticated()) await this.refreshHeader();
    } catch {
      if (this.client) {
        this.client.onActionUpdate = undefined;
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
    if (!this.currentUser()) this.currentUser.set('Account');
    this.subject.set(client.tokenParsed?.sub ?? '');
    this.admin.set(client.hasRealmRole?.('admin') ?? false);
    this.currentMessage.set(null);
    this.currentStatus.set('authenticated');
  }

  private clearSession(): void {
    this.sessionVersion++;
    this.profile.set(null);
    this.profileLoading.set(false);
    this.profileError.set(null);
    this.currentUser.set('');
    this.currentStatus.set('anonymous');
    this.subject.set('');
    this.admin.set(false);
  }

  private refreshSession(client: Keycloak): Promise<void> {
    if (this.rejectedSession) return Promise.resolve();
    this.refreshPending ??= this.performRefresh(client).finally(() => {
      this.refreshPending = undefined;
    });
    return this.refreshPending;
  }

  private async performRefresh(client: Keycloak): Promise<void> {
    try {
      await this.withIdentityDeadline(client.updateToken(30));
      this.updateSession(client);
    } catch {
      this.expireSession(client);
    }
  }

  private expireSession(client: Keycloak, message = 'Your session expired. Please sign in again.'): void {
    this.rejectedSession = true;
    client.onAuthSuccess = undefined;
    client.onAuthRefreshSuccess = undefined;
    client.onTokenExpired = undefined;
    void client.clearToken().catch(() => undefined);
    this.clearSession();
    this.currentMessage.set(message);
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
