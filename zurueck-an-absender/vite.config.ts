import { defineConfig } from 'vitest/config';

// Eigener Port, damit das Spiel parallel zu typing-royale (5173) laufen kann.
export default defineConfig({
  server: { port: 5180, strictPort: true },
  preview: { port: 5181, strictPort: true },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
