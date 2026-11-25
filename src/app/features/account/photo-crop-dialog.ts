import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  ViewEncapsulation,
  signal,
} from '@angular/core';
import { PhotoService } from '../../core/services/photo.service';
import { AuthService, SessionExpiredError } from '../../core/auth/auth.service';

@Component({
  selector: 'app-photo-crop-dialog',
  encapsulation: ViewEncapsulation.None,
  styleUrl: './photo-editor.css',
  template: `
    <dialog
      #dialog
      class="photo-dialog"
      aria-labelledby="photo-editor-title"
      (cancel)="cancel($event)"
    >
      <div #editor></div>
      @if (loadError()) {
        <div class="photo-editor">
          <h2 id="photo-editor-title">Photo editor unavailable</h2>
          <p role="alert">{{ loadError() }}</p>
          <button class="button" (click)="closed.emit(false)">Close</button>
        </div>
      }
    </dialog>
  `,
})
export class PhotoCropDialog implements AfterViewInit, OnDestroy {
  @Input({ required: true }) source = '';
  @Output() readonly closed = new EventEmitter<boolean>();
  @ViewChild('dialog', { static: true }) dialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('editor', { static: true }) editor!: ElementRef<HTMLElement>;
  readonly loadError = signal('');
  private readonly photos = inject(PhotoService);
  private readonly auth = inject(AuthService);
  private dispose?: () => void;
  private destroyed = false;
  private busy = false;

  async ngAfterViewInit(): Promise<void> {
    const owner = this.auth.userId();
    this.dialog.nativeElement.showModal();
    try {
      const { mountPhotoEditor } = await import('./photo-editor.react');
      if (this.destroyed) return;
      this.dispose = mountPhotoEditor(this.editor.nativeElement, {
        source: this.source,
        onSave: async (blob) => {
          if (this.destroyed || !this.auth.authenticated() || this.auth.userId() !== owner)
            throw new SessionExpiredError();
          await this.photos.save(blob);
          if (!this.destroyed) this.closed.emit(true);
        },
        onCancel: () => this.closed.emit(false),
        onBusyChange: (busy) => {
          this.busy = busy;
        },
      });
    } catch {
      this.loadError.set('Reload the page and try again.');
    }
  }

  cancel(event: Event): void {
    event.preventDefault();
    if (!this.busy) this.closed.emit(false);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.dispose?.();
    this.dialog.nativeElement.close();
  }
}
