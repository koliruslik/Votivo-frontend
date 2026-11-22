import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
export const accountGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.initialize();
  return (
    auth.authenticated() ||
    router.createUrlTree(['/account'], { queryParams: { returnTo: state.url } })
  );
};
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.initialize();
  return auth.isAdmin() || router.createUrlTree(['/polls']);
};
export const unsavedGuard: CanDeactivateFn<{
  hasUnsavedChanges(): boolean;
  isSaving(): boolean;
}> = (component) =>
  !component.isSaving() &&
  (!component.hasUnsavedChanges() || window.confirm('Discard your unsaved changes?'));
