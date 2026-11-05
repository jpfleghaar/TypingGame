# Typing Royale

Ein Tipp-Battle-Royale im Browser für 11 Teilnehmer: allein gegen 10 Bots oder mit Freunden im Mehrspieler-Raum (freie Plätze füllen Bots auf). Die Angriffs-Mechanik ist von Tetris 99 inspiriert: Du tippst fehlerfrei, sammelst Punkte und gibst sie für Angriffe (Müllwörter an deine Gegner) oder Abwehr aus. Wer überläuft, ist raus.

## Starten

Voraussetzung: Node.js ≥ 20.

```bash
npm install
npm run dev        # Entwicklungsserver, dann die angezeigte Adresse öffnen (meist http://localhost:5173)
```

Weitere Befehle:

| Befehl | Zweck |
|---|---|
| `npm run server` | Mehrspieler-Server auf Port 8787 (siehe [Mehrspieler](#mehrspieler)) |
| `npm run lan` | Spiel bauen und mit dem Mehrspieler-Server ausliefern – eine Adresse für alle |
| `npm test` | Unit-Tests (Vitest) |
| `npm run build` | Typecheck + Produktions-Build nach `dist/` |
| `npm run simulate -- 60` | Balancing-Simulation: 60 Runden nur mit Bots, zeigt Rundendauer und Platzierung nach WPM |
| `npm run words` | Wortlisten und Lern-Vokabeln aus `wordlists/` neu nach `src/data/words/*.json` bauen |

URL-Parameter: `?raum=ABCD` tritt direkt dem Mehrspieler-Raum ABCD bei (Einladungslink). Für die Entwicklung: `?autostart` startet sofort eine Runde (`?autostart=1234` mit festem Seed), `&debug` blendet die Debug-Anzeige direkt ein, `&learn=en` bzw. `&learn=de` startet im Lernmodus, `&mode=endless` im Endlos-Modus, `?help` öffnet die Anleitung.

## Steuerung

| Taste | Wirkung |
|---|---|
| Buchstaben | Das **unterste** Wort tippen. Groß-/Kleinschreibung zählt. |
| `Enter` | Angriff: **alle** Punkte ausgeben, 1 Müllwort pro Punkt an das aktuelle Ziel |
| `Tab` | Spam abwehren, wenn welcher kommt und du Punkte hast (1 Punkt pro Wort) – sonst Ziel-Strategie wechseln: Zufall → Angreifer → Schwache → K.O.-Jäger |
| `Leertaste` | keine Funktion (damit niemand aus Gewohnheit angreift) |
| `1`–`5`, `6`–`0` | Gegner direkt anvisieren: links von oben 1–5, rechts von oben 6–9 und 0 (Strategie „Manuell“) |
| `F4` | Ton an/aus |
| `F2` | Debug-Anzeige (Tick-Rate, eingehender Müll, Bot-Profile) |
| `Esc` | Zurück zum Menü, im Spiel mit Nachfrage „Wirklich aufgeben?“ (Spiel pausiert); ohne Gegner gibt es danach die Auswertung |

## Regeln in Kürze

- Vor jeder Runde läuft ein 5-Sekunden-Countdown (`countdownSeconds` in der Config). Tastendrücke zählen erst ab „Los!“.
- Dein Stapel fasst 12 Wörter. Regelmäßig kommt oben ein neues Wort dazu, und das Tempo steigt im Lauf der Runde. Ein 13. Wort bedeutet K.O. Tippst du deinen Stapel leer, bekommst du sofort das nächste Wort.
- Alle Spieler bekommen dieselbe Wortfolge, jeder in seinem eigenen Tempo. Die Müllwörter sind für jeden Spieler zufällig.
- **Punkte (sichere Währung):** Fehlerfreie Wörter bringen Punkte, höchstens 8 (`points.max`). Einmal verdiente Punkte gehen nicht verloren, auch nicht durch Tippfehler. Was über das Maximum hinaus verdient wird, verfällt; die Punkte-Leiste rechts neben dem Posteingang zeigt dann „MAX“. Darunter zeigt ein kleiner Balken den Fortschritt zum nächsten Punkt.
- **Combo (Tempo):** +1 für jedes Wort ganz ohne Tippfehler; ein Wort mit Fehler zählt nicht. Die Combo bestimmt, wie viele Wörter ein Punkt braucht (`points.rates`): Combo 0–9 → 3 Wörter, 10–19 → 2 Wörter, ab 20 → 1 Wort. Ein Tippfehler setzt die Combo **und** den Fortschritt zum nächsten Punkt auf 0, gesammelte Punkte bleiben. Punkte ausgeben ändert die Combo nicht. Die Combo leuchtet als Rahmen um den Posteingang (Stufen 1 / 5 / 10 / 20).
- **Angriff (`Enter`):** Gibt alle Punkte aus und schickt pro Punkt 1 Müllwort (`attack.garbagePerPoint`, plus Abzeichen-Bonus) an das aktuelle Ziel. Eingehender Müll wird dabei **nicht** verrechnet.
- **Müll** landet nach 3 s Vorwarnung (Balken links neben dem Stapel) direkt über deinem aktiven Wort. Müll sind die **längsten Wörter aus dem Stapel des Angreifers**: Sie werden verschoben, verlassen also seinen Stapel (das aktive Wort bleibt). Hat er zu wenige, wird mit langen Listenwörtern aufgefüllt. Erst im Finale (2 Spieler übrig) kommt gemischte Groß-/Kleinschreibung dazu.
- **Abwehr (`Tab`):** Wehrt eingehenden Müll ab, 1 Punkt pro Wort (`defense.pointsPerWord`), älteste Wörter zuerst. Beim K.O. ist der Spieler raus, seine Punkte spielen dann keine Rolle mehr.
- **Auswertung:** Am Ende stehen Max. Combo, verdiente Punkte, für Angriff bzw. Abwehr ausgegebene und verfallene Punkte.
- **K.O.-Abzeichen:** Wer jemanden K.O. schickt (d. h. in den letzten 10 s Müll bei ihm gelandet hat), bekommt dessen Abzeichen + 1. Ab 2 / 6 / 14 / 30 Abzeichen sind deine Angriffe um 25 / 50 / 75 / 100 % stärker.
- **Endlos-Modus:** Allein, ohne Gegner. Die Wörter kommen immer schneller (nach 2 Minuten jede Minute 15 % schneller, ohne Obergrenze). Gezählt wird, wie lange du durchhältst. Die Bestzeit wird pro Sprache im Browser gespeichert und im Spiel als Kachel „Rekord“ angezeigt. Simuliert hält man mit 30 WPM etwa 1:50 durch, mit 70 WPM etwa 3:30 und mit 110 WPM etwa 5:30.
- **Lernmodus:** Unter „Sprache“ gibt es „Deutsch lernen“ und „Englisch lernen“. Du tippst Wörter in der Lernsprache, die Übersetzung steht klein daneben. Das geht im Battle Royale, im Endlos-Modus oder „In Ruhe“ (ohne Gegner, ohne Müll, langsameres Tempo).
- **Problemwörter:** Die Auswertung zeigt Wörter, die du im Verhältnis zu deinem Schnitt langsam oder fehlerhaft getippt hast.

Eine ausführliche Anleitung für Spieler gibt es im Spiel (Button „Anleitung“ im Menü). Die Zahlen darin kommen direkt aus der Config.

## Mehrspieler

Im eigenen WLAN geht es am einfachsten so:

```bash
npm run lan
```

Das baut das Spiel und startet den Server. Er zeigt die Adressen an, z. B. `http://192.168.178.20:8787`. Diese Adresse öffnen alle im Browser. Dann:

1. Eine Person klickt im Menü unter **Mehrspieler** auf **Raum erstellen** und bekommt einen 4-stelligen Code und einen Einladungslink.
2. Die anderen geben den Code ein und klicken **Beitreten** – oder öffnen einfach den Einladungslink.
3. Der Gastgeber stellt Sprache, Thema und Zahl der Bots ein und startet die Runde. Bots füllen bis höchstens 11 Spieler auf.

Während der Entwicklung laufen `npm run dev -- --host` und `npm run server` nebeneinander; Vite leitet `/ws` an den Server weiter. Ist der Port gesperrt, muss die Firewall Port 8787 (bzw. 5173) im lokalen Netz erlauben.

Bricht die Verbindung ab oder lädt jemand die Seite neu, bleibt sein Platz 60 Sekunden reserviert. Der Browser verbindet sich automatisch neu und steigt wieder in die laufende Runde ein. Hat jemand noch eine veraltete Seite offen, wird er beim Beitreten gebeten, sie neu zu laden.

Unterschiede zum Einzelspiel: Die Runde lässt sich nicht pausieren. Nach dem eigenen K.O. kannst du zuschauen. Die Auswertung kommt, sobald die Runde für alle vorbei ist.

## Sound

Alles wird synthetisch mit der Web Audio API erzeugt, ohne Audiodateien ([`src/audio/AudioEngine.ts`](src/audio/AudioEngine.ts)). Die Musik ist ein treibender 8-Takt-Loop in a-Moll mit 128 BPM, der im Lauf der Runde auf 152 BPM anzieht. Mit der Combo kommen Schichten dazu: ab 3 Hi-Hats, ab 6 ein Arpeggio mit Echo, ab 10 Lead-Melodie, Crash und Riser. Ist der eigene Stapel fast voll oder kommt Müll, setzt eine pulsierende Spannungs-Schicht ein.

## Balancing

Alle Werte stehen zentral in [`src/core/config.ts`](src/core/config.ts): Spawn-Tempo und Rampe, Stapelhöhe, Punkte (Maximum, Wörter pro Punkt je Combo), Müll pro Punkt, Abwehrkosten, Warnzeit, Abzeichen-Bonus, Zielwahl und Problemwort-Erkennung. Nach Änderungen zeigt `npm run simulate`, wie sich Rundendauer und Platzierungen verschieben.

Stand der Simulation (40 Runden, 11 Spieler, Bots mit 25–110 WPM): Eine Runde dauert im Schnitt etwa 4:05 (2:30 bis 4:45, 95 % im Zielbereich 3–6 min). Bots entscheiden selbst: Sie wehren kurz vor dem Einschlag ab (immer, wenn es eng wird, sonst mit 20–85 % Wahrscheinlichkeit), sparen, solange Müll unterwegs ist oder der eigene Stapel voll wird, und greifen ab ihrer persönlichen Schwelle (2–6 Punkte), am Maximum oder für einen Gnadenstoß an.

Die Spielerzahl steht zentral in `DEFAULT_BOT_FIELD` ([`src/controllers/botProfiles.ts`](src/controllers/botProfiles.ts)).

## Architektur

```
src/
├─ core/            Spiellogik: rein, deterministisch, kein DOM, keine Echtzeit
│  ├─ config.ts     alle Balancing-Werte
│  ├─ types.ts      State, Commands (Eingaben), Events (Ausgaben)
│  ├─ game.ts       createGame() und step(state, bank, commands) → events
│  ├─ garbage.ts    Wörter pro Punkt, Abzeichen-Bonus, Abwehr-Verrechnung
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
Controller (Tastatur / Bot / Netzwerk)
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

### Mehrspieler (Lockstep)

Alle Teilnehmer rechnen dieselbe Simulation, verschickt werden nur Eingaben:

1. **Server** ([`server/`](server/)): Er würfelt beim Start den Seed und schickt allen die Aufstellung (`MatchSetup`: Einstellungen, Seed, Namen). Menschen bekommen die IDs 0…n-1, danach folgen die Bots. Der Server rechnet die Runde in Echtzeit selbst mit und steuert die **Bots**. Eingehende Tastendrücke ordnet er dem nächsten Tick zu und verteilt pro Tick die Befehle **aller** Spieler (`{ upTo, cmds: [tick, Command[]][] }`).
2. **Browser:** Der `GameRunner` bekommt einen `NetFeed` als einzigen Controller und Taktgeber. Er rechnet nur Ticks, für die der Server die Befehle freigegeben hat. Der eigene `LocalController` liefert nicht direkt ins Spiel, sondern schickt die Tasten an den Server. Sie wirken, wenn sie im Tick-Paket zurückkommen. So haben alle dieselbe Reihenfolge.
3. **Absicherung:** Alle 2 Sekunden schickt der Server eine Prüfsumme des Spielstands mit. Weicht ein Browser ab, hält er an und übernimmt den kompletten Spielstand vom Server (der State ist reines JSON).
4. **Version:** `__GAME_VERSION__` ist eine Prüfsumme über Regeln, Bots, Wortlisten und Netzwerkcode. Sie wird in `vite.config.ts` berechnet und gilt für Build und Server gleichermaßen. Browser mit anderer Version werden abgewiesen (`outdated`).
5. **Wieder-Einstieg:** Jeder Platz hat einen geheimen Schlüssel (sessionStorage). Mit `rejoin` bekommt man denselben Platz zurück, mitten in der Runde inklusive des aktuellen Spielstands.
6. **Vorab-Anzeige:** Eigene Buchstaben erscheinen sofort im aktiven Wort (`NetFeed.pendingKeys`), bevor der Server sie bestätigt. Gerechnet wird trotzdem nur mit bestätigten Eingaben.
7. **Sicherheit:** Der Server nimmt nur gültige Befehle an und setzt immer die Spieler-ID des Absenders ein (`sanitizeCommand`). Niemand kann für andere tippen.
8. **Rundenende:** Sind alle Menschen raus, rechnet der Server die Runde sofort zu Ende. Danach ist der Raum wieder offen für die nächste Runde.

`src/core/` musste dafür nicht geändert werden. Die Lobby-Logik in [`server/rooms.ts`](server/rooms.ts) ist unabhängig vom Netzwerk und wird in `tests/multiplayer.test.ts` getestet.

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
