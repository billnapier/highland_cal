import { NextResponse } from 'next/server'

/**
 * GET /api/v1/docs
 * Serve an interactive API reference using Scalar from CDN.
 * The spec URL is auto-detected relative to the current page.
 */
export function GET() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Highland Cal API Reference</title>
  <style>
    body { margin: 0; padding: 0; }
  </style>
</head>
<body>
  <script id="api-reference" data-url="/api/v1/openapi.yaml"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}