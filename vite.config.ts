import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    // Phaser alone is > 1 MB; that's expected, so don't warn about it.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
