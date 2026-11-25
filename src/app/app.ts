import {
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { PhotoService } from './core/services/photo.service';
@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly photos = inject(PhotoService);
  protected readonly menuOpen = signal(false);
  protected readonly year = new Date().getFullYear();
  @ViewChild('accountMenu') private accountMenu?: ElementRef<HTMLDetailsElement>;

  constructor() {
    const router = inject(Router);
    let landedFor: string | null = null;
    effect(() => {
      const active = this.auth.authenticated();
      const admin = this.auth.isAdmin();
      const owner = this.auth.userId();
      if (!active) {
        landedFor = null;
        if (this.auth.accountRestricted())
          untracked(() => void router.navigateByUrl('/polls', { replaceUrl: true }));
        return;
      }
      if (!admin || landedFor === owner) return;
      landedFor = owner;
      untracked(() => {
        const path = window.location.pathname;
        if (path !== '/admin' && !path.startsWith('/admin/'))
          void router.navigateByUrl('/admin', { replaceUrl: true });
      });
    });
  }

  @HostListener('document:click', ['$event'])
  protected closeAccountOutside(event: MouseEvent): void {
    const menu = this.accountMenu?.nativeElement;
    if (menu && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
  }

  @HostListener('document:keydown.escape')
  protected closeAccountOnEscape(): void {
    const menu = this.accountMenu?.nativeElement;
    if (menu?.open) {
      menu.open = false;
      menu.querySelector('summary')?.focus();
    }
  }
}
