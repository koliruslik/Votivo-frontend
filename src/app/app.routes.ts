import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'polls' },
  {
    path: 'polls',
    title: 'Explore polls | Votivo',
    loadComponent: () => import('./features/polls/poll-list').then((m) => m.PollList),
  },
  {
    path: 'polls/new',
    title: 'Create a poll | Votivo',
    loadComponent: () => import('./features/polls/poll-create').then((m) => m.PollCreate),
  },
  {
    path: 'polls/:pollId/vote',
    title: 'Vote | Votivo',
    loadComponent: () => import('./features/voting/vote-page').then((m) => m.VotePage),
  },
  {
    path: 'polls/:pollId/results',
    title: 'Results | Votivo',
    loadComponent: () => import('./features/results/results-page').then((m) => m.ResultsPage),
  },
  {
    path: 'login',
    title: 'Sign in | Votivo',
    data: { mode: 'login' },
    loadComponent: () => import('./features/auth/auth-page').then((m) => m.AuthPage),
  },
  {
    path: 'register',
    title: 'Register | Votivo',
    data: { mode: 'register' },
    loadComponent: () => import('./features/auth/auth-page').then((m) => m.AuthPage),
  },
  {
    path: '**',
    title: 'Page not found | Votivo',
    loadComponent: () => import('./features/not-found/not-found-page').then((m) => m.NotFoundPage),
  },
];
