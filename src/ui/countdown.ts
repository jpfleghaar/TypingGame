import { el } from './labels';

export interface CountdownHandle {
  cancel(): void;
}

/**
 * Countdown vor dem Rundenstart: zeigt 5 … 1 und "Los!", ruft pro Schritt
 * `onTick` (z. B. für einen Piepton) und am Ende `onDone` auf.
 * Läuft in Echtzeit; die Simulation ist währenddessen noch nicht gestartet.
 */
export function runCountdown(
  seconds: number,
  hint: string,
  onTick: (remaining: number) => void,
  onDone: () => void,
): CountdownHandle {
  const root = el('div', 'countdown');
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'assertive');
  const num = el('div', 'countdown-num');
  const label = el('div', 'countdown-label', 'Mach dich bereit');
  const sub = el('div', 'countdown-hint', hint);
  root.append(label, num, sub);
  document.body.append(root);

  let remaining = seconds;
  let timer = 0;
  let cancelled = false;

  const show = (text: string, final: boolean) => {
    num.textContent = text;
    num.classList.toggle('go', final);
    // Animation pro Zahl neu starten
    num.classList.remove('pop');
    void num.offsetWidth;
    num.classList.add('pop');
  };

  const step = () => {
    if (cancelled) return;
    if (remaining > 0) {
      show(String(remaining), false);
      onTick(remaining);
      remaining--;
      timer = window.setTimeout(step, 1000);
      return;
    }
    show('Los!', true);
    label.textContent = '';
    onTick(0);
    onDone();
    root.classList.add('leaving');
    timer = window.setTimeout(() => root.remove(), 600);
  };
  step();

  return {
    cancel() {
      cancelled = true;
      clearTimeout(timer);
      root.remove();
    },
  };
}
