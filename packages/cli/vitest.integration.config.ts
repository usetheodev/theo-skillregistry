import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const coreSrc = fileURLToPath(new URL('../core/src', import.meta.url));
const apiSrc = fileURLToPath(new URL('../api/src', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@usetheo/skillregistry/contract': `${coreSrc}/contract/index.ts`,
      '@usetheo/skillregistry/db': `${coreSrc}/infrastructure/db/schema.ts`,
      '@usetheo/skillregistry': `${coreSrc}/index.ts`,
      '@usetheo/skillregistry-api/validators': `${apiSrc}/validators.ts`,
    },
  },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    globals: false,
    passWithNoTests: true,
  },
});
