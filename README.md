# Typing Royale

Ein Tipp-Battle-Royale im Browser für 19 Teilnehmer (du + 18 Bots). Die Angriffs-Mechanik ist von Tetris 99 inspiriert: Du tippst Wörter, baust Combos auf und schickst Müllwörter an deine Gegner. Wer überläuft, ist raus.

## Starten

Voraussetzung: Node.js ≥ 20.

```bash
npm install
npm run dev        # Entwicklungsserver, dann die angezeigte Adresse öffnen (meist http://localhost:5173)
```

Weitere Befehle:

| Befehl | Zweck |
|---|---|
| `npm test` | Unit-Tests (Vitest) |
| `npm run build` | Typecheck + Produktions-Build nach `dist/` |
| `npm run simulate -- 60` | Balancing-Simulation: 60 Runden nur mit Bots, zeigt Rundendauer und Platzierung nach WPM |
| `npm run words` | Wortlisten und Lern-Vokabeln aus `wordlists/` neu nach `src/data/words/*.json` bauen |

URL-Parameter für die Entwicklung: `?autostart` startet sofort eine Runde (`?autostart=1234` mit festem Seed), `&debug` blendet die Debug-Anzeige direkt ein, `&learn=en` bzw. `&learn=de` startet im Lernmodus, `?help` öffnet die Anleitung.

## Steuerung

| Taste | Wirkung |
|---|---|
| Buchstaben | Das **unterste** Wort tippen. Groß-/Kleinschreibung zählt. |
| `Tab` | Ziel-Strategie wechseln: Zufall → Angreifer → Schwache → K.O.-Jäger |
| `F4` | Ton an/aus |
| `F2` | Debug-Anzeige (Tick-Rate, eingehender Müll, Bot-Profile) |
| `Esc` | Runde abbrechen (im Übungsmodus: Runde beenden und auswerten) |

## Regeln in Kürze

- Vor jeder Runde läuft ein 5-Sekunden-Countdown (`countdownSeconds` in der Config). Tastendrücke zählen erst ab „Los!“.
- Dein Stapel fasst 12 Wörter. Regelmäßig kommt oben ein neues Wort dazu, und das Tempo steigt im Lauf der Runde. Ein 13. Wort bedeutet K.O. Tippst du deinen Stapel leer, bekommst du sofort das nächste Wort.
- Alle Spieler bekommen dieselbe Wortfolge, jeder in seinem eigenen Tempo. Die Müllwörter sind für jeden Spieler zufällig.
- **Combo:** Jedes fehlerfreie Wort erhöht sie. Ein Tippfehler setzt sie auf 0, das Wort bleibt stehen.
- **Angriffe:** Bei Combo 3, 6 und 10 schickst du 1, 2 bzw. 3 Müllwörter, danach alle 8 Wörter 2.
- **Müll** landet nach 3 s Vorwarnung (Balken links neben dem Stapel) direkt über deinem aktiven Wort. Müllwörter werden im Lauf der Runde schwerer: erst normale lange Wörter, später Komposita und Monster-Wörter mit gemischter Groß-/Kleinschreibung. Sie enthalten nur Buchstaben.
- **Abwehr:** Ein eigener Angriff verrechnet zuerst den Müll, der gerade zu dir unterwegs ist. Nur der Rest geht an dein Ziel.
- **K.O.-Abzeichen:** Wer jemanden K.O. schickt (d. h. in den letzten 10 s Müll bei ihm gelandet hat), bekommt dessen Abzeichen + 1. Ab 2 / 6 / 14 / 30 Abzeichen sind deine Angriffe um 25 / 50 / 75 / 100 % stärker.
- **Lernmodus:** Unter „Sprache“ gibt es „Deutsch lernen“ und „Englisch lernen“. Du tippst Wörter in der Lernsprache, die Übersetzung steht klein daneben. Wahlweise im Battle Royale oder „In Ruhe“ (ohne Gegner, ohne Müll, langsameres Tempo).
- **Übungsliste:** Nach jeder Runde werden Wörter gespeichert, die du im Verhältnis zu deinem Schnitt langsam oder fehlerhaft getippt hast. Im Menü kannst du sie ansehen und ohne Gegner üben.

