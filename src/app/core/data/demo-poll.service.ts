import { Injectable } from '@angular/core';
import { Poll } from '../models/poll';

export const DEMO_POLL_ID = '11111111-1111-4111-8111-111111111111';

@Injectable({ providedIn: 'root' })
export class DemoPollService {
  readonly polls: readonly Poll[] = [
    {
      id: DEMO_POLL_ID,
      title: 'When should we meet?',
      description: 'Help the team find a good time for its next project catch-up.',
      questions: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          text: 'Which times work for you?',
          options: [
            { id: '33333333-3333-4333-8333-333333333333', label: 'Morning' },
            { id: '44444444-4444-4444-8444-444444444444', label: 'Afternoon' },
          ],
        },
      ],
    },
  ];

  findById(id: string): Poll | undefined {
    return this.polls.find((poll) => poll.id === id);
  }
}
