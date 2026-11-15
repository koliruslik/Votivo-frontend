import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DemoPollService } from '../../core/data/demo-poll.service';

@Component({
  imports: [RouterLink],
  template: `
    <span class="eyebrow">A place for every voice</span>
    <h1>Small questions.<br />Shared decisions.</h1>
    <p class="lead">Create a poll, hear from your team, and see the whole picture.</p>
    <p class="notice">
      Development preview: the poll below is a sample. Voting and publishing are not connected yet.
    </p>
    @for (poll of catalog.polls; track poll.id) {
      <article class="card">
        <span class="badge">Sample poll</span>
        <h2>{{ poll.title }}</h2>
        <p class="muted">{{ poll.description }}</p>
        <div class="actions">
          <a class="button" [routerLink]="['/polls', poll.id, 'vote']">Explore poll</a>
          <a class="button secondary" [routerLink]="['/polls', poll.id, 'results']">View results</a>
        </div>
      </article>
    }
  `,
})
export class PollList {
  protected readonly catalog = inject(DemoPollService);
}
