import { TestBed } from '@angular/core/testing';
import { AuthService, SessionExpiredError } from '../auth/auth.service';
import { ApiError, PollService } from './poll.service';

describe('Poll API contract', () => {
  let api: PollService;
  const request = vi.fn();
  beforeEach(() => {
    request.mockReset();
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { request } }],
    });
    api = TestBed.inject(PollService);
  });
  it('uses server pagination for personal polls', async () => {
    request.mockResolvedValue(
      new Response(JSON.stringify({ content: [], page: 2, totalPages: 3 })),
    );
    await api.list('mine', 2);
    expect(request).toHaveBeenCalledWith(
      '/api/v1/polls/mine?page=2&size=12',
      expect.objectContaining({ method: 'GET' }),
    );
  });
  it('submits UUID answers using the vote service contract and PUT for a change', async () => {
    request.mockImplementation(() => Promise.resolve(new Response('{}')));
    const answers = [{ question_id: 'q', option_ids: ['o'] }];
    await api.vote('p', answers, true);
    expect(request).toHaveBeenCalledWith(
      '/api/v1/polls/p/vote',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ answers }) }),
    );
  });
  it('carries link access only on that poll’s vote and result requests', async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ id: 'private-poll' })));
    await api.byLink('secret-link');
    request.mockImplementation(() => Promise.resolve(new Response('{}')));
    await api.results('private-poll');
    await api.results('public-poll');
    expect(request.mock.calls[1][0]).toBe(
      '/api/v1/polls/private-poll/results?shareToken=secret-link',
    );
    expect(request.mock.calls[2][0]).toBe('/api/v1/polls/public-poll/results');
  });
  it('accepts an empty successful delete response', async () => {
    request.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.remove('p')).resolves.toBeUndefined();
  });
  it('reports session expiration separately from a connection failure', async () => {
    request.mockRejectedValue(new SessionExpiredError());
    await expect(api.list('mine')).rejects.toMatchObject({
      status: 401,
      message: expect.stringContaining('session expired'),
    });
  });
  it('does not show a JSON parser error when a proxy returns an HTML page', async () => {
    request.mockResolvedValue(new Response('<html>Unavailable</html>'));
    await expect(api.list('public')).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining('unexpected response'),
    });
  });
  it('distinguishes a duplicate vote from a service outage without exposing internal errors', async () => {
    request.mockResolvedValue(new Response('database password: private', { status: 409 }));
    await expect(api.vote('p', [], false)).rejects.toMatchObject({ status: 409 });
    request.mockRejectedValue(new Error('offline'));
    await expect(api.results('p')).rejects.toBeInstanceOf(ApiError);
  });
});
