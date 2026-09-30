import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // Base de datos propia (produccion_test): se crea, migra y carga antes de correr.
    globalSetup: ['test/preparar-base.ts'],
    setupFiles: ['test/configurar-entorno.ts'],
    fileParallelism: false,
    hookTimeout: 60_000,
  },
});
