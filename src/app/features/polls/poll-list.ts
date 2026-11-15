import { Component, inject } from '@angular/core';
import { PollService } from '../../core/services/poll.service';

@Component({
  template: `
    <h1>Polls</h1>
    <p>Create polls, collect votes, and view results with Votivo.</p>
    @for (poll of polls; track poll.id) {
      <article>
        <h2>{{ poll.title }}</h2>
        <p>{{ poll.description }}</p>
      </article>
    } @empty {
      <p>No polls available.</p>
    }
  `,
})
export class PollList {
  protected readonly polls = inject(PollService).getPolls();
}
