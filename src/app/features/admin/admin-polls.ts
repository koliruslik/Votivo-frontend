import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Page, PollSummary } from '../../core/models/poll';
import { PollService, errorMessage } from '../../core/services/poll.service';
import { PollBadge } from '../polls/poll-badge';

@Component({
  imports: [DatePipe, RouterLink, PollBadge],
  styleUrl: './admin-users.css',
  template: `
    <section class="users-panel" aria-label="Poll management">
      @if (error()) {
        <div class="users-feedback" role="alert">
          <p>{{ error() }}</p>
          <button class="button" (click)="load()">Try again</button>
        </div>
      } @else if (loading()) {
        <p class="users-feedback" role="status">Loading polls…</p>
      } @else if (result(); as page) {
        <div class="users-meta">
          <h2>
            Polls <span>{{ page.totalElements }}</span>
          </h2>
          <button class="text-button" type="button" (click)="load()">Refresh</button>
        </div>
        @if (page.content.length) {
          <table class="users-table">
            <thead>
              <tr>
                <th scope="col">Poll</th>
                <th scope="col">Status</th>
                <th scope="col">Created</th>
                <th scope="col"><span class="sr-only">Review</span></th>
              </tr>
            </thead>
            <tbody>
              @for (poll of page.content; track poll.id) {
                <tr>
                  <td class="user-identity">
                    <a class="user-name" [routerLink]="['/admin/polls', poll.id]">{{
                      poll.title
                    }}</a>
                  </td>
                  <td><app-poll-badge [status]="poll.status" [blocked]="poll.blocked" /></td>
                  <td class="user-joined">{{ poll.createdAt | date: 'MMM d, y' }}</td>
                  <td class="user-action">
                    <a
                      class="button"
                      [routerLink]="['/admin/polls', poll.id]"
                      [attr.aria-label]="'Review ' + poll.title"
                      >Review</a
                    >
                  </td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <div class="users-empty"><h3>No polls yet</h3></div>
        }
        @if (page.totalPages > 1) {
          <nav class="users-pagination" aria-label="Poll list pages">
            <button class="button" [disabled]="page.page === 0" (click)="load(page.page - 1)">
              Previous
            </button>
            <span>Page {{ page.page + 1 }} of {{ page.totalPages }}</span>
            <button
              class="button"
              [disabled]="page.page + 1 >= page.totalPages"
              (click)="load(page.page + 1)"
            >
              Next
            </button>
          </nav>
        }
      }
    </section>
  `,
})
export class AdminPolls {
  private readonly api = inject(PollService);
  readonly result = signal<Page<PollSummary> | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  private generation = 0;
  constructor() {
    void this.load(this.api.adminPage);
    inject(DestroyRef).onDestroy(() => this.generation++);
  }
  async load(page = this.result()?.page ?? this.api.adminPage): Promise<void> {
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await this.api.list('admin', page);
      if (generation !== this.generation) return;
      if (!Array.isArray(result.content))
        throw new Error('Could not load polls. Please try again.');
      this.result.set(result);
      this.api.adminPage = result.page;
    } catch (error) {
      if (generation === this.generation) this.error.set(errorMessage(error));
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
}
