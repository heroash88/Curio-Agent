import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'src/services/**/*.test.ts',
      'src/utils/**/*.test.ts',
      'src/lib/**/*.test.ts',
      'src/hooks/**/*.test.ts',
      'src/hooks/**/*.test.tsx',
      'src/components/cards/**/*.test.tsx',
      'src/components/curio/**/*.test.tsx',
      'src/components/desktop/**/*.test.tsx',
      'src/contexts/__tests__/**/*.test.ts',
      'src/contexts/__tests__/**/*.test.tsx',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'src/hooks/build-machines/**',
      '**/*.bak',
      '**/*.bak*',
    ],
    restoreMocks: true,
    clearMocks: true,
  },
});
