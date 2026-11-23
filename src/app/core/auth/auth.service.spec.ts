import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import Keycloak from 'keycloak-js';
import { App } from '../../app';
import { routes } from '../../app.routes';
import { AuthService, SessionExpiredError } from './auth.service';
import { parseAuthConfig } from './auth-config';
import { KEYCLOAK_FACTORY } from './keycloak-client';
import { PollService } from '../services/poll.service';

const config = {
  enabled: true,
  url: 'http://localhost:18080',
  realm: 'votivo',
  clientId: 'votivo-frontend',
  registrationEnabled: false,
  dpopMode: 'strict',
};

function makeClient() {
  return {
    authenticated: false,
    idTokenParsed: undefined as Record<string, string> | undefined,
    init: vi.fn().mockResolvedValue(false),
    login: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    clearToken: vi.fn().mockResolvedValue(undefined),
    updateToken: vi.fn().mockResolvedValue(true),
    token: 'test-access-token',
    fetch: vi.fn().mockImplementation(() => Promise.resolve(new Response('{}'))),
    onAuthSuccess: undefined as (() => void) | undefined,
    onAuthRefreshSuccess: undefined as (() => void) | undefined,
    onAuthLogout: undefined as (() => void) | undefined,
    onTokenExpired: undefined as (() => void) | undefined,
  };
}

