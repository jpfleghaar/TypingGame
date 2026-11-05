/** Wird beim Build bzw. Serverstart aus dem Spielcode berechnet (vite.config.ts). */
declare const __GAME_VERSION__: string;

export const GAME_VERSION: string = typeof __GAME_VERSION__ === 'string' ? __GAME_VERSION__ : 'dev';
