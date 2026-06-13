import { defineConfig } from 'vitest/config'

export default defineConfig({
  // The app builds with @vitejs/plugin-react (automatic JSX runtime); mirror
  // that here so .tsx components render in jsdom tests without explicit
  // `import React` statements.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts', 'src/__tests__/**/*.test.tsx'],
    setupFiles: ['src/__tests__/setup.ts'],
    globals: false,
  },
})