describe('Keycloak account shell', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let client: ReturnType<typeof makeClient>;
  let factory: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = makeClient();
    factory = vi.fn(() => client as unknown as Keycloak);
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(routes),
        { provide: KEYCLOAK_FACTORY, useValue: factory },
        {
          provide: PollService,
          useValue: {
            list: vi.fn().mockResolvedValue({ content: [], totalElements: 0, totalPages: 0 }),
          },
        },
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function initialize(overrides: Record<string, unknown> = {}) {
    const first = auth.initialize();
    expect(auth.initialize()).toBe(first);
    http.expectOne('/auth-config.json').flush({ ...config, ...overrides });
    await first;
  }

  it('loads runtime settings and starts public SSO with PKCE and strict DPoP', async () => {
    await initialize();
    expect(factory).toHaveBeenCalledWith({
      url: config.url,
      realm: config.realm,
      clientId: config.clientId,
    });
    expect(client.init).toHaveBeenCalledWith(
      expect.objectContaining({
        onLoad: 'check-sso',
        flow: 'standard',
        pkceMethod: 'S256',
        dpopConfig: { mode: 'strict' },
        silentCheckSsoFallback: false,
      }),
    );
    expect(auth.status()).toBe('anonymous');
    expect(client.login).not.toHaveBeenCalled();
  });

  it('keeps polls visible and offers retry when Keycloak is unavailable', async () => {
    client.init.mockRejectedValue(new Error('Unavailable'));
    await initialize();
    expect(auth.status()).toBe('unavailable');
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/polls');
    await fixture.whenStable();
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    expect(page.textContent).toContain('No polls here yet');
    expect(page.textContent).toContain('Sign-in is unavailable');
    expect(page.textContent).toContain('Retry connection');
    expect(page.querySelector<HTMLButtonElement>('nav button')?.disabled).toBe(true);
  });

  it('handles missing runtime configuration without preventing bootstrap', async () => {
    const initialized = auth.initialize();
    http.expectOne('/auth-config.json').flush('Missing', { status: 404, statusText: 'Not Found' });
    await initialized;
    expect(auth.status()).toBe('unavailable');
    expect(factory).not.toHaveBeenCalled();
  });
  it('finishes bootstrap when the identity provider hangs and ignores late session callbacks', async () => {
    vi.useFakeTimers();
    try {
      client.init.mockImplementation(() => new Promise(() => {}));
      const initialized = auth.initialize();
      http.expectOne('/auth-config.json').flush(config);
      await vi.advanceTimersByTimeAsync(8001);
      await initialized;
      expect(auth.status()).toBe('unavailable');
      client.authenticated = true;
      client.onAuthSuccess?.();
      expect(auth.status()).toBe('unavailable');
      expect(auth.userId()).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('supports explicitly disabled authentication without contacting Keycloak', async () => {
    await initialize({ enabled: false });
    expect(auth.status()).toBe('disabled');
    expect(factory).not.toHaveBeenCalled();
  });

  it('shows sign in and disabled registration until self-registration is configured', async () => {
    await initialize();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll(
      'nav button',
    ) as NodeListOf<HTMLButtonElement>;
    expect(buttons[0].textContent).toContain('Sign in');
    expect(buttons[0].disabled).toBe(false);
    expect(buttons[1].textContent).toContain('Register');
    expect(buttons[1].disabled).toBe(true);
    await auth.register();
    expect(client.register).not.toHaveBeenCalled();
    buttons[0].click();
    await fixture.whenStable();
    expect(client.login).toHaveBeenCalledWith({
      redirectUri: window.location.origin + window.location.pathname,
    });
  });

  it('delegates enabled registration to Keycloak without a local credential form', async () => {
    await initialize({ registrationEnabled: true });
    await auth.register();
    expect(client.register).toHaveBeenCalledWith({
      redirectUri: window.location.origin + window.location.pathname,
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type=password]')).toBeNull();
  });

  it('shows the authenticated account and delegates logout to Keycloak', async () => {
    client.authenticated = true;
    client.idTokenParsed = { name: 'Test user', preferred_username: 'tester' };
    await initialize();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Test user');
    const button = fixture.nativeElement.querySelector('nav button') as HTMLButtonElement;
    expect(button.textContent).toContain('Sign out');
    button.click();
    await fixture.whenStable();
    expect(client.logout).toHaveBeenCalledWith({ redirectUri: window.location.origin });
  });

  it('clears the displayed session if token refresh fails', async () => {
    client.authenticated = true;
    client.updateToken.mockRejectedValue(new Error('Expired'));
    await initialize();
    client.onTokenExpired?.();
    await vi.waitFor(() => expect(auth.status()).toBe('anonymous'));
    expect(auth.displayName()).toBe('');
    expect(client.clearToken).toHaveBeenCalled();
    expect(auth.message()).toContain('session expired');
  });
  it('does not keep an API call pending indefinitely while token refresh hangs', async () => {
    client.authenticated = true;
    await initialize();
    vi.useFakeTimers();
    try {
      client.updateToken.mockImplementation(() => new Promise(() => {}));
      const outcome = auth.request('/api/v1/polls/mine', {}).catch((error) => error);
      await vi.advanceTimersByTimeAsync(8001);
      expect(await outcome).toBeInstanceOf(SessionExpiredError);
      expect(auth.authenticated()).toBe(false);
      expect(client.fetch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shares a failed refresh across concurrent requests and ignores late auth callbacks', async () => {
    client.authenticated = true;
    await initialize();
    let failRefresh!: (error: Error) => void;
    client.updateToken.mockImplementation(() => new Promise<boolean>((_resolve, reject) => {
      failRefresh = reject;
    }));
    const first = auth.request('/api/v1/polls/mine', { method: 'GET' }).catch((error) => error);
    const second = auth.request('/api/v1/polls', { method: 'GET' }).catch((error) => error);

    expect(client.updateToken).toHaveBeenCalledTimes(1);
    failRefresh(new Error('Expired'));
    const outcomes = await Promise.all([first, second]);

    expect(outcomes.every((error) => error instanceof SessionExpiredError)).toBe(true);
    expect(client.fetch).not.toHaveBeenCalled();
    expect(client.clearToken).toHaveBeenCalledTimes(1);
    expect(auth.status()).toBe('anonymous');
    expect(auth.userId()).toBe('');

    client.authenticated = true;
    client.idTokenParsed = { name: 'Late user' };
    client.onAuthSuccess?.();
    client.onAuthRefreshSuccess?.();
    expect(auth.status()).toBe('anonymous');
    expect(auth.displayName()).toBe('');
  });


  it('retains the authenticated session when an API call returns 403', async () => {
    client.authenticated = true;
    await initialize();
    client.fetch.mockResolvedValue(new Response('{}', { status: 403 }));

    const response = await auth.request('/api/v1/polls/mine', { method: 'GET' });

    expect(response.status).toBe(403);
    expect(auth.authenticated()).toBe(true);
    expect(auth.status()).toBe('authenticated');
    expect(client.clearToken).not.toHaveBeenCalled();
  });


  it('shares refresh across concurrent API calls and sends the refreshed token', async () => {
    client.authenticated = true;
    await initialize();
    let finishRefresh!: (value: boolean) => void;
    client.updateToken.mockImplementation(() => new Promise<boolean>((resolve) => {
      finishRefresh = resolve;
    }));
    const first = auth.request('/api/v1/polls/mine', { method: 'GET' });
    const second = auth.request('/api/v1/polls', { method: 'GET' });
    expect(client.updateToken).toHaveBeenCalledTimes(1);
    expect(client.updateToken).toHaveBeenCalledWith(30);
    expect(client.fetch).not.toHaveBeenCalled();
    client.token = 'refreshed-access-token';
    finishRefresh(true);
    await Promise.all([first, second]);
    expect(client.fetch).toHaveBeenCalledTimes(2);
    for (const [, options] of client.fetch.mock.calls) {
      expect(options.headers.get('Authorization')).toBe('Bearer refreshed-access-token');
    }
  });


  it('ends a rejected session without replaying a modifying request', async () => {
    client.authenticated = true;
    await initialize();
    client.fetch.mockResolvedValue(new Response('{}', { status: 401 }));
    await expect(auth.request('/api/v1/polls', { method: 'POST', body: '{}' }))
      .rejects.toBeInstanceOf(SessionExpiredError);
    expect(client.fetch).toHaveBeenCalledTimes(1);
    expect(client.clearToken).toHaveBeenCalled();
    expect(auth.status()).toBe('anonymous');
    expect(auth.message()).toContain('session expired');
  });


  it('reports redirect errors and allows a subsequent sign-in attempt', async () => {
    await initialize();
    client.login.mockRejectedValueOnce(new Error('Redirect blocked'));
    await auth.signIn();
    expect(auth.busy()).toBe(false);
    expect(auth.message()).toContain('could not be completed');
    await auth.signIn();
    expect(client.login).toHaveBeenCalledTimes(2);
    expect(auth.message()).toBeNull();
  });

  it('blocks duplicate account actions while a redirect is pending', async () => {
    await initialize();
    let complete!: () => void;
    client.login.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const pending = auth.signIn();
    await auth.signIn();
    expect(client.login).toHaveBeenCalledTimes(1);
    expect(auth.busy()).toBe(true);
    complete();
    await pending;
    expect(auth.busy()).toBe(false);
  });

  it('uses the adapter for authenticated API calls and rejects foreign destinations', async () => {
    client.authenticated = true;
    await initialize();
    await auth.request('/api/v1/polls/mine', { method: 'GET' });
    expect(client.updateToken).toHaveBeenCalledWith(30);
    const [url, options] = client.fetch.mock.calls[0];
    expect(url.origin).toBe(window.location.origin);
    expect(options.headers.get('Authorization')).toBe('Bearer test-access-token');
    await expect(auth.request('https://other.example/api/v1/polls', {})).rejects.toThrow();
    expect(client.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns to a local protected page after sign-in and refuses an external return URL', async () => {
    await initialize();
    const original = window.location.href;
    try {
      window.history.replaceState({}, '', '/account?returnTo=%2Fpolls%2Fnew');
      await auth.signIn();
      expect(client.login).toHaveBeenLastCalledWith({
        redirectUri: window.location.origin + '/polls/new',
      });
      window.history.replaceState({}, '', '/account?returnTo=%2F%09%2Fother.example');
      await auth.signIn();
      expect(new URL(client.login.mock.lastCall![0].redirectUri).origin).toBe(
        window.location.origin,
      );
    } finally {
      window.history.replaceState({}, '', original);
    }
  });

  it('rejects malformed configuration instead of creating an incorrect auth client', () => {
    expect(() => parseAuthConfig({ ...config, url: 'javascript:alert(1)' })).toThrow();
    expect(() => parseAuthConfig({ ...config, registrationEnabled: 'false' })).toThrow();
    expect(() => parseAuthConfig({ ...config, dpopMode: 'anything' })).toThrow();
  });
});
