// Platzhalter bis Schritt 2: zeigt nur, dass Logik und Wortketten laden.
import { CHAINS, createGame } from './core';

const g = createGame({ seed: Date.now() >>> 0 });
document.querySelector('#app')!.innerHTML = `
  <h1>Zurück an Absender</h1>
  <p>Schritt 1: Spiellogik ist fertig, UI folgt in Schritt 2.</p>
  <p>${CHAINS.length} Wortketten geladen. Beispiel-Startfracht: ${g.ships[0].cargo.map((c) => c.text).join(', ')}</p>
`;
