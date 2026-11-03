/**
 * Bewegungsreduzierter Modus: greift bei prefers-reduced-motion ODER wenn der
 * Spieler im Menü "Effekte reduzieren" gewählt hat (Klasse am <html>).
 */
const query = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

export function systemPrefersReducedMotion(): boolean {
  return query?.matches ?? false;
}

export function motionReduced(): boolean {
  return systemPrefersReducedMotion() || document.documentElement.classList.contains('reduced-fx');
}

export function onSystemMotionChange(cb: () => void): void {
  query?.addEventListener('change', cb);
}

export function setReducedFx(on: boolean): void {
  document.documentElement.classList.toggle('reduced-fx', on);
}
