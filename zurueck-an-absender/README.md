# Zurück an Absender

1v1-Tippspiel im Browser. Zwei Schiffe liegen sich gegenüber, Wörter sind Fracht.
Wer ein Wort von seinem Schiff abtippt, wirft es zum Gegner, und dabei wird es
länger (Haus → Haustür → Haustürschlüssel). Je schwerer die Fracht, desto tiefer
liegt das Schiff. Erreicht die Wasserlinie das Deck, sinkt es.

Eigenständiges Projekt neben `typing-royale` (im selben Repo, aber ohne gemeinsame
Dateien, Abhängigkeiten oder Imports).

## Starten

```bash
cd zurueck-an-absender
npm install
npm run dev          # http://localhost:5180 (typing-royale läuft auf 5173)
npm test             # Unit-Tests der Spiellogik
npm run check-chains # Wortketten prüfen (--verbose zeigt Überschneidungen)
```

## Stand

- [x] Schritt 1: Spiellogik mit Tests (ohne Grafik)
- [ ] Schritt 2: Schlichtes spielbares UI
- [ ] Schritt 3: Bot
- [ ] Schritt 4: Inseln und Upgrades (UI)
- [ ] Schritt 5: Treibgut und Ereignisse (UI)
- [ ] Schritt 6: Grafik, Effekte, Sound

## Regeln (Kurzfassung)

- **Zielen:** Einfach lostippen. Das Spiel wählt das passende Wort anhand der ersten
  Buchstaben (eigene Fracht und Treibgut). Bei mehreren Treffern das kürzeste, bei
  gleicher Länge Treibgut zuerst. Groß-/Kleinschreibung egal, Umlaute und ß exakt.
- **Tippfehler:** Der falsche Buchstabe bleibt markiert und muss mit Backspace
  entfernt werden. Escape bricht das aktuelle Wort ab.
- **Wurf:** Das Wort wächst um eine Stufe und fliegt ca. 1 s. Gewicht zählt erst bei
  der Landung. Gewicht = Anzahl Buchstaben.
- **Letzte Stufe:** Wächst nicht mehr, wiegt beim Landen +20 %. Hat es auf der
  letzten Stufe zweimal das Schiff gewechselt (ist also zurück beim ersten Absender),
  wird es durch ein frisches Endstufen-Wort ähnlicher Länge ersetzt.
- **Aufholmechanik:** Über 80 % Ladung wachsen eigene Würfe um zwei Stufen (maximal +2,
  auch zusammen mit Doppelwachstum).
- **Treibgut:** Fässer erscheinen in der Mitte. Wer zuerst fertig tippt, wirft es
  sofort zum Gegner. Nach 6 s treibt es zum leichteren Schiff. Das Spawn-Tempo steigt.
- **Inseln:** Alle 60–90 s, 5 s Vorwarnung, 10 s Pause. Kein Tippen, kein Treibgut,
  Würfe in der Luft landen noch. Eine von drei Upgrade-Karten wählen (1/2/3), sonst
  zufällig. Upgrades gelten nur für die aktuelle Runde.
- **Ereignisse:** Sturm (landende Würfe +25 %), Rückenwind (schnellere Würfe, mehr
  Treibgut), Abenddämmerung (rein visuell).
- **Match:** Best of 3.

## Steuerung

| Taste       | Wirkung                                       |
|-------------|-----------------------------------------------|
| Buchstaben  | Wort anvisieren und tippen                    |
| Backspace   | Tippfehler korrigieren / Buchstabe zurück     |
| Escape      | Aktuelles Wort abbrechen                      |
| Tab         | Ballast abwerfen (angetipptes Wort, falls Upgrade vorhanden) |
| 1 / 2 / 3   | Upgrade-Karte auf der Insel wählen            |
| F2          | Debug-Modus                                   |

## Architektur

```
src/
  core/         Reine, deterministische Spiellogik. Kein DOM, kein Zeitbezug.
    config.ts     Alle Balancing-Werte + Upgrade-Liste
    types.ts      GameState, Command, GameEvent
    game.ts       createGame(seed) und step(state, commands) → events
    targeting.ts  Zielauswahl, Tippfehler
    throw.ts      Wurf, Wachstum, Landung, Endstufen-Tausch
    schedule.ts   Inseln, Sturm/Rückenwind, Treibgut
    upgrades.ts   Kartenziehung und Effekte
    weight.ts     Ladung, Tragfähigkeit, Wasserlinie
    match.ts      Best of 3, Rundenstatistik
    rng.ts        Seed-basierter Zufall (kopiert aus typing-royale)
    words/        Wortketten (chains.ts) und Ziehen ohne Wiederholung (pool.ts)
  controllers/  Controller-Interface: Mensch, Bot, später Netzwerk
tests/          Vitest
scripts/        check-chains
```

**Ablauf pro Tick (60 Hz):** Jeder Controller liefert `Command[]`
(`key`, `backspace`, `cancel`, `ballast`, `chooseUpgrade`). `step()` wendet sie an,
lässt fällige Würfe landen, arbeitet den Zeitplan ab und gibt Events zurück
(`WORD_THROWN`, `WORD_LANDED`, `DRIFT_SPAWNED`, `ISLAND_START`, `UPGRADE_CHOSEN`,
`SHIP_SUNK` …). Rendering und Sound reagieren nur auf State und Events.

**Wo der Multiplayer andockt:** Die Logik ist deterministisch (Seed + Commands
ergeben immer denselben Verlauf). Für Online-Spiel reicht ein `NetworkController`,
der die Commands des Gegners pro Tick liefert, plus ein Austausch von Seed und
Commands (Lockstep). Am Kern ändert sich nichts. Alternativ kann ein Server `step()`
autoritativ ausführen und Events/State an beide Clients senden.
