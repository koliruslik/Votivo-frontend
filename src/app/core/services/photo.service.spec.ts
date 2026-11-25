import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { PhotoService } from './photo.service';

describe('PhotoService', () => {
  const active = signal(true),
    owner = signal('owner-one');
  const request = vi.fn();
  let service: PhotoService;
  let serial = 0;
  beforeEach(() => {
    active.set(true);
    owner.set('owner-one');
    request.mockReset();
    serial = 0;
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = vi.fn(() => 'blob:photo-' + ++serial);
        static override revokeObjectURL = vi.fn();
      },
    );
    request.mockResolvedValue(new Response(null, { status: 404 }));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { authenticated: active, isAdmin: () => false, userId: owner, request },
        },
      ],
    });
    service = TestBed.inject(PhotoService);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  async function initialize() {
    TestBed.tick();
    await Promise.resolve();
    await Promise.resolve();
  }
  const photo = () => new Blob(['photo'], { type: 'image/jpeg' });

  it('loads authenticated binary images and treats missing photos as empty', async () => {
    await initialize();
    expect(service.url()).toBeNull();
    expect(service.error()).toBe('');
    request.mockResolvedValue(new Response('photo', { headers: { 'Content-Type': 'image/jpeg' } }));
    await service.load();
    expect(service.url()).toBe('blob:photo-1');
    expect(request).toHaveBeenLastCalledWith(
      '/api/v1/users/me/photo',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('uploads multipart without setting a content-type and revokes replaced URLs', async () => {
    await initialize();
    request.mockResolvedValue(new Response(null, { status: 204 }));
    await service.save(photo());
    const options = request.mock.lastCall![1];
    expect(options.method).toBe('PUT');
    expect(options.headers).toBeUndefined();
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get('file').name).toBe('profile.jpg');
    await service.save(photo());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo-1');
    expect(service.url()).toBe('blob:photo-2');
    await service.remove();
    expect(service.url()).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo-2');
  });

  it('keeps the current image after failed replacement or deletion', async () => {
    await initialize();
    request.mockResolvedValue(new Response(null, { status: 204 }));
    await service.save(photo());
    request.mockResolvedValue(new Response(null, { status: 413 }));
    await expect(service.save(photo())).rejects.toThrow('too large');
    expect(service.url()).toBe('blob:photo-1');
    request.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(service.remove()).rejects.toThrow('Could not update');
    expect(service.url()).toBe('blob:photo-1');
    expect(service.pending()).toBe(false);
  });

  it('ignores stale reads after a successful mutation', async () => {
    await initialize();
    let finish!: (response: Response) => void;
    request.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const loading = service.load();
    request.mockResolvedValue(new Response(null, { status: 204 }));
    await service.save(photo());
    finish(new Response('photo', { headers: { 'Content-Type': 'image/jpeg' } }));
    await loading;
    expect(service.url()).toBe('blob:photo-1');
  });

  it('clears photo on logout and ignores an upload finishing under another owner', async () => {
    await initialize();
    request.mockResolvedValue(new Response(null, { status: 204 }));
    await service.save(photo());
    let finish!: (response: Response) => void;
    request.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const saving = service.save(photo());
    active.set(false);
    TestBed.tick();
    expect(service.url()).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo-1');
    finish(new Response(null, { status: 204 }));
    await expect(saving).rejects.toThrow('session expired');
    expect(service.url()).toBeNull();
  });
});
