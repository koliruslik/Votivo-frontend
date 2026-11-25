import { DatePipe } from '@angular/common';
import {
  Component,
  ElementRef,
  ViewChild,
  effect,
  inject,
  signal,
  untracked,
  DestroyRef,
} from '@angular/core';
import { AuthService, UserProfile } from '../../core/auth/auth.service';
import { AdminUsersService, UserPage } from '../../core/services/admin-users.service';

@Component({
  imports: [DatePipe],
  templateUrl: './admin-users.html',
  styleUrl: './admin-users.css',
})
export class AdminUsers {
  readonly auth = inject(AuthService);
  private readonly users = inject(AdminUsersService);
  readonly result = signal<UserPage | null>(null);
  readonly query = signal(this.users.view.search);
  readonly status = signal(this.users.view.status);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly selected = signal<UserProfile | null>(null);
  readonly updating = signal(false);
  readonly actionError = signal('');
  @ViewChild('confirmation', { static: true }) private confirmation!: ElementRef<HTMLDialogElement>;
  private request?: AbortController;
  private revision = 0;
  private appliedSearch = this.users.view.search;

  constructor() {
    effect(() => {
      const allowed = this.auth.authenticated() && this.auth.isAdmin();
      this.auth.userId();
      untracked(() => {
        this.request?.abort();
        this.result.set(null);
        this.selected.set(null);
        this.confirmation?.nativeElement.close();
        if (allowed) void this.load(this.users.view.page);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.revision++;
      this.request?.abort();
    });
  }

  search(): void {
    this.appliedSearch = this.query().trim();
    void this.load(0);
  }

  async load(page = this.result()?.page ?? 0): Promise<void> {
    if (!this.auth.authenticated() || !this.auth.isAdmin()) return;
    this.request?.abort();
    const request = (this.request = new AbortController());
    const revision = ++this.revision;
    const owner = this.auth.userId();
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await this.users.list(this.appliedSearch, this.status(), page, request.signal);
      if (!this.current(revision, owner)) return;
      if (!Array.isArray(result.items)) throw new Error('Could not load users. Please try again.');
      if (page > 0 && !result.items.length) {
        void this.load(page - 1);
        return;
      }
      this.result.set(result);
      this.users.view = { search: this.appliedSearch, status: this.status(), page: result.page };
    } catch (error) {
      if (!request.signal.aborted && this.current(revision, owner))
        this.error.set(
          error instanceof Error && error.name === 'Error'
            ? error.message
            : 'Could not load users. Check your connection and try again.',
        );
    } finally {
      if (revision === this.revision) this.loading.set(false);
    }
  }

  name(user: UserProfile): string {
    return [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || 'Unnamed user';
  }

  openAction(user: UserProfile): void {
    if (user.id === this.auth.userId() || this.updating()) return;
    this.selected.set(user);
    this.actionError.set('');
    this.confirmation.nativeElement.showModal();
  }

  async changeStatus(): Promise<void> {
    const user = this.selected();
    if (!user || this.updating() || user.id === this.auth.userId()) return;
    const owner = this.auth.userId();
    this.updating.set(true);
    this.actionError.set('');
    try {
      const updated = await this.users.setEnabled(user.id, !user.enabled);
      if (!this.auth.authenticated() || !this.auth.isAdmin() || this.auth.userId() !== owner)
        return;
      // Apply confirmed state immediately, then reconcile filtering and pagination with the server.
      this.result.update((page) =>
        page
          ? { ...page, items: page.items.map((item) => (item.id === updated.id ? updated : item)) }
          : page,
      );
      this.confirmation.nativeElement.close();
      this.selected.set(null);
      await this.load();
    } catch (error) {
      if (this.auth.authenticated() && this.auth.userId() === owner)
        this.actionError.set(
          error instanceof Error && error.name === 'Error'
            ? error.message
            : 'Could not update this account. Please try again.',
        );
    } finally {
      this.updating.set(false);
    }
  }

  private current(revision: number, owner: string): boolean {
    return (
      revision === this.revision &&
      this.auth.authenticated() &&
      this.auth.isAdmin() &&
      this.auth.userId() === owner
    );
  }
}
