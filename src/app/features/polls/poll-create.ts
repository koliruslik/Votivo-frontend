import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

@Component({
  imports: [ReactiveFormsModule],
  template: `
    <span class="eyebrow">Make room for opinions</span>
    <h1>Create a poll</h1>
    <p class="lead">Start with a clear question and a little context.</p>
    <p class="notice">Local preview only. Drafts are not saved or published.</p>
    <form class="card narrow" [formGroup]="form" (ngSubmit)="preview()">
      <label for="title">Poll title</label>
      <input id="title" formControlName="title" maxlength="120" required />
      <label for="description">Description</label>
      <textarea id="description" formControlName="description" rows="3" maxlength="1000"></textarea>
      <label for="question">Question</label>
      <input id="question" formControlName="question" maxlength="300" required />
      <label for="firstOption">First answer option</label>
      <input id="firstOption" formControlName="firstOption" maxlength="200" required />
      <label for="secondOption">Second answer option</label>
      <input id="secondOption" formControlName="secondOption" maxlength="200" required />
      <div class="actions">
        <button type="submit" [disabled]="form.invalid">Preview draft</button>
      </div>
    </form>
    @if (draft(); as item) {
      <section class="card narrow" aria-live="polite">
        <span class="badge">Unsaved draft</span>
        <h2>{{ item.title }}</h2>
        <p>{{ item.description }}</p>
        <h3>{{ item.question }}</h3>
        <ul>
          <li>{{ item.firstOption }}</li>
          <li>{{ item.secondOption }}</li>
        </ul>
      </section>
    }
  `,
})
export class PollCreate {
  private readonly builder = inject(FormBuilder);
  private readonly requiredText = [Validators.required, Validators.pattern(/\S/)];
  protected readonly form = this.builder.nonNullable.group({
    title: ['', [...this.requiredText, Validators.maxLength(120)]],
    description: ['', Validators.maxLength(1000)],
    question: ['', [...this.requiredText, Validators.maxLength(300)]],
    firstOption: ['', [...this.requiredText, Validators.maxLength(200)]],
    secondOption: ['', [...this.requiredText, Validators.maxLength(200)]],
  });
  protected readonly draft = signal<ReturnType<typeof this.form.getRawValue> | null>(null);

  protected preview(): void {
    if (this.form.valid) this.draft.set(this.form.getRawValue());
  }
}
