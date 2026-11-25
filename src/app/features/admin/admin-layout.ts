import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <header class="admin-heading">
      <h1>Administration</h1>
      <nav aria-label="Administration sections">
        <a
          routerLink="/admin"
          routerLinkActive="selected"
          [routerLinkActiveOptions]="{ exact: true }"
          ariaCurrentWhenActive="page"
          >Users</a
        >
        <a routerLink="/admin/polls" routerLinkActive="selected" ariaCurrentWhenActive="page"
          >Polls</a
        >
      </nav>
    </header>
    <router-outlet />
  `,
  styles: `
    :host {
      display: block;
      max-width: 1040px;
      margin: 0 auto;
    }
    .admin-heading h1 {
      font-size: 2rem;
    }
    nav {
      display: flex;
      gap: 6px;
      margin: 20px 0 24px;
      padding: 4px;
      width: fit-content;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--surface);
    }
    nav a {
      padding: 8px 24px;
      border-radius: 6px;
      color: var(--muted);
      font-weight: 550;
    }
    nav a.selected {
      color: var(--accent);
      background: var(--accent-soft);
      font-weight: 650;
    }
    @media (max-width: 520px) {
      nav {
        width: 100%;
      }
      nav a {
        flex: 1;
        text-align: center;
      }
    }
  `,
})
export class AdminLayout {}
