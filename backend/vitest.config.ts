import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'vitest',
      enabled: false,
      reporter: ['text', 'json', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/types/index.ts'],
    },
    // Each test file gets a fresh pg-mem instance via the helper.
    // No global test DB needed.
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
