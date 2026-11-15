import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, map, of, startWith, Subject, switchMap } from 'rxjs';
import { DemoPollService } from '../../core/data/demo-poll.service';
import { PollResult } from '../../core/models/poll-result';
import { ResultsApiService } from '../../core/services/results-api.service';

type ResultState = { kind: 'loading' } | { kind: 'error' } | { kind: 'loaded'; result: PollResult };

@Component({
  imports: [RouterLink],
  styles: [
    `
      .stat {
        font-size: 2.8rem;
        font-weight: 750;
        margin: 0.5rem 0;
      }
      .option-row {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        margin-top: 1rem;
      }
      progress {
        width: 100%;
        height: 0.8rem;
        accent-color: var(--accent);
      }
    `,
  ],
  template: `
    <span class="eyebrow">The whole picture</span>
    <h1>{{ poll?.title ?? 'Poll results' }}</h1>
    <p class="lead">See how the responses add up.</p>
    @if (poll) {
      <p class="notice">
        Sample poll. Start Result Service with its demo profile to see three demonstration
        responses.
      </p>
    }
    @let current = state();
    @switch (current.kind) {
      @case ('loading') {
        <p role="status">Loading results…</p>
      }
      @case ('error') {
        <section class="card" role="alert">
          <h2>Results are unavailable</h2>
          <p>
            Please try again. If you are running this locally, make sure Result Service is running.
          </p>
          <button type="button" (click)="retry()">Try again</button>
        </section>
      }
      @case ('loaded') {
        <section class="card">
          <span class="eyebrow">Total responses</span>
          <p class="stat">{{ current.result.totalVotes }}</p>
          @if (current.result.questions.length === 0) {
            <p>No responses are available for this poll yet.</p>
          }
          @for (question of current.result.questions; track question.questionId) {
            <h2>{{ questionLabel(question.questionId) }}</h2>
            <p class="muted">
              {{ question.answeredVotes }} answered · Multiple selections may total more than 100%.
            </p>
            @for (option of question.options; track option.optionId) {
              <div class="option-row">
                <span>{{ optionLabel(question.questionId, option.optionId) }}</span>
                <strong>{{ option.votes }} · {{ option.percentage }}%</strong>
              </div>
              <progress
                [value]="option.percentage"
                max="100"
                [attr.aria-label]="optionLabel(question.questionId, option.optionId)"
              ></progress>
            }
          }
        </section>
      }
    }
    <a routerLink="/polls">← Back to polls</a>
  `,
})
export class ResultsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ResultsApiService);
  private readonly refresh = new Subject<void>();
  private readonly catalog = inject(DemoPollService);
  protected readonly state = signal<ResultState>({ kind: 'loading' });
  protected poll = this.catalog.findById(this.route.snapshot.paramMap.get('pollId') ?? '');

  constructor() {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          const pollId = params.get('pollId') ?? '';
          this.poll = this.catalog.findById(pollId);
          return this.refresh.pipe(
            startWith(undefined),
            switchMap(() =>
              this.api.getResults(pollId).pipe(
                map((result) => ({ kind: 'loaded', result }) as ResultState),
                catchError(() => of<ResultState>({ kind: 'error' })),
                startWith<ResultState>({ kind: 'loading' }),
              ),
            ),
          );
        }),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((state) => this.state.set(state));
  }

  protected retry(): void {
    this.refresh.next();
  }

  protected questionLabel(id: string): string {
    return this.poll?.questions.find((question) => question.id === id)?.text ?? id;
  }

  protected optionLabel(questionId: string, optionId: string): string {
    return (
      this.poll?.questions
        .find((question) => question.id === questionId)
        ?.options.find((option) => option.id === optionId)?.label ?? optionId
    );
  }
}
