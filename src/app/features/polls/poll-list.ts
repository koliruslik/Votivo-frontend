import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Page, PollSummary } from '../../core/models/poll';
import { errorMessage, PollService } from '../../core/services/poll.service';
import { PollBadge } from './poll-badge';

@Component({
  imports: [RouterLink, DatePipe, PollBadge],
  template: `
    <div class="page-heading">
      <div>
        <p class="eyebrow">
          {{
            scope === 'mine' ? 'Your workspace' : scope === 'admin' ? 'Administration' : 'Community'
          }}
        </p>
        <h1>
          {{ scope === 'mine' ? 'My polls' : scope === 'admin' ? 'Moderation' : 'Explore polls' }}
        </h1>
        <p class="lede">
          {{
            scope === 'mine'
              ? 'From the first question to the final result.'
              : scope === 'admin'
                ? 'Review polls and manage community content.'
                : 'A good question starts a conversation. Add your voice.'
          }}
        </p>
      </div>
      @if (auth.authenticated()) {
        <a class="button primary" routerLink="/polls/new"
          ><span aria-hidden="true">＋</span> Create poll</a
        >
      }
    </div>
    <div class="toolbar panel">
      <label class="search"
        ><span aria-hidden="true">⌕</span
        ><input
          type="search"
          aria-label="Search loaded polls"
          placeholder="Search this page…"
          [value]="search()"
          (input)="search.set($any($event.target).value)"
      /></label>
      <div class="segmented" aria-label="Filter loaded polls">
        @for (item of filters; track item.value) {
          <button
            [class.selected]="filter() === item.value"
            [attr.aria-pressed]="filter() === item.value"
            (click)="filter.set(item.value)"
          >
            {{ item.label }}
          </button>
        }
      </div>
    </div>
    @if (error()) {
      <div class="notice error" role="alert">
        <div>
          <strong>Couldn’t load polls</strong>
          <p>{{ error() }}</p>
        </div>
        <button class="button" (click)="load(page())">Try again</button>
      </div>
    }
    @if (loading()) {
      <div class="poll-grid" aria-busy="true" aria-label="Loading polls">
        @for (n of [1, 2, 3, 4, 5, 6]; track n) {
          <div class="panel skeleton">
            <div></div>
            <div></div>
            <div></div>
          </div>
        }
      </div>
    } @else if (!error()) {
      <div class="list-meta">
        <span
          >{{ result()?.totalElements ?? 0 }}
          {{ scope === 'public' ? 'open polls' : 'polls' }}</span
        ><span>Newest first</span>
      </div>
      <div class="poll-grid">
        @for (poll of visible(); track poll.id) {
          <a class="panel poll-card" [routerLink]="['/polls', poll.id]">
            <div class="card-top">
              <app-poll-badge [status]="poll.status" [blocked]="poll.blocked" /><span
                class="meta"
                >{{ poll.accessType === 'LINK' ? 'Link only' : 'Public' }}</span
              >
            </div>
            <h2>{{ poll.title }}</h2>
            <p class="meta">
              {{ poll.anonymous ? 'Anonymous responses' : 'Account-based voting' }}
            </p>
            <div class="card-bottom">
              <time>{{ poll.createdAt | date: 'mediumDate' }}</time><span>{{
                poll.status === 'DRAFT'
                  ? 'View draft'
                  : poll.status === 'PUBLISHED'
                    ? 'View poll'
                    : 'View results'
              }}</span>
            </div>
          </a>
        } @empty {
          <div class="panel empty-state">
            <span class="empty-icon" aria-hidden="true">▤</span>
            <h2>
              {{ search() || filter() !== 'all' ? 'No matching polls' : 'No polls here yet' }}
            </h2>
            <p>
              {{
                search() || filter() !== 'all'
                  ? 'Try another search or clear the filters. Filters apply to this page.'
                  : scope === 'mine'
                    ? 'Create your first poll and invite people to take part.'
                    : 'New public polls will appear here when they are published.'
              }}
            </p>
            @if (search() || filter() !== 'all') {
              <button class="button" (click)="search.set(''); filter.set('all')">
                Clear filters
              </button>
            } @else if (auth.authenticated()) {
              <a class="button primary" routerLink="/polls/new">Create poll</a>
            }
          </div>
        }
      </div>
      @if ((result()?.totalPages ?? 0) > 1) {
        <nav class="pagination" aria-label="Poll pages">
          <button class="button" [disabled]="page() === 0" (click)="load(page() - 1)">
            Previous</button
          ><span>Page {{ page() + 1 }} of {{ result()?.totalPages }}</span
          ><button
            class="button"
            [disabled]="page() + 1 >= (result()?.totalPages ?? 0)"
            (click)="load(page() + 1)"
          >
            Next
          </button>
        </nav>
      }
    }
  `,
})
export class PollList {
  readonly auth = inject(AuthService);
  private readonly api = inject(PollService);
  readonly scope: 'public' | 'mine' | 'admin' =
    inject(ActivatedRoute).snapshot.data['scope'] ?? 'public';
  readonly result = signal<Page<PollSummary> | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly filter = signal('all');
  readonly page = signal(0);
  readonly filters =
    this.scope === 'public'
      ? [
          { value: 'all', label: 'All polls' },
          { value: 'anonymous', label: 'Anonymous' },
        ]
      : [
          { value: 'all', label: 'All' },
          { value: 'DRAFT', label: 'Drafts' },
          { value: 'PUBLISHED', label: 'Open' },
          { value: 'CLOSED', label: 'Closed' },
        ];
  readonly visible = computed(() =>
    (this.result()?.content ?? []).filter(
      (poll) =>
        poll.title.toLowerCase().includes(this.search().toLowerCase()) &&
        (this.filter() === 'all' ||
          (this.filter() === 'anonymous' ? poll.anonymous : poll.status === this.filter())),
    ),
  );
  constructor() {
    void this.load(0);
  }
  private requestVersion = 0;
  async load(page: number): Promise<void> {
    if (page < 0) return;
    const version = ++this.requestVersion;
    this.loading.set(true);
    this.error.set('');
    this.page.set(page);
    try {
      const result = await this.api.list(this.scope, page);
      if (version === this.requestVersion) this.result.set(result);
    } catch (error) {
      if (version === this.requestVersion) this.error.set(errorMessage(error));
    } finally {
      if (version === this.requestVersion) this.loading.set(false);
    }
  }
}
