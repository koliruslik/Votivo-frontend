import { Component, effect, inject, signal, untracked } from '@angular/core';
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
            @if (auth.profileLoading()) {
              <p role="status" class="profile-message">Loading your profile…</p>
            }
            @if (auth.profileError()) {
              <p role="alert" class="profile-message">{{ auth.profileError() }}</p>
              <button class="button" (click)="reload()">Try again</button>
            }
            @if (auth.profile(); as profile) {
              <div class="profile-preview">
                <span class="profile-avatar" aria-hidden="true">{{ auth.initials() }}</span>
                <div>
                  <p class="field-label">Full name</p>
                  <h2>{{ auth.displayName() }}</h2>
                </div>
              </div>
              <form class="profile-form" (submit)="$event.preventDefault(); save()">
                <div class="name-fields">
                  <label
                    >First name<input
                      name="firstName"
                      [value]="firstName"
                      (input)="firstName = $any($event.target).value"
                      required
                      maxlength="255"
                      autocomplete="given-name"
                      [disabled]="saving()"
                  /></label>
                  <label
                    >Last name<input
                      name="lastName"
                      [value]="lastName"
                      (input)="lastName = $any($event.target).value"
                      required
                      maxlength="255"
                      autocomplete="family-name"
                      [disabled]="saving()"
                  /></label>
                </div>
                <button
                  class="button primary"
                  type="submit"
                  [disabled]="
                    saving() ||
                    !firstName.trim() ||
                    !lastName.trim() ||
                    (firstName === profile.firstName && lastName === profile.lastName)
                  "
                >
                  {{ saving() ? 'Saving…' : 'Save changes' }}
                </button>
              </form>
              <div class="setting-row email-row">
                <div>
                  <h3>Email</h3>
                  <div class="email-identity">
                    <span class="email-address">{{ profile.email || 'No email address' }}</span>
                    <span class="verification-badge" [class.verified]="profile.emailVerified">{{
                      profile.emailVerified ? 'Verified' : 'Not verified'
                    }}</span>
                  </div>
                </div>
                <button class="button" [disabled]="auth.busy()" (click)="auth.changeEmail()">
                  Change email
                </button>
              </div>
            }
            @if (auth.emailChangeMessage()) {
              <p class="preview-notice" role="status">{{ auth.emailChangeMessage() }}</p>
            }
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
  readonly saving = signal(false);
  firstName = '';
  lastName = '';
  constructor() {
    effect(() => {
      if (this.auth.authenticated())
        untracked(() => {
          void this.reload();
        });
    });
  }
  async reload(): Promise<void> {
    await this.auth.loadProfile();
    const profile = this.auth.profile();
    if (profile) {
      this.firstName = profile.firstName ?? '';
      this.lastName = profile.lastName ?? '';
    }
  }
  async save(): Promise<void> {
    if (this.saving() || !this.firstName.trim() || !this.lastName.trim()) return;
    this.saving.set(true);
    this.notice.set('');
    try {
      await this.auth.saveProfile(this.firstName, this.lastName);
      const profile = this.auth.profile();
      this.firstName = profile?.firstName ?? '';
      this.lastName = profile?.lastName ?? '';
    } catch (error) {
      this.notice.set(error instanceof Error ? error.message : 'Could not save your profile.');
    } finally {
      this.saving.set(false);
    }
  }
  select(section: 'profile' | 'security'): void {
    this.section.set(section);
    this.notice.set('');
  }
  preview(message: string): void {
    this.notice.set(message);
  }
}
