import { NextResponse } from 'next/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GET /api/v1/openapi.yaml
 * Serve the OpenAPI spec file (read at build time from docs/openapi.yaml).
 */
export function GET() {
  try {
    const specPath = join(process.cwd(), 'docs', 'openapi.yaml')
    const spec = readFileSync(specPath, 'utf-8')

    return new NextResponse(spec, {
      status: 200,
      headers: {
        'Content-Type': 'text/yaml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    })
  } catch {
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'Spec file not found' } },
      { status: 500 },
    )
  }
}