import { inject, Injectable } from '@angular/core';
import { AuthService, UserProfile, SessionExpiredError } from '../auth/auth.service';

export interface UserPage {
  items: UserProfile[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  view = { search: '', status: 'all', page: 0 };
  private readonly auth = inject(AuthService);

  list(search: string, status: string, page: number, signal?: AbortSignal): Promise<UserPage> {
    const params = new URLSearchParams({ page: String(page), size: '20' });
    if (search.trim()) params.set('search', search.trim());
    if (status !== 'all') params.set('enabled', String(status === 'active'));
    return this.request<UserPage>(`?${params}`, { method: 'GET', signal });
  }

  setEnabled(id: string, enabled: boolean): Promise<UserProfile> {
    return this.request(`/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
  }

  private async request<T>(suffix: string, init: RequestInit): Promise<T> {
    if (!this.auth.authenticated()) throw new SessionExpiredError();
    if (!this.auth.isAdmin()) throw new Error('Administrator access is required.');
    const response = await this.auth.request(`/api/v1/admin/users${suffix}`, {
      ...init,
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      const messages: Record<number, string> = {
        400: 'Check the search and try again.',
        403: 'This action is not permitted. Your administrator access may have changed.',
        404: 'This account is no longer available. Refresh the list.',
        409: 'This account changed. Refresh the list and try again.',
        503: 'User management is temporarily unavailable. Please try again.',
      };
      throw new Error(
        messages[response.status] ?? 'Could not load or update users. Please try again.',
      );
    }
    return response.json();
  }
}
