import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService', () => {
  const request = vi.fn();
  const isAdmin = vi.fn(() => true);
  let service: AdminUsersService;
  beforeEach(() => {
    request.mockReset();
    isAdmin.mockReturnValue(true);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            request,
            authenticated: () => true,
            isAdmin,
          },
        },
      ],
    });
    service = TestBed.inject(AdminUsersService);
  });
  it('sends server-side search, pagination and status filtering', async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ items: [], page: 2, totalPages: 3 })));
    await service.list(' Ada & Bob ', 'blocked', 2);
    const url = new URL(request.mock.lastCall![0], 'http://localhost');
    expect(url.pathname).toBe('/api/v1/admin/users');
    expect(url.searchParams.get('search')).toBe('Ada & Bob');
    expect(url.searchParams.get('enabled')).toBe('false');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('size')).toBe('20');
  });
  it('changes only the enabled flag using PATCH', async () => {
    request.mockResolvedValue(new Response(JSON.stringify({ enabled: false })));
    await service.setEnabled('user-id', false);
    expect(request).toHaveBeenCalledWith(
      '/api/v1/admin/users/user-id/status',
      expect.objectContaining({
        method: 'PATCH',
        body: '{"enabled":false}',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  it('refuses access without the administrator role', async () => {
    isAdmin.mockReturnValue(false);
    await expect(service.list('', 'all', 0)).rejects.toThrow('Administrator access');
    expect(request).not.toHaveBeenCalled();
  });
  it('shows a safe error on forbidden operations', async () => {
    request.mockResolvedValue(new Response('private upstream details', { status: 403 }));
    await expect(service.setEnabled('id', false)).rejects.toThrow('not permitted');
  });
});
