import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'polls' },
  {
    path: 'polls',
    title: 'Polls | Votivo',
    loadComponent: () => import('./features/polls/poll-list').then((m) => m.PollList),
  },
  { path: '**', redirectTo: 'polls' },
];
