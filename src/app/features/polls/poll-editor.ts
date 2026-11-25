import { Component, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PollInput } from '../../core/models/poll';
import { errorMessage, PollService } from '../../core/services/poll.service';
function blankPoll(): PollInput {
  return {
    title: '',
    description: '',
    accessType: 'PUBLIC',
    anonymous: false,
    allowVoteChange: true,
    questions: [{ text: '', type: 'SINGLE', options: [{ text: '' }, { text: '' }] }],
  };
}
@Component({ imports: [RouterLink], templateUrl: './poll-editor.html' })
export class PollEditor {
  private readonly api = inject(PollService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  get id(): string | null {
    return this.route.snapshot.paramMap.get('id');
  }
  readonly form = signal<PollInput>(blankPoll());
  readonly loading = signal(!!this.id);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly endTime = signal('');
  readonly timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  get minimumEndTime(): string {
    return this.localDateTime(new Date(Date.now() + 60_000).toISOString());
  }
  setEndTime(value: string): void {
    this.endTime.set(value);
    this.touch();
  }
  private localDateTime(value: string): string {
    const date = new Date(value);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  private dirty = false;
  private generation = 0;
  readonly ready = signal(!this.id);
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      ++this.generation;
    });
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(() => {
      this.dirty = false;
      if (this.id) void this.load();
    });
  }
  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) event.preventDefault();
  }
  hasUnsavedChanges(): boolean {
    return this.dirty || this.busy();
  }
  isSaving(): boolean {
    return this.busy();
  }
  touch(): void {
    this.dirty = true;
  }
  update(key: 'title' | 'description' | 'accessType', value: string): void {
    this.form.update((form) => ({ ...form, [key]: value }));
    this.touch();
  }
  setAnonymous(value: boolean): void {
    this.form.update((form) => ({
      ...form,
      anonymous: value,
      allowVoteChange: value ? false : form.allowVoteChange,
    }));
    this.touch();
  }
  addQuestion(): void {
    if (this.form().questions.length >= 50) return;
    this.form.update((form) => ({
      ...form,
      questions: [...form.questions, blankPoll().questions[0]],
    }));
    this.touch();
  }
  removeQuestion(index: number): void {
    this.form.update((form) => ({
      ...form,
      questions: form.questions.filter((_, i) => i !== index),
    }));
    this.touch();
  }
  move(index: number, delta: number): void {
    const questions = [...this.form().questions];
    [questions[index], questions[index + delta]] = [questions[index + delta], questions[index]];
    this.form.update((form) => ({ ...form, questions }));
    this.touch();
  }
  addOption(index: number): void {
    if (this.form().questions[index].options.length < 20) {
      this.form().questions[index].options.push({ text: '' });
      this.touch();
    }
  }
  removeOption(question: number, option: number): void {
    this.form().questions[question].options.splice(option, 1);
    this.touch();
  }
  async reloadDraft(): Promise<void> {
    if (
      this.busy() ||
      (this.hasUnsavedChanges() && !window.confirm('Discard your unsaved changes?'))
    )
      return;
    await this.load();
  }
  async load(): Promise<void> {
    const version = ++this.generation;
    this.loading.set(true);
    this.ready.set(false);
    this.error.set('');
    try {
      const poll = await this.api.get(this.id!);
      if (version !== this.generation) return;
      if (poll.status !== 'DRAFT' || poll.blocked)
        throw new Error('Only unblocked drafts can be edited.');
      this.form.set({
        endsAt: poll.endsAt ?? null,
        title: poll.title,
        description: poll.description,
        accessType: poll.accessType,
        anonymous: poll.anonymous,
        allowVoteChange: poll.allowVoteChange,
        questions: poll.questions.map((q) => ({
          text: q.text,
          type: q.type,
          options: q.options.map((o) => ({ text: o.text })),
        })),
      });
      this.ready.set(true);
      this.endTime.set(poll.endsAt ? this.localDateTime(poll.endsAt) : '');
      this.dirty = false;
    } catch (error) {
      if (version === this.generation) this.error.set(errorMessage(error));
    } finally {
      if (version === this.generation) this.loading.set(false);
    }
  }
  async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy() || !this.ready()) return;
    const input = structuredClone(this.form());
    const end = this.endTime() ? new Date(this.endTime()) : null;
    if (end && (!Number.isFinite(end.getTime()) || end.getTime() <= Date.now())) {
      this.error.set('Choose an end date and time in the future.');
      return;
    }
    input.endsAt = end?.toISOString() ?? null;
    const version = this.generation;
    if (
      !input.title.trim() ||
      input.questions.length === 0 ||
      input.questions.some(
        (q) => !q.text.trim() || q.options.length < 2 || q.options.some((o) => !o.text.trim()),
      )
    ) {
      this.error.set('Add a title, at least one question and two non-empty options per question.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const poll = await this.api.save(input, this.id ?? undefined);
      if (version !== this.generation) return;
      this.dirty = false;
      this.busy.set(false);
      await this.router.navigate(['/polls', poll.id]);
    } catch (error) {
      if (version === this.generation) this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
