import { Routes } from '@angular/router';
import { accountGuard, adminGuard, unsavedGuard } from './core/auth/auth.guard';
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'polls' },
  {
    path: 'polls',
    title: 'Explore | Votivo',
    loadComponent: () => import('./features/polls/poll-list').then((m) => m.PollList),
    data: { scope: 'public' },
  },
  {
    path: 'my-polls',
    title: 'My polls | Votivo',
    canActivate: [accountGuard],
    loadComponent: () => import('./features/polls/poll-list').then((m) => m.PollList),
    data: { scope: 'mine' },
  },
  {
    path: 'admin',
    title: 'Moderation | Votivo',
    canActivate: [accountGuard, adminGuard],
    loadComponent: () => import('./features/polls/poll-list').then((m) => m.PollList),
    data: { scope: 'admin' },
  },
  {
    path: 'polls/new',
    title: 'Create poll | Votivo',
    canActivate: [accountGuard],
    canDeactivate: [unsavedGuard],
    loadComponent: () => import('./features/polls/poll-editor').then((m) => m.PollEditor),
  },
  {
    path: 'polls/:id/edit',
    title: 'Edit poll | Votivo',
    canActivate: [accountGuard],
    canDeactivate: [unsavedGuard],
    loadComponent: () => import('./features/polls/poll-editor').then((m) => m.PollEditor),
  },
  {
    path: 'polls/:id',
    title: 'Poll | Votivo',
    loadComponent: () => import('./features/polls/poll-detail').then((m) => m.PollDetail),
  },
  {
    path: 's/:token',
    title: 'Shared poll | Votivo',
    loadComponent: () => import('./features/polls/poll-detail').then((m) => m.PollDetail),
  },
  {
    path: 'account',
    title: 'Your account | Votivo',
    loadComponent: () => import('./features/pages').then((m) => m.AccountPage),
  },
  {
    path: 'help',
    title: 'How it works | Votivo',
    loadComponent: () => import('./features/pages').then((m) => m.HelpPage),
  },
  {
    path: '**',
    title: 'Page not found | Votivo',
    loadComponent: () => import('./features/pages').then((m) => m.NotFoundPage),
  },
];
