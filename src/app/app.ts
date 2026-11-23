import { Component, ElementRef, HostListener, ViewChild, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly menuOpen = signal(false);
  protected readonly year = new Date().getFullYear();
  @ViewChild('accountMenu') private accountMenu?: ElementRef<HTMLDetailsElement>;

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
