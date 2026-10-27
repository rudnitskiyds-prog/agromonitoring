import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base: './' — относительные пути, чтобы сборка работала на GitHub Pages
// в любом подкаталоге (роутинг через HashRouter).
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
