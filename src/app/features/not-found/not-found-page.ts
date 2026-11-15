import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink],
  template:
    '<h1>Page not found</h1><p>This page is not available.</p><a routerLink="/polls">Back to polls</a>',
})
export class NotFoundPage {}
