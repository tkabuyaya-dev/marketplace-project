import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 15000,
    hookTimeout: 15000,
    // Run sequentially — each suite shares the emulator
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
