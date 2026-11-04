# Typing Royale

Ein Tipp-Battle-Royale im Browser für 11 Teilnehmer (du + 10 Bots). Die Angriffs-Mechanik ist von Tetris 99 inspiriert: Du tippst Wörter, baust Combos auf und schickst Müllwörter an deine Gegner. Wer überläuft, ist raus.

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
| `Leertaste` | Ein Wort aus dem Angriffs-Pool sofort abschicken (sonst automatisch eins alle 5 s) |
| `Tab` | Spam abwehren, wenn welcher kommt und du Combo hast (1 Combo-Punkt pro Wort) – sonst Ziel-Strategie wechseln: Zufall → Angreifer → Schwache → K.O.-Jäger |
| `1`–`5`, `6`–`0` | Gegner direkt anvisieren: links von oben 1–5, rechts von oben 6–9 und 0 (Strategie „Manuell“) |
| `F4` | Ton an/aus |
| `F2` | Debug-Anzeige (Tick-Rate, eingehender Müll, Bot-Profile) |
| `Esc` | Zurück zum Menü, im Spiel mit Nachfrage „Wirklich aufgeben?“ (Spiel pausiert); ohne Gegner gibt es danach die Auswertung |

## Regeln in Kürze

- Vor jeder Runde läuft ein 5-Sekunden-Countdown (`countdownSeconds` in der Config). Tastendrücke zählen erst ab „Los!“.
- Dein Stapel fasst 12 Wörter. Regelmäßig kommt oben ein neues Wort dazu, und das Tempo steigt im Lauf der Runde. Ein 13. Wort bedeutet K.O. Tippst du deinen Stapel leer, bekommst du sofort das nächste Wort.
- Alle Spieler bekommen dieselbe Wortfolge, jeder in seinem eigenen Tempo. Die Müllwörter sind für jeden Spieler zufällig.
- **Combo:** Jedes fehlerfreie Wort erhöht sie. Ein Tippfehler setzt sie auf 0, das Wort bleibt stehen.
- **Angriffe:** Bei Combo 3, 6 und 10 wird ein Angriff mit 1, 2 bzw. 3 Müllwörtern geladen, danach alle 8 Wörter 2. Die Wörter kommen in einen Pool: Jede Leertaste schickt ein Wort daraus, ohne Leertaste geht alle 5 s automatisch eins raus (`attack.autoSendIntervalMs`).
- **Müll** landet nach 3 s Vorwarnung (Balken links neben dem Stapel) direkt über deinem aktiven Wort. Müll sind die **längsten Wörter aus dem Stapel des Angreifers**: Sie werden verschoben, verlassen also seinen Stapel (das aktive Wort bleibt). Hat er zu wenige, wird mit langen Listenwörtern aufgefüllt. Erst im Finale (2 Spieler übrig) kommt gemischte Groß-/Kleinschreibung dazu.
- **Abwehr:** Mit `Tab` wehrst du eingehenden Müll ab; jedes Wort kostet 1 Combo-Punkt (`defense.comboCostPerWord`). Außerdem verrechnet ein eigener Angriff zuerst den Müll, der gerade zu dir unterwegs ist. Nur der Rest geht an dein Ziel.
- **K.O.-Abzeichen:** Wer jemanden K.O. schickt (d. h. in den letzten 10 s Müll bei ihm gelandet hat), bekommt dessen Abzeichen + 1. Ab 2 / 6 / 14 / 30 Abzeichen sind deine Angriffe um 25 / 50 / 75 / 100 % stärker.
- **Lernmodus:** Unter „Sprache“ gibt es „Deutsch lernen“ und „Englisch lernen“. Du tippst Wörter in der Lernsprache, die Übersetzung steht klein daneben. Wahlweise im Battle Royale oder „In Ruhe“ (ohne Gegner, ohne Müll, langsameres Tempo).
- **Problemwörter:** Die Auswertung zeigt Wörter, die du im Verhältnis zu deinem Schnitt langsam oder fehlerhaft getippt hast.