Eine ausführliche Anleitung für Spieler gibt es im Spiel (Button „Anleitung“ im Menü). Die Zahlen darin kommen direkt aus der Config.

## Sound

Alles wird synthetisch mit der Web Audio API erzeugt, ohne Audiodateien ([`src/audio/AudioEngine.ts`](src/audio/AudioEngine.ts)). Die Musik ist ein treibender 8-Takt-Loop in a-Moll mit 128 BPM, der im Lauf der Runde auf 152 BPM anzieht. Mit der Combo kommen Schichten dazu: ab 3 Hi-Hats, ab 6 ein Arpeggio mit Echo, ab 10 Lead-Melodie, Crash und Riser. Ist der eigene Stapel fast voll oder kommt Müll, setzt eine pulsierende Spannungs-Schicht ein.

## Balancing

Alle Werte stehen zentral in [`src/core/config.ts`](src/core/config.ts): Spawn-Tempo und Rampe, Stapelhöhe, Combo-Stufen, Müllmenge, Warnzeit, Abzeichen-Bonus, Zielwahl und Problemwort-Erkennung. Nach Änderungen zeigt `npm run simulate`, wie sich Rundendauer und Platzierungen verschieben.

Stand der Simulation (60 Runden, Bots mit 25–110 WPM): Eine Runde dauert im Schnitt etwa 4:20 (alle zwischen 4:00 und 4:45). Spieler unter 30 WPM überleben etwa 1:05, mit 45–59 WPM etwa 2:20, mit 60–75 WPM etwa 2:45.

## Architektur

```
src/
├─ core/            Spiellogik: rein, deterministisch, kein DOM, keine Echtzeit
│  ├─ config.ts     alle Balancing-Werte
│  ├─ types.ts      State, Commands (Eingaben), Events (Ausgaben)
│  ├─ game.ts       createGame() und step(state, bank, commands) → events
│  ├─ garbage.ts    Combo → Müll, Abzeichen-Bonus, Verrechnung
│  ├─ targeting.ts  die vier Ziel-Strategien
│  ├─ stats.ts      WPM, Genauigkeit, Endübersicht, Problemwörter
│  ├─ rng.ts        Zufall aus einem Seed (mulberry32)
│  └─ words/        Wortauswahl ohne Wiederholung, Müllwort-Generator
├─ controllers/     wer Eingaben liefert: Tastatur (LocalController) oder Bot (BotController)
├─ runtime/         GameRunner (feste Tick-Schleife), Session-Aufbau, Headless-Runner
├─ ui/              DOM-Ansichten: Menü, Spiel, Auswertung, Anleitung, Debug
├─ fx/              Canvas-Effekte (Partikel, Combo-Rand, Lichtspuren)
├─ audio/           Web-Audio-Synthese (Effekte + mehrschichtiger Musik-Loop)
└─ data/words/      erzeugte Wortlisten (DE/EN, 8 Themen, kurz/mittel/lang) und Lern-Vokabeln (vocab.json)
wordlists/          editierbare Rohlisten, eine Textdatei pro Thema
scripts/            Wortlisten-Build und Balancing-Simulation
tests/              Vitest
```

### Datenfluss

```
Controller (Tastatur / Bot / später Netzwerk)
        │  poll(state) → Command[]       z. B. { type: 'KEY', playerId, key }
        ▼
GameRunner  ── feste 60 Ticks/s ──►  step(state, bank, commands)  ──►  GameEvent[]
                                                                     │
                     ┌───────────────────────────────────────────────┼──────────────┐
                     ▼                         ▼                     ▼              ▼
                 GameView (DOM)          EffectsBridge (Canvas)   AudioEngine   DebugPanel
```

