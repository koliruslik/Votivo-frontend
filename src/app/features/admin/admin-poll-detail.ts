import { DatePipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Poll } from '../../core/models/poll';
import { PollService, errorMessage } from '../../core/services/poll.service';
import { PollBadge } from '../polls/poll-badge';

@Component({
  imports: [DatePipe, RouterLink, PollBadge],
  template: `
    <a class="back-link" routerLink="/admin/polls">Back to polls</a>
    @if (loading()) {
      <p role="status">Loading poll…</p>
    } @else if (error()) {
      <div role="alert">
        <p>{{ error() }}</p>
        <button class="button" (click)="load()">Try again</button>
      </div>
    } @else if (poll(); as item) {
      <article class="review-panel">
        <header class="review-heading">
          <div>
            <app-poll-badge [status]="item.status" [blocked]="item.blocked" />
            <h2>{{ item.title }}</h2>
            <p class="muted">{{ item.createdAt | date: 'MMM d, y' }}</p>
            @if (item.endsAt) {
              <p class="muted">Scheduled end {{ item.endsAt | date: 'medium' }}</p>
            }
          </div>
          @if (!item.blocked) {
            <button class="button block-button" (click)="openBlock()">Block poll</button>
          }
        </header>
        @if (item.description) {
          <p class="description">{{ item.description }}</p>
        }
        @for (question of item.questions; track question.id; let index = $index) {
          <section class="review-question">
            <h3>{{ index + 1 }}. {{ question.text }}</h3>
            <p class="muted">
              {{ question.type === 'MULTIPLE' ? 'Multiple choice' : 'Single choice' }}
            </p>
            <ul>
              @for (option of question.options; track option.id) {
                <li>{{ option.text }}</li>
              }
            </ul>
          </section>
        }
      </article>
    }
    <dialog
      #confirmation
      class="confirm-dialog"
      aria-labelledby="block-poll-title"
      (cancel)="blocking() ? $event.preventDefault() : null"
    >
      <h2 id="block-poll-title">Block this poll?</h2>
      <p>The poll will be hidden and voting will stop. This action cannot be undone here.</p>
      @if (actionError()) {
        <p class="action-error" role="alert">{{ actionError() }}</p>
      }
      <div class="dialog-actions">
        <button class="button" [disabled]="blocking()" (click)="confirmation.close()">
          Cancel
        </button>
        <button class="button block-button" [disabled]="blocking()" (click)="block()">
          {{ blocking() ? 'Blocking…' : 'Block poll' }}
        </button>
      </div>
    </dialog>
  `,
  styles: `
    .back-link {
      display: inline-block;
      margin-bottom: 20px;
      color: var(--accent);
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    .review-panel {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 28px;
      background: var(--surface);
    }
    .review-heading {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 24px;
    }
    .review-heading h2 {
      font-size: 1.5rem;
      margin: 12px 0 6px;
    }
    .review-heading .button {
      flex-shrink: 0;
    }
    .muted {
      color: var(--muted);
      font-size: 0.875rem;
    }
    .description {
      margin-top: 24px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .review-question {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
      overflow-wrap: anywhere;
    }
    .review-question h3 {
      margin-bottom: 6px;
    }
    ul {
      margin: 12px 0 0;
      padding-left: 22px;
    }
    li {
      margin-top: 8px;
    }
    .block-button {
      color: var(--danger);
      border-color: var(--danger);
    }
    .action-error {
      color: var(--danger);
    }
    @media (max-width: 520px) {
      .review-panel {
        padding: 20px;
      }
      .review-heading {
        flex-direction: column;
        gap: 16px;
      }
    }
  `,
})
export class AdminPollDetail {
  private readonly api = inject(PollService);
  private readonly route = inject(ActivatedRoute);
  readonly poll = signal<Poll | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly blocking = signal(false);
  readonly actionError = signal('');
  @ViewChild('confirmation', { static: true }) private confirmation!: ElementRef<HTMLDialogElement>;
  private generation = 0;
  constructor() {
    void this.load();
    inject(DestroyRef).onDestroy(() => this.generation++);
  }
  async load(): Promise<void> {
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set('');
    try {
      const poll = await this.api.get(this.route.snapshot.paramMap.get('id')!);
      if (generation === this.generation) this.poll.set(poll);
    } catch (error) {
      if (generation === this.generation) this.error.set(errorMessage(error));
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
  openBlock(): void {
    this.actionError.set('');
    this.confirmation.nativeElement.showModal();
  }
  async block(): Promise<void> {
    if (this.blocking() || this.poll()?.blocked) return;
    const generation = this.generation;
    this.blocking.set(true);
    this.actionError.set('');
    try {
      const poll = await this.api.action(this.poll()!.id, 'block');
      if (generation !== this.generation) return;
      this.poll.set(poll);
      this.confirmation.nativeElement.close();
    } catch (error) {
      if (generation === this.generation) this.actionError.set(errorMessage(error));
    } finally {
      this.blocking.set(false);
    }
  }
}
