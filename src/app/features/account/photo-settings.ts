import { Component, effect, inject, OnDestroy, signal, untracked } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { PhotoService } from '../../core/services/photo.service';
import { PhotoCropDialog } from './photo-crop-dialog';

@Component({
  selector: 'app-photo-settings',
  imports: [PhotoCropDialog],
  styleUrl: './photo-settings.css',
  template: `
    <section class="photo-settings" aria-label="Profile photo">
      <div class="photo-identity">
        <span class="photo-preview" aria-hidden="true">
          @if (photos.url(); as url) {
            <img [src]="url" alt="" />
          } @else {
            {{ auth.initials() }}
          }
        </span>
      </div>
      <div class="photo-actions">
        <button
          type="button"
          class="button"
          [disabled]="photos.pending() || photos.loading() || checking()"
          (click)="fileInput.click()"
        >
          {{ checking() ? 'Opening…' : photos.url() ? 'Change photo' : 'Add photo' }}
        </button>
        @if (photos.url()) {
          <button
            type="button"
            class="photo-remove"
            [disabled]="photos.pending()"
            (click)="remove()"
          >
            {{ photos.pending() ? 'Please wait…' : 'Remove photo' }}
          </button>
        }
        <input
          #fileInput
          class="photo-file-input"
          hidden
          type="file"
          accept="image/jpeg,image/png"
          tabindex="-1"
          aria-label="Choose profile photo"
          (change)="choose($event)"
        />
      </div>
      <p class="photo-guidance">JPEG or PNG, up to 5 MB.</p>
      @if (photos.loading()) {
        <p class="photo-status" role="status">Loading your photo…</p>
      }
      @if (localError() || photos.error()) {
        <p class="photo-error" role="alert">{{ localError() || photos.error() }}</p>
        @if (photos.error() && !photos.url()) {
          <button
            type="button"
            class="text-button"
            [disabled]="photos.loading()"
            (click)="photos.load()"
          >
            Try again
          </button>
        }
      }
    </section>
    @if (source(); as selected) {
      <app-photo-crop-dialog [source]="selected" (closed)="closeEditor($event)" />
    }
  `,
})
export class PhotoSettings implements OnDestroy {
  readonly auth = inject(AuthService);
  readonly photos = inject(PhotoService);
  readonly source = signal<string | null>(null);
  readonly checking = signal(false);
  readonly localError = signal('');
  private selection = 0;

  constructor() {
    effect(() => {
      this.auth.userId();
      this.auth.authenticated();
      untracked(() => {
        this.selection++;
        this.checking.set(false);
        this.closeEditor(false);
      });
    });
  }

  async choose(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.photos.pending()) return;
    this.localError.set('');
    this.photos.error.set('');
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      this.localError.set('Choose a JPEG or PNG photo.');
      return;
    }
    if (!file.size || file.size > 5 * 1024 * 1024) {
      this.localError.set('Choose a photo smaller than 5 MB.');
      return;
    }
    const selection = ++this.selection;
    const url = URL.createObjectURL(file);
    this.checking.set(true);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (image.naturalWidth > 4096 || image.naturalHeight > 4096)
        throw new Error('Choose a photo no wider or taller than 4096 pixels.');
      if (selection !== this.selection) {
        URL.revokeObjectURL(url);
        return;
      }
      this.source.set(url);
    } catch (error) {
      URL.revokeObjectURL(url);
      if (selection === this.selection)
        this.localError.set(
          error instanceof Error && error.name === 'Error'
            ? error.message
            : 'This photo could not be opened. Choose another image.',
        );
    } finally {
      if (selection === this.selection) this.checking.set(false);
    }
  }

  closeEditor(_saved: boolean): void {
    const url = this.source();
    this.source.set(null);
    if (url) URL.revokeObjectURL(url);
  }

  async remove(): Promise<void> {
    this.localError.set('');
    try {
      await this.photos.remove();
    } catch {
      /* PhotoService exposes the error and keeps the existing photo. */
    }
  }

  ngOnDestroy(): void {
    this.selection++;
    this.closeEditor(false);
  }
}
