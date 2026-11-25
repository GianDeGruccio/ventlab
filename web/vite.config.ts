import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {fs: {allow: [fileURLToPath(new URL('..', import.meta.url))]}},
  build: {assetsInlineLimit: 0},
  test: {include: ['tests/**/*.test.ts']},
})
