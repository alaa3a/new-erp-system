import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: [],
    testTimeout: 15000,
    fileParallelism: false,
    env: {
      // Tests must NEVER touch the production database file.
      // db.ts reads DATABASE_PATH at module load, so set it before any import.
      DATABASE_PATH: 'erp.test.sqlite',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
