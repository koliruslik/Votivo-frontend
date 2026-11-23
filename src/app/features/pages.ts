import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
export { AccountPage } from './account/account-page';
@Component({
  imports: [RouterLink],
  template: ` <div class="narrow-page">
    <p class="eyebrow">A little guidance</p>
    <h1>Good questions. Clear answers.</h1>
    <p class="lede">Everything you need to get started with Votivo.</p>
    <div class="stack help-sections">
      <section class="panel form-section">
        <h2>Create and share</h2>
        <p>
          Sign in and choose Create poll. Add a title, questions and at least two options per
          question. Save your draft, review it, then publish. Questions and settings are locked once
          a poll is published.
        </p>
        <p>
          Public polls appear in Explore. Link-only polls can be opened through their unique share
          link.
        </p>
      </section>
      <section class="panel form-section">
        <h2>Make your choice</h2>
        <p>
          Sign in, open a poll and answer every question. Single-choice questions accept one answer;
          multiple-choice questions accept more than one. Each account can submit one response per
          poll.
        </p>
        <p>
          If the creator allows changes, you can edit or withdraw your response while voting is
          open. Anonymous responses cannot be changed or withdrawn.
        </p>
      </section>
      <section class="panel form-section">
        <h2>Read the results</h2>
        <p>
          The Results tab shows votes per option and total responses. Each submitted ballot counts
          once. Percentages in a multiple-choice question may add up to more than 100%.
        </p>
        <p>
          Results are processed asynchronously. Use Refresh results if your vote has not appeared
          yet.
        </p>
      </section>
      <section class="panel form-section">
        <h2>Stay in control</h2>
        <p>
          My polls contains your drafts, open polls and past polls. You can close voting and archive
          a closed poll. Only unpublished drafts can be deleted.
        </p>
        <p>
          Manage account opens your profile and security settings. Moderation is available to
          administrators.
        </p>
      </section>
    </div>
    <a class="button primary" routerLink="/polls">Explore polls</a>
  </div>`,
})
export class HelpPage {}
@Component({
  imports: [RouterLink],
  template: `<div class="panel empty-state">
    <p class="eyebrow">404</p>
    <h1>This page isn’t here</h1>
    <p>The link may be incomplete or the page may have moved.</p>
    <a class="button primary" routerLink="/polls">Explore polls</a>
  </div>`,
})
export class NotFoundPage {}
