import { Routes } from '@angular/router';
import { accountGuard, adminGuard, regularUserGuard, unsavedGuard } from './core/auth/auth.guard';
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'polls' },
  {
    path: 'polls',
    canActivate: [regularUserGuard],
    title: 'Explore | Votivo',
    loadComponent: () => import('./features/polls/poll-list').then((m) => m.PollList),
    data: { scope: 'public' },
  },
  {
    path: 'my-polls',
    title: 'My polls | Votivo',
    canActivate: [accountGuard, regularUserGuard],
    loadComponent: () => import('./features/polls/poll-list').then((m) => m.PollList),
    data: { scope: 'mine' },
  },
  {
    path: 'admin',
    canActivate: [accountGuard, adminGuard],
    loadComponent: () => import('./features/admin/admin-layout').then((m) => m.AdminLayout),
    children: [
      {
        path: '',
        title: 'Users | Administration | Votivo',
        loadComponent: () => import('./features/admin/admin-users').then((m) => m.AdminUsers),
      },
      {
        path: 'polls',
        title: 'Polls | Administration | Votivo',
        loadComponent: () => import('./features/admin/admin-polls').then((m) => m.AdminPolls),
      },
      {
        path: 'polls/:id',
        title: 'Review poll | Administration | Votivo',
        loadComponent: () =>
          import('./features/admin/admin-poll-detail').then((m) => m.AdminPollDetail),
      },
    ],
  },
  {
    path: 'polls/new',
    title: 'Create poll | Votivo',
    canActivate: [accountGuard, regularUserGuard],
    canDeactivate: [unsavedGuard],
    loadComponent: () => import('./features/polls/poll-editor').then((m) => m.PollEditor),
  },
  {
    path: 'polls/:id/edit',
    title: 'Edit poll | Votivo',
    canActivate: [accountGuard, regularUserGuard],
    canDeactivate: [unsavedGuard],
    loadComponent: () => import('./features/polls/poll-editor').then((m) => m.PollEditor),
  },
  {
    path: 'polls/:id',
    canActivate: [regularUserGuard],
    title: 'Poll | Votivo',
    loadComponent: () => import('./features/polls/poll-detail').then((m) => m.PollDetail),
  },
  {
    path: 's/:token',
    canActivate: [regularUserGuard],
    title: 'Shared poll | Votivo',
    loadComponent: () => import('./features/polls/poll-detail').then((m) => m.PollDetail),
  },
  {
    path: 'account',
    canActivate: [regularUserGuard],
    title: 'Your account | Votivo',
    loadComponent: () => import('./features/pages').then((m) => m.AccountPage),
  },
  {
    path: 'help',
    canActivate: [regularUserGuard],
    title: 'How it works | Votivo',
    loadComponent: () => import('./features/pages').then((m) => m.HelpPage),
  },
  {
    path: '**',
    canActivate: [regularUserGuard],
    title: 'Page not found | Votivo',
    loadComponent: () => import('./features/pages').then((m) => m.NotFoundPage),
  },
];