Eine ausführliche Anleitung für Spieler gibt es im Spiel (Button „Anleitung“ im Menü). Die Zahlen darin kommen direkt aus der Config.

## Sound

Alles wird synthetisch mit der Web Audio API erzeugt, ohne Audiodateien ([`src/audio/AudioEngine.ts`](src/audio/AudioEngine.ts)). Die Musik ist ein treibender 8-Takt-Loop in a-Moll mit 128 BPM, der im Lauf der Runde auf 152 BPM anzieht. Mit der Combo kommen Schichten dazu: ab 3 Hi-Hats, ab 6 ein Arpeggio mit Echo, ab 10 Lead-Melodie, Crash und Riser. Ist der eigene Stapel fast voll oder kommt Müll, setzt eine pulsierende Spannungs-Schicht ein.

## Balancing

Alle Werte stehen zentral in [`src/core/config.ts`](src/core/config.ts): Spawn-Tempo und Rampe, Stapelhöhe, Combo-Stufen, Müllmenge, Warnzeit, Abzeichen-Bonus, Zielwahl und Problemwort-Erkennung. Nach Änderungen zeigt `npm run simulate`, wie sich Rundendauer und Platzierungen verschieben.

Stand der Simulation (60 Runden, 11 Spieler, Bots mit 25–110 WPM): Eine Runde dauert im Schnitt etwa 5:00 (alle zwischen 4:10 und 5:55). Spieler unter 30 WPM überleben etwa 1:10, mit 45–59 WPM etwa 2:55, mit 60–75 WPM etwa 3:30. Bots schicken Wörter aus ihrem Pool einzeln mit profilabhängiger Reaktionszeit ab und wehren mit 20–85 % Wahrscheinlichkeit ab.

Die Spielerzahl steht zentral in `DEFAULT_BOT_FIELD` ([`src/controllers/botProfiles.ts`](src/controllers/botProfiles.ts)).

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

## Theme „Platine“ (Hintergrundbild)

Das Theme „Platine“ nutzt ein Hintergrundbild mit fest eingezeichneten Leiterbahnen zu den Anschlüssen P1–P10. Die Spielfläche ist darauf abgestimmt und wird als Ganzes aufs Fenster skaliert: Jeder der 10 Gegner sitzt auf einem Anschluss, der Posteingang liegt über dem Chip. Gerendert wird mit WebGL (PixiJS) und Bloom ([`src/fx/pcb/PcbRenderer.ts`](src/fx/pcb/PcbRenderer.ts)):

- Bahn-Bündel zum aktuellen Ziel leuchten bernsteinfarben, Bündel von Angreifern pulsieren rot, die Bahn eines ausgeschiedenen Gegners erlischt.
- Angriffe fliegen als rote Lichtimpulse über die Bahnen.

Ein neues Hintergrundbild bindest du so ein:

```bash
python3 scripts/extract-board.py <bild.jpg>
```

Das Skript (benötigt ImageMagick) findet die goldenen Leiterbahn-Bündel im Bild, schreibt je Anschluss eine Leucht-Maske (`src/assets/pcb/trace-pN.png`) und die Mittellinie für die Pakete (`src/fx/pcb/boardLayout.json`). Lage der Anschlüsse und des Chips stehen oben im Skript. Kartenplätze und Arena: [`src/fx/pcb/board.ts`](src/fx/pcb/board.ts). Der Gegner-Avatar liegt in `src/assets/pcb/avatar.png`.

Platine ist derzeit das einzige Theme im Menü (Theme- und Layout-Auswahl sind ausgeblendet). Der klassische Stil und das Layout „Wörter links“ sind im Code noch vorhanden, z. B. für spätere Level, und lassen sich in der Entwicklung mit `?theme=classic&layout=split` aufrufen. Ohne WebGL fällt das Spiel auf eine einfache Canvas-Platine ohne Bild zurück.

Menü, Anleitung und Auswertung nutzen ein eigenes Hintergrundbild ohne Anschlüsse (`src/assets/pcb/menu_board.jpeg`, gleiches Seitenverhältnis wie das Spielbild).
