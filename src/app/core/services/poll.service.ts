import { inject, Injectable } from '@angular/core';
import { AuthService, SessionExpiredError } from '../auth/auth.service';
import {
  Page,
  Poll,
  PollInput,
  PollResult,
  PollSummary,
  VoteAnswer,
  VoteStatus,
} from '../models/poll';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

@Injectable({ providedIn: 'root' })
export class PollService {
  private readonly auth = inject(AuthService);
  adminPage = 0;
  private readonly shareTokens = new Map<string, string>();
  list(scope: 'public' | 'mine' | 'admin', page = 0): Promise<Page<PollSummary>> {
    const path = scope === 'admin' ? '/admin/polls' : scope === 'mine' ? '/polls/mine' : '/polls';
    return this.request(`${path}?page=${page}&size=12`);
  }
  get(id: string): Promise<Poll> {
    return this.request(`/polls/${encodeURIComponent(id)}`);
  }
  async byLink(token: string): Promise<Poll> {
    const poll = await this.request<Poll>(`/polls/by-link/${encodeURIComponent(token)}`);
    this.shareTokens.set(poll.id, token);
    return poll;
  }
  save(input: PollInput, id?: string): Promise<Poll> {
    return this.request(id ? `/polls/${id}` : '/polls', id ? 'PUT' : 'POST', input);
  }
  action(id: string, action: 'publish' | 'close' | 'archive' | 'block'): Promise<Poll> {
    return this.request(`${action === 'block' ? '/admin' : ''}/polls/${id}/${action}`, 'POST');
  }
  remove(id: string): Promise<void> {
    return this.request(`/polls/${id}`, 'DELETE');
  }
  voteStatus(id: string): Promise<VoteStatus> {
    return this.request(`/polls/${id}/vote`);
  }
  vote(id: string, answers: VoteAnswer[], change: boolean): Promise<void> {
    return this.request(`/polls/${id}/vote`, change ? 'PUT' : 'POST', { answers });
  }
  revoke(id: string): Promise<void> {
    return this.request(`/polls/${id}/vote`, 'DELETE');
  }
  results(id: string): Promise<PollResult> {
    return this.request(`/polls/${id}/results`);
  }
  private async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const scoped = /^\/polls\/([^/]+)\/(?:vote|results)$/.exec(path);
    const shareToken = scoped && this.shareTokens.get(scoped[1]);
    if (shareToken) path += `?shareToken=${encodeURIComponent(shareToken)}`;
    let response: Response;
    try {
      response = await this.auth.request(`/api/v1${path}`, {
        method,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      if (error instanceof SessionExpiredError) throw new ApiError(401, error.message);
      throw new ApiError(0, 'Cannot reach Votivo. Check your connection and try again.');
    }
    if (!response.ok) {
      const messages: Record<number, string> = {
        400: 'Check the form and try again.',
        401: 'Please sign in to continue.',
        403: 'You do not have permission to do this.',
        404: 'This poll or vote is not available.',
        409: 'This poll or vote has changed. Refresh the page before trying again.',
        422: 'Please answer every question using the available options.',
        502: 'A Votivo service is unavailable. Please try again shortly.',
        503: 'A Votivo service is unavailable. Please try again shortly.',
      };
      throw new ApiError(
        response.status,
        messages[response.status] ?? 'The request could not be completed. Please try again.',
      );
    }
    if (response.status === 204) return undefined as T;
    try {
      return (await response.json()) as T;
    } catch {
      throw new ApiError(502, 'Votivo returned an unexpected response. Please try again.');
    }
  }
}
