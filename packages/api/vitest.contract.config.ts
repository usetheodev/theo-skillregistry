import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const coreSrc = fileURLToPath(new URL('../core/src', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@usetheo/skillregistry/contract': `${coreSrc}/contract/index.ts`,
      '@usetheo/skillregistry/db': `${coreSrc}/infrastructure/db/schema.ts`,
      '@usetheo/skillregistry': `${coreSrc}/index.ts`,
    },
  },
  test: {
    include: ['tests/contract/**/*.test.ts'],
    testTimeout: 15_000,
    globals: false,
    passWithNoTests: false,
  },
});
