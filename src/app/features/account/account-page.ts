import { Component, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { ActivatedRoute } from '@angular/router';

@Component({
  styleUrl: './account-page.css',
  template: `
    <header class="account-heading">
      <h1>Your account</h1>
    </header>
    @if (auth.authenticated()) {
      <div class="account-layout">
        <nav aria-label="Account settings">
          <button
            [class.selected]="section() === 'profile'"
            [attr.aria-current]="section() === 'profile' ? 'page' : null"
            (click)="select('profile')"
          >
            Profile
          </button>
          <button
            [class.selected]="section() === 'security'"
            [attr.aria-current]="section() === 'security' ? 'page' : null"
            (click)="select('security')"
          >
            Security
          </button>
        </nav>
        <section class="settings-panel" aria-label="Account settings content">
          @if (section() === 'profile') {
            <div class="profile-preview">
              <span class="profile-avatar" aria-hidden="true">{{ auth.initials() }}</span>
              <div><p class="field-label">Full name</p><h2>{{ auth.displayName() }}</h2></div>
            </div>
          } @else {
            <div class="setting-row">
              <div>
                <h3>Password</h3>
                <p>Update the password you use to sign in.</p>
              </div>
              <button
                class="button primary"
                [disabled]="auth.busy()"
                (click)="auth.changePassword()"
              >
                Change password
              </button>
            </div>
            @if (auth.passwordChangeMessage()) {
              <p class="preview-notice" role="status">{{ auth.passwordChangeMessage() }}</p>
            }
            <div class="deletion-section">
              <h3>Delete account</h3>
              <p>Permanently remove your account. Not available yet.</p>
              <button
                class="delete-button"
                (click)="
                  preview(
                    'Account deletion is not available yet. Your account has not been deleted.'
                  )
                "
              >
                Delete account
              </button>
            </div>
          }
          @if (notice()) {
            <p class="preview-notice" role="status">{{ notice() }}</p>
          }
        </section>
      </div>
    } @else {
      <section class="settings-panel signed-out">
        <h2>Sign in to view your account</h2>
        <p>Your profile and security settings will appear here.</p>
        <button class="button primary" [disabled]="!auth.canSignIn()" (click)="auth.signIn()">
          Sign in
        </button>
      </section>
    }
  `,
})
export class AccountPage {
  readonly auth = inject(AuthService);
  readonly section = signal<'profile' | 'security'>(
    inject(ActivatedRoute).snapshot.queryParamMap.get('section') === 'security'
      ? 'security'
      : 'profile',
  );
  readonly notice = signal('');
  select(section: 'profile' | 'security'): void {
    this.section.set(section);
    this.notice.set('');
  }
  preview(message: string): void {
    this.notice.set(message);
  }
}
