/**
 * Merkt sich den eigenen Platz im Mehrspieler-Raum (pro Browser-Tab). Damit
 * kommt man nach Neuladen oder einem Verbindungsabbruch auf denselben Platz zurück.
 */
const KEY = 'typing-royale.seat.v1';

export interface Seat {
  code: string;
  token: string;
}

export function loadSeat(): Seat | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Seat | null;
    return s && typeof s.code === 'string' && typeof s.token === 'string' ? s : null;
  } catch {
    return null;
  }
}

export function saveSeat(seat: Seat | null): void {
  try {
    if (seat) sessionStorage.setItem(KEY, JSON.stringify(seat));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* ohne Speicher eben kein Wieder-Einstieg nach Neuladen */
  }
}
