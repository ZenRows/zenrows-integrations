import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'unit:integrations/zenrows',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
