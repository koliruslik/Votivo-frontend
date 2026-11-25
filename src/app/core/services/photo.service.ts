import { DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AuthService, SessionExpiredError } from '../auth/auth.service';

const PHOTO_PATH = '/api/v1/users/me/photo';

@Injectable({ providedIn: 'root' })
export class PhotoService {
  private readonly auth = inject(AuthService);
  private revision = 0;
  readonly url = signal<string | null>(null);
  readonly loading = signal(false);
  readonly pending = signal(false);
  readonly error = signal('');

  constructor() {
    effect(() => {
      const active = this.auth.authenticated() && !this.auth.isAdmin();
      this.auth.userId();
      untracked(() => {
        this.revision++;
        this.setPhoto(null);
        this.loading.set(false);
        this.pending.set(false);
        this.error.set('');
        if (active) void this.load();
      });
    });
    inject(DestroyRef).onDestroy(() => this.setPhoto(null));
  }

  async load(): Promise<void> {
    if (!this.auth.authenticated() || this.loading() || this.pending()) return;
    const owner = this.auth.userId();
    const revision = ++this.revision;
    this.loading.set(true);
    this.error.set('');
    try {
      const response = await this.auth.request(PHOTO_PATH, {
        method: 'GET',
        signal: AbortSignal.timeout(12000),
      });
      if (response.status === 404) {
        if (this.current(owner, revision)) this.setPhoto(null);
        return;
      }
      if (!response.ok) throw this.responseError(response.status);
      const blob = await response.blob();
      if (!['image/jpeg', 'image/png'].includes(blob.type) || !blob.size)
        throw new Error('Your photo could not be loaded. Try again.');
      if (this.current(owner, revision)) this.setPhoto(blob);
    } catch (error) {
      if (this.current(owner, revision)) this.error.set(this.message(error));
    } finally {
      if (this.current(owner, revision)) this.loading.set(false);
    }
  }

  async save(blob: Blob): Promise<void> {
    await this.mutate('PUT', blob);
  }

  async remove(): Promise<void> {
    await this.mutate('DELETE');
  }

  private async mutate(method: 'PUT' | 'DELETE', blob?: Blob): Promise<void> {
    if (!this.auth.authenticated()) throw new SessionExpiredError();
    if (this.pending()) throw new Error('Wait for the current photo change to finish.');
    const owner = this.auth.userId();
    const revision = ++this.revision;
    this.pending.set(true);
    this.loading.set(false);
    this.error.set('');
    const body = blob ? new FormData() : undefined;
    if (blob) body!.append('file', blob, 'profile.jpg');
    try {
      const response = await this.auth.request(PHOTO_PATH, {
        method,
        body,
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw this.responseError(response.status);
      if (!this.current(owner, revision)) throw new SessionExpiredError();
      this.setPhoto(blob ?? null);
    } catch (error) {
      const message = this.message(error);
      if (this.current(owner, revision)) this.error.set(message);
      throw new Error(message);
    } finally {
      if (this.current(owner, revision)) this.pending.set(false);
    }
  }

  private current(owner: string, revision: number): boolean {
    return this.auth.authenticated() && this.auth.userId() === owner && this.revision === revision;
  }

  private setPhoto(blob: Blob | null): void {
    const previous = this.url();
    this.url.set(blob ? URL.createObjectURL(blob) : null);
    if (previous) URL.revokeObjectURL(previous);
  }

  private responseError(status: number): Error {
    const messages: Record<number, string> = {
      400: 'This image could not be used. Choose another JPEG or PNG photo.',
      401: 'Your session expired. Please sign in again.',
      403: 'Your account cannot change this photo.',
      404: 'Your profile is unavailable. Refresh the page and try again.',
      413: 'This photo is too large. Choose a smaller image.',
      415: 'Choose a JPEG or PNG photo.',
    };
    return new Error(messages[status] ?? 'Could not update your photo. Please try again.');
  }

  private message(error: unknown): string {
    if (error instanceof SessionExpiredError) return error.message;
    if (error instanceof Error && error.name === 'Error') return error.message;
    return 'Cannot reach Votivo. Check your connection and try again.';
  }
}