Grundsätze:

1. **Die Logik ist deterministisch.** `step()` hängt nur vom State und den Befehlen ab. Zufall kommt aus Seeds, deren Zustand im State liegt. Gleicher Seed + gleiche Befehle ergeben exakt denselben Verlauf (`tests/determinism.test.ts`). Befehle mehrerer Spieler im selben Tick werden nach Spieler-ID sortiert, damit ihre Ankunftsreihenfolge egal ist.
2. **Der State ist reines JSON:** keine Klassen, Funktionen oder DOM-Referenzen. Er lässt sich also kopieren, vergleichen und verschicken.
3. **Alle Spieler sind Controller.** Mensch und Bot implementieren dasselbe Interface `Controller` und wirken ausschließlich über Commands. Bots sehen nur den eigenen Stapel und können nicht schummeln (`tests/bots.test.ts`).
4. **Darstellung nur über Events.** UI, Effekte und Sound lesen den State und reagieren auf Events. Sie verändern nie etwas am Spiel.
5. **Die Textzone bleibt frei.** Partikel und Combo-Rand liegen auf einem Canvas hinter dem DOM. Lichtspuren liegen auf einem Canvas davor, auf dem der eigene Stapel per Clipping ausgeschnitten ist. Bei `prefers-reduced-motion` oder mit „Effekte reduzieren“ im Menü sind alle bewegten Effekte aus.

### Wo der Online-Multiplayer andockt

Die Architektur ist auf ein **Lockstep-Modell** ausgelegt: Alle Clients rechnen dieselbe Simulation, verschickt werden nur Eingaben.

1. **Server (neu):** Er würfelt den Seed und die Startaufstellung und schickt beides an alle. Danach sammelt er pro Tick die Commands aller Spieler und verteilt sie als Paket `{ tick, commands[] }`. Das Format existiert bereits als `TickRecord` in `GameRunner.log`.
2. **`NetworkController` (neu, `src/controllers/`):** Er implementiert `Controller` und gibt in `poll()` die Commands eines entfernten Spielers zurück, die der Server für diesen Tick geliefert hat.
3. **Lokaler Spieler:** Der `LocalController` schickt seine Tastendrücke zusätzlich an den Server. Ausgeführt werden sie erst, wenn sie im Server-Paket für den Tick zurückkommen. Das gibt allen Clients dieselbe Reihenfolge.
4. **`GameRunner`:** Er darf einen Tick erst rechnen, wenn das Server-Paket dafür da ist. Gegen spürbare Verzögerung beim Tippen hilft eine lokale Vorschau: die eigene Eingabe sofort anzeigen und bestätigen, sobald der Tick eintrifft.
5. **Bots** können weiter auf dem Server oder deterministisch auf allen Clients laufen. Sie sind ohnehin nur Controller mit eigenem Seed.

`src/core/` muss dafür nicht geändert werden. Zur Absicherung können Clients regelmäßig einen Hash von `JSON.stringify(state)` vergleichen.

## Wortlisten erweitern

Die Rohlisten liegen in `wordlists/<sprache>/<thema>.txt`, ein Wort pro Leerzeichen. Die Lern-Vokabeln liegen in `wordlists/vocab/<thema>.txt` mit einem Paar pro Zeile (`Schmetterling butterfly`). `_garbage.txt` enthält zusätzliche schwere Wörter für Müll. Erlaubt sind nur Buchstaben inkl. ÄÖÜäöüß. Nach dem Bearbeiten `npm run words` ausführen: Das Skript prüft die Zeichen, entfernt Duplikate und sortiert nach Länge (kurz ≤ 5, mittel 6–9, lang ≥ 10 Zeichen). Ein neues Thema braucht in `scripts/build-words.mjs` nur ein Anzeige-Label.
