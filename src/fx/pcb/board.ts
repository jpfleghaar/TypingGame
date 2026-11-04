import avatarUrl from '../../assets/pcb/avatar.png';
import boardUrl from '../../assets/pcb/board.jpg';
import type { BoardSpec } from '../../ui/gameView';
import layoutJson from './boardLayout.json';

/**
 * Platinen-Hintergrund mit festen Anschlüssen P1–P10.
 * `boardLayout.json` wird von `scripts/extract-board.py` aus dem Bild erzeugt
 * (Masken und Mittellinien der Leiterbahn-Bündel). Alle Koordinaten sind
 * Bild-Pixel; die Spielfläche wird als Ganzes aufs Fenster skaliert.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface PadDef {
  id: string;
  side: 'left' | 'right';
  pad: Pt;
  /** Lage der Leucht-Maske (trace-pN.png) im Bild. */
  mask: { x: number; y: number; width: number; height: number };
  /** Mittellinie vom Pad zum Chip. */
  path: Pt[];
}

export interface BoardLayout {
  width: number;
  height: number;
  chip: { x: number; y: number; width: number; height: number };
  pads: PadDef[];
}

export const PCB_LAYOUT = layoutJson as BoardLayout;
export const PCB_IMAGE = boardUrl;
export const PCB_AVATAR = avatarUrl;

/** URLs der Leucht-Masken in Pad-Reihenfolge (P1 … P10). */
export const PCB_TRACE_MASKS: string[] = PCB_LAYOUT.pads.map(
  (p) => new URL(`../../assets/pcb/trace-${p.id.toLowerCase()}.png`, import.meta.url).href,
);

/** Kartengröße und Abstände auf der Spielfläche (Bild-Pixel). */
const CARD = { width: 240, height: 64, margin: 14, gapToPad: 6 };
/** Posteingang + Ziel-Zeile + Werte: Posteingang mittig über dem Chip. */
const ARENA = { width: 456, height: 640 };
/** Basis-Einheit auf der Spielfläche (px); Stapelhöhe = 12 Zeilen × 2,5 u + 1,2 u Innenabstand. */
const UNIT = 15.5;
const STACK_HEIGHT = 12 * 2.5 * UNIT + 1.2 * UNIT;
/** Kopfzeile ganz oben – oberhalb der obersten Gegner-Karten. */
const HEADER = { y: 6, height: 26 };

/** Spielfläche für die Spielansicht: je Pad ein Kartenplatz, Arena über dem Chip. */
export function pcbBoardSpec(): BoardSpec {
  const { width, height } = PCB_LAYOUT;
  const slots = PCB_LAYOUT.pads.map((p) => ({
    x: p.side === 'left' ? Math.max(CARD.margin, p.pad.x - CARD.gapToPad - CARD.width) : p.pad.x + CARD.gapToPad,
    y: p.pad.y - CARD.height / 2,
    width: CARD.width,
    height: CARD.height,
  }));
  return {
    width,
    height,
    slots,
    arena: {
      x: (width - ARENA.width) / 2,
      // Posteingang (erstes Element der Arena) mittig über dem Chip
      y: Math.round(PCB_LAYOUT.chip.y + PCB_LAYOUT.chip.height / 2 - STACK_HEIGHT / 2),
      width: ARENA.width,
      height: ARENA.height,
    },
    header: { x: 0, y: HEADER.y, width, height: HEADER.height },
    unit: UNIT,
    avatar: PCB_AVATAR,
  };
}
