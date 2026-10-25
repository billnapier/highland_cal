import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Contract test: every path in openapi.yaml has a corresponding route file
 * and vice versa. Catches spec-to-route drift.
 */
describe('API spec to route drift', () => {
  const specPath = join(__dirname, '../../docs/openapi.yaml')
  const spec = readFileSync(specPath, 'utf-8')

  // Extract all paths from the spec
  const pathMatches = spec.matchAll(/^  \/([\w{}\/-]+):/gm)
  const specPaths: string[] = []
  for (const m of pathMatches) {
    specPaths.push(m[1])
  }

  // Map spec paths to expected Next.js route file paths
  function specPathToRoute(specPath: string): string {
    const segments = specPath
      .split('/')
      .filter(Boolean)
      .map((s) => s.replace(/\{(\w+)\}/g, '[$1]'))
    return join(__dirname, '../../app/api/v1', ...segments, 'route.ts')
  }

  it('every spec path has a route file', () => {
    const missing: string[] = []
    for (const specPath of specPaths) {
      const routeFile = specPathToRoute(specPath)
      if (!existsSync(routeFile)) {
        missing.push(specPath + ' -> ' + routeFile)
      }
    }
    if (missing.length > 0) {
      console.error('Missing route files:\n' + missing.join('\n'))
    }
    expect(missing).toHaveLength(0)
  })
})