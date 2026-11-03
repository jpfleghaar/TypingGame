import type { Command, ShipId } from '../core';
import type { Controller } from './Controller';

/** Gegner, der nichts tut. Platzhalter bis zum Bot und praktisch zum Testen. */
export class IdleController implements Controller {
  constructor(public readonly ship: ShipId) {}
  poll(): Command[] {
    return [];
  }
}
