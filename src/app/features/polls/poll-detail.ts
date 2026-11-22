import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Poll, PollResult, VoteStatus } from '../../core/models/poll';
import { ApiError, errorMessage, PollService } from '../../core/services/poll.service';
import { PollBadge } from './poll-badge';

type Action = 'publish' | 'close' | 'archive' | 'block' | 'delete' | 'revoke';
@Component({
  imports: [RouterLink, DatePipe, DecimalPipe, PollBadge],
  templateUrl: './poll-detail.html',
})
export class PollDetail {
  readonly auth = inject(AuthService);
  private readonly api = inject(PollService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly confirmation = viewChild.required<ElementRef<HTMLDialogElement>>('confirmation');
  readonly poll = signal<Poll | null>(null);
  readonly results = signal<PollResult | null>(null);
  readonly status = signal<VoteStatus | null>(null);
  readonly selected = signal<Record<string, string[]>>({});
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly voteError = signal('');
  readonly resultError = signal('');
  readonly resultsLoading = signal(false);
  readonly notice = signal('');
  readonly tab = signal<'vote' | 'results'>('vote');
  readonly changing = signal(false);
  readonly pending = signal<Action>('publish');
  readonly shareUrl = signal('');
  readonly owner = computed(
    () => !!this.auth.userId() && this.poll()?.ownerId === this.auth.userId(),
  );
  readonly open = computed(() => this.poll()?.status === 'PUBLISHED' && !this.poll()?.blocked);
  readonly editableVote = computed(
    () =>
      this.auth.authenticated() &&
      this.open() &&
      !!this.status() &&
      (!this.status()?.voted ||
        (this.changing() && this.poll()?.allowVoteChange && !this.poll()?.anonymous)),
  );
  readonly actions: Record<Action, { title: string; detail: string; button: string }> = {
    publish: {
      title: 'Publish this poll?',
      detail:
        'People will be able to vote. Questions and settings cannot be edited after publication.',
      button: 'Publish poll',
    },
    close: {
      title: 'Close voting?',
      detail: 'This stops new votes. You can still view and share the results.',
      button: 'Close poll',
    },
    archive: {
      title: 'Archive this poll?',
      detail: 'The closed poll will remain in your workspace as an archive.',
      button: 'Archive poll',
    },
    block: {
      title: 'Block this poll?',
      detail: 'The poll will be hidden and voting will stop. This action cannot be undone here.',
      button: 'Block poll',
    },
    delete: {
      title: 'Delete this draft?',
      detail: 'The draft and all its questions will be permanently deleted.',
      button: 'Delete draft',
    },
    revoke: {
      title: 'Withdraw your vote?',
      detail:
        'Your answers will be removed from the results. You can vote again while the poll is open.',
      button: 'Withdraw vote',
    },
  };
  private generation = 0;
  private resultGeneration = 0;
  get routerUrl(): string {
    return this.router.url;
  }
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(() => void this.load());
  }
  async load(): Promise<void> {
    const version = ++this.generation;
    ++this.resultGeneration;
    this.resultsLoading.set(false);
    this.poll.set(null);
    this.loading.set(true);
    this.error.set('');
    this.voteError.set('');
    this.results.set(null);
    this.resultError.set('');
    this.status.set(null);
    this.changing.set(false);
    this.selected.set({});
    this.notice.set('');
    try {
      const token = this.route.snapshot.paramMap.get('token');
      const poll = token
        ? await this.api.byLink(token)
        : await this.api.get(this.route.snapshot.paramMap.get('id')!);
      if (version !== this.generation) return;
      this.poll.set(poll);
      this.shareUrl.set(
        poll.accessType === 'LINK'
          ? poll.shareToken || token
            ? `${window.location.origin}/s/${poll.shareToken || token}`
            : ''
          : `${window.location.origin}/polls/${poll.id}`,
      );
      this.tab.set(poll.status === 'CLOSED' || poll.status === 'ARCHIVED' ? 'results' : 'vote');
      if (this.auth.authenticated() && poll.status !== 'DRAFT') await this.loadVoteStatus(poll.id);
      if (version === this.generation && this.tab() === 'results') void this.refreshResults();
    } catch (error) {
      if (version === this.generation) this.error.set(errorMessage(error));
    } finally {
      if (version === this.generation) this.loading.set(false);
    }
  }
  async loadVoteStatus(id: string): Promise<void> {
    this.voteError.set('');
    try {
      const status = await this.api.voteStatus(id);
      if (this.poll()?.id !== id) return;
      this.status.set(status);
      this.selected.set(
        Object.fromEntries(
          (status.answers ?? []).map((answer) => [answer.question_id, answer.option_ids]),
        ),
      );
    } catch (error) {
      if (this.poll()?.id !== id) return;
      this.status.set(null);
      this.voteError.set(
        error instanceof ApiError && error.status === 404
          ? 'Voting is still syncing. Retry in a moment.'
          : errorMessage(error),
      );
    }
  }
  select(questionId: string, optionId: string, multiple: boolean): void {
    this.selected.update((values) => ({
      ...values,
      [questionId]: multiple
        ? (values[questionId] ?? []).includes(optionId)
          ? values[questionId].filter((id) => id !== optionId)
          : [...(values[questionId] ?? []), optionId]
        : [optionId],
    }));
  }
  async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy() || !this.editableVote()) return;
    const poll = this.poll()!;
    const answers = poll.questions.map((q) => ({
      question_id: q.id,
      option_ids: this.selected()[q.id] ?? [],
    }));
    if (answers.some((answer) => answer.option_ids.length === 0)) {
      this.voteError.set('Please answer every question before submitting.');
      return;
    }
    this.busy.set(true);
    this.voteError.set('');
    try {
      await this.api.vote(poll.id, answers, !!this.status()?.voted);
      this.status.set({ voted: true, answers: poll.anonymous ? undefined : answers });
      this.changing.set(false);
      this.notice.set('Your vote has been saved. Results may take a moment to update.');
      this.showResults();
    } catch (error) {
      this.voteError.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
  showResults(): void {
    this.tab.set('results');
    void this.refreshResults();
  }
  async refreshResults(): Promise<void> {
    if (!this.poll() || this.resultsLoading()) return;
    const id = this.poll()!.id;
    const version = ++this.resultGeneration;
    this.resultsLoading.set(true);
    this.resultError.set('');
    try {
      const result = await this.api.results(id);
      if (version === this.resultGeneration && this.poll()?.id === id) this.results.set(result);
    } catch (error) {
      if (version === this.resultGeneration && this.poll()?.id === id)
        this.resultError.set(errorMessage(error));
    } finally {
      if (version === this.resultGeneration) this.resultsLoading.set(false);
    }
  }
  percent(votes: number): number {
    return this.results()?.totalVotes
      ? Math.max(0, Math.min(100, (votes / this.results()!.totalVotes) * 100))
      : 0;
  }
  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.shareUrl());
      this.notice.set('Link copied to clipboard.');
    } catch {
      this.notice.set('Copy the link from the field below.');
    }
  }
  ask(action: Action): void {
    this.pending.set(action);
    this.confirmation().nativeElement.showModal();
  }
  async confirm(): Promise<void> {
    if (this.busy()) return;
    const action = this.pending();
    const poll = this.poll()!;
    this.confirmation().nativeElement.close();
    this.busy.set(true);
    this.error.set('');
    this.voteError.set('');
    try {
      if (action === 'delete') {
        await this.api.remove(poll.id);
        await this.router.navigate(['/my-polls']);
      } else if (action === 'revoke') {
        await this.api.revoke(poll.id);
        this.status.set({ voted: false });
        this.selected.set({});
        this.changing.set(false);
        this.notice.set('Your vote has been withdrawn.');
        void this.refreshResults();
      } else {
        this.poll.set(await this.api.action(poll.id, action));
        if (action === 'publish' && this.auth.authenticated()) await this.loadVoteStatus(poll.id);
        this.notice.set(
          action === 'publish'
            ? 'Your poll is live. Share it to collect responses.'
            : 'Poll updated.',
        );
        if (action === 'close' || action === 'block') this.showResults();
      }
    } catch (error) {
      this.voteError.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
  cancelChange(): void {
    this.changing.set(false);
    this.selected.set(
      Object.fromEntries((this.status()?.answers ?? []).map((a) => [a.question_id, a.option_ids])),
    );
  }
  tabKey(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const showResults = event.key === 'End' || (event.key !== 'Home' && this.tab() === 'vote');
    if (showResults) this.showResults();
    else this.tab.set('vote');
    document.getElementById(showResults ? 'results-tab' : 'vote-tab')?.focus();
  }
}
