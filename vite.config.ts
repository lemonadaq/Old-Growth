import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  /*
   * Console calls and `debugger` statements are dropped from the release bundle.
   *
   * Not for size — there are barely a dozen — but because everything the game
   * has to say to a player it says on screen, and a console that only ever
   * prints in development is a console whose contents were never written for
   * anyone else to read. The `mode` guard keeps them in `npm run dev`, and in
   * the tests, where they are the only way to see anything at all.
   */
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  build: {
    // No source maps in the release: they are three times the bundle, and the
    // crash screen is what a player needs rather than a legible stack.
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts', 'scripts/**/*.{test,spec}.mjs'],
  },
}));
