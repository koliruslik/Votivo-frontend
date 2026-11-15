import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink],
  template: `
    <span class="eyebrow">Your Votivo account</span>
    <h1>{{ register ? 'Join the conversation' : 'Welcome back' }}</h1>
    <section class="card narrow">
      <h2>{{ register ? 'Create an account' : 'Sign in' }}</h2>
      <p>Account access will be available when authentication is connected.</p>
      <p class="muted">You can explore the sample poll without an account.</p>
      <div class="actions">
        <a class="button" routerLink="/polls">Explore sample poll</a>
        <a [routerLink]="register ? '/login' : '/register'">{{
          register ? 'Sign in' : 'Create account'
        }}</a>
      </div>
    </section>
  `,
})
export class AuthPage {
  protected readonly register = inject(ActivatedRoute).snapshot.data['mode'] === 'register';
}
