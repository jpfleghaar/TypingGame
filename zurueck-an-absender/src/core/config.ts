/**
 * Zentrale Balancing-Werte. Alle Zeiten in Millisekunden; die Logik rechnet
 * intern in Ticks (siehe msToTicks).
 */

export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;
export const msToTicks = (ms: number): number => Math.round(ms / TICK_MS);
export const ticksToMs = (ticks: number): number => ticks * TICK_MS;

export type UpgradeId =
  | 'doubleGrowth'
  | 'tarp'
  | 'planks'
  | 'fastCannon'
  | 'bilgePump'
  | 'harpoon'
  | 'ballast'
  | 'anchor'
  | 'lookout';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  description: string;
  /** Darf mehrfach pro Runde gewählt werden? */
  stackable: boolean;
}

/** Erweiterbare Liste: neue Karte hier eintragen und in upgrades.ts den Effekt ergänzen. */
export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'doubleGrowth', name: 'Doppelwachstum', description: 'Deine nächsten 3 Würfe wachsen um zwei Stufen.', stackable: true },
  { id: 'tarp', name: 'Schutzplane', description: 'Der nächste eingehende Wurf prallt ab und fällt ins Meer.', stackable: true },
  { id: 'planks', name: 'Stärkere Planken', description: 'Tragfähigkeit +10 %.', stackable: true },
  { id: 'fastCannon', name: 'Schnelle Kanone', description: 'Deine Würfe fliegen 40 % schneller.', stackable: true },
  { id: 'bilgePump', name: 'Lenzpumpe', description: 'Sofort 15 Gewicht weniger.', stackable: true },
  { id: 'harpoon', name: 'Harpune', description: 'Treibgut gilt schon nach der Hälfte der Buchstaben als gefischt.', stackable: false },
  { id: 'ballast', name: 'Ballast abwerfen', description: 'Einmal ein Wort antippen und mit Tab über Bord werfen.', stackable: true },
  { id: 'anchor', name: 'Anker', description: 'Der nächste Sturm wirkt nicht auf dein Schiff.', stackable: true },
  { id: 'lookout', name: 'Ausguck', description: 'Zeigt an, welches Ereignis als nächstes kommt.', stackable: false },
];

export function createConfig() {
  return {
    ship: {
      /** Gebalanced per `npm run simulate`: Mittel gegen Mittel ≈ 3:40 pro Runde. */
      capacity: 260,
      startWords: 6,
    },
    throw: {
      flightMs: 1000,
      /** Wort auf letzter Stufe wiegt beim Landen so viel mehr. */
      finalStageBonus: 0.2,
      /** Nach so vielen Schiffswechseln auf letzter Stufe wird das Wort ersetzt. */
      finalStageSwapAfterHops: 2,
    },
    catchup: {
      /** Ab diesem Füllstand wachsen eigene Würfe stärker. */
      threshold: 0.8,
      growth: 2,
    },
    drift: {
      enabled: true,
      firstSpawnMs: 8000,
      intervalStartMs: 16000,
      intervalMinMs: 4500,
      /** Faktor pro Spielminute: 0.8 = Intervall schrumpft jede Minute um 20 %. */
      intervalShrinkPerMinute: 0.8,
      lifetimeMs: 6000,
      /** Wie lange ein nicht gefischtes Fass zum leichteren Schiff treibt. */
      travelMs: 1500,
      maxActive: 3,
    },
    island: {
      enabled: true,
      intervalMinMs: 60000,
      intervalMaxMs: 90000,
      warningMs: 5000,
      durationMs: 10000,
      cardCount: 3,
    },
    seaEvents: {
      enabled: true,
      warningMs: 4000,
      /** Ruhe nach Rundenstart bzw. Inselende, bevor ein Ereignis beginnen darf. */
      calmAfterMs: 15000,
      /** Abstand zwischen Ereignisende und Inselwarnung. */
      marginBeforeIslandMs: 3000,
      storm: { durationMs: 15000, weightBonus: 0.25 },
      tailwind: { durationMs: 15000, flightSpeedBonus: 0.3, driftRateBonus: 0.6 },
    },
    dusk: {
      /** Nach dieser Zeit ist es vollständig dunkel (rein visuell). */
      fullDarkMs: 300000,
    },
    upgrades: {
      doubleGrowth: { throws: 3, growth: 2 },
      tarp: { blocks: 1 },
      planks: { capacityBonus: 0.1 },
      fastCannon: { speedBonus: 0.4 },
      bilgePump: { relief: 15 },
      harpoon: { fraction: 0.5 },
      ballast: { charges: 1 },
      anchor: { storms: 1 },
    },
    match: {
      roundsToWin: 2,
    },
  };
}

export type GameConfig = ReturnType<typeof createConfig>;
