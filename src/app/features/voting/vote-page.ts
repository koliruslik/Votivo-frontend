import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DemoPollService } from '../../core/data/demo-poll.service';

@Component({
  imports: [RouterLink],
  styles: [
    '.choice { display: flex; gap: .8rem; align-items: center; font-weight: 400; } .choice input { width: auto; }',
  ],
  template: `
    @if (poll; as item) {
      <span class="eyebrow">Sample poll</span>
      <h1>{{ item.title }}</h1>
      <p class="lead">{{ item.description }}</p>
      <p class="notice">Try choosing answers. This preview does not submit or store votes.</p>
      <section class="card narrow">
        @for (question of item.questions; track question.id) {
          <h2>{{ question.text }}</h2>
          <p class="muted">Select all that apply.</p>
          @for (option of question.options; track option.id) {
            <label class="choice">
              <input
                type="checkbox"
                [checked]="selected().has(option.id)"
                (change)="toggle(option.id)"
              />
              {{ option.label }}
            </label>
          }
        }
        <div class="actions">
          <button type="button" [disabled]="selected().size === 0" (click)="previewed.set(true)">
            Preview selection
          </button>
          <a [routerLink]="['/polls', item.id, 'results']">View results</a>
        </div>
        @if (previewed()) {
          <p role="status">You selected {{ selected().size }} option(s). No vote was submitted.</p>
        }
      </section>
    } @else {
      <h1>Poll not available</h1>
      <p>This preview contains one sample poll.</p>
      <a routerLink="/polls">Back to polls</a>
    }
  `,
})
export class VotePage {
  protected readonly poll = inject(DemoPollService).findById(
    inject(ActivatedRoute).snapshot.paramMap.get('pollId') ?? '',
  );
  protected readonly selected = signal(new Set<string>());
  protected readonly previewed = signal(false);

  protected toggle(id: string): void {
    this.selected.update((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    this.previewed.set(false);
  }
}
