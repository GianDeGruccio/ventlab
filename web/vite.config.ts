import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const project = fileURLToPath(new URL('..', import.meta.url))
function licenseNotices(): Plugin {
  return {
    name: 'distribute-license-notices',
    apply: 'build',
    generateBundle() {
      const packages = new Set<string>()
      for (const id of this.getModuleIds()) {
        const pkg = id.match(/\/node_modules\/((?:@[^/]+\/)?[^/?]+)/)?.[1]
        if (pkg) packages.add(pkg)
      }
      const sections = [
        readFileSync(join(project, 'LICENSE'), 'utf8'),
        readFileSync(join(project, 'NOTICE.md'), 'utf8'),
      ]
      for (const name of [...packages].sort()) {
        const dir = join(project, 'web', 'node_modules', name)
        const licenses = readdirSync(dir).filter((f) => /^(license|copying|ofl)(\.|$)/i.test(f))
        for (const file of licenses)
          sections.push(name + '\n' + readFileSync(join(dir, file), 'utf8'))
      }
      this.emitFile({ type: 'asset', fileName: 'licenses.txt', source: sections.join('\n\n') })
    },
  }
}

export default defineConfig({
  plugins: [react(), licenseNotices()],
  base: './',
  server: { fs: { allow: [project] } },
  build: { assetsInlineLimit: 0 },
  test: { include: ['tests/**/*.test.ts'] },
})
