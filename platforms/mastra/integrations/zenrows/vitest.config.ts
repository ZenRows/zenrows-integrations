import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit:integrations/zenrows',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.e2e.test.ts'],
        },
      },
      {
        test: {
          name: 'e2e:integrations/zenrows',
          environment: 'node',
          include: ['src/**/*.e2e.test.ts'],
        },
      },
    ],
  },
});
