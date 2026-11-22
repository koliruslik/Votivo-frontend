import { Component, input } from '@angular/core';
@Component({
  selector: 'app-poll-badge',
  template: `<span
    class="badge"
    [class.active]="!blocked() && status() === 'PUBLISHED'"
    [class.blocked]="blocked()"
    >{{ blocked() ? 'Blocked' : (labels[status()] ?? status()) }}</span
  >`,
})
export class PollBadge {
  readonly status = input.required<string>();
  readonly blocked = input(false);
  readonly labels: Record<string, string> = {
    DRAFT: 'Draft',
    PUBLISHED: 'Open',
    CLOSED: 'Closed',
    ARCHIVED: 'Archived',
  };
}
