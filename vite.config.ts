import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Spielversion = Prüfsumme über alles, was die Simulation beeinflusst
 * (Regeln, Bots, Wortlisten, Netzwerk). Browser und Server vergleichen sie
 * beim Beitreten – so spielt niemand mit einer veralteten Seite.
 */
function gameVersion(): string {
  const hash = createHash('sha1');
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|json)$/.test(name)) hash.update(p).update(readFileSync(p));
    }
  };
  for (const dir of ['src/core', 'src/controllers', 'src/net', 'src/data']) walk(join(import.meta.dirname, dir));
  hash.update(readFileSync(join(import.meta.dirname, 'src/runtime/session.ts')));
  return hash.digest('hex').slice(0, 10);
}

export default defineConfig({
  define: {
    __GAME_VERSION__: JSON.stringify(gameVersion()),
  },
  server: {
    // Mehrspieler: WebSocket an den Spiel-Server weiterleiten (npm run server)
    proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
