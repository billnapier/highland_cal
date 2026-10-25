import { vi } from 'vitest'
import type { DbClient } from './client'

/**
 * A minimal recording fake of the supabase-js query builder, for unit tests of
 * lib/core. Each awaited query pops the next scripted response for its table
 * (or rpc name) and records the chain of calls that built it.
 *
 * Real RLS behavior is covered by the pgTAP suite (supabase/tests); these tests
 * check that core maps each database outcome correctly and sets the right
 * headers, and that it never adds authorization logic of its own.
 */

export interface Recorded {
  target: string
  calls: [string, ...unknown[]][]
  headers: Record<string, string>
}

export interface Response {
  data?: unknown
  error?: { code?: string; message: string } | null
}

export function fakeDb(script: Record<string, Response[]>, user: { id: string } | null = { id: 'actor' }) {
  const log: Recorded[] = []

  const next = (target: string): Response => {
    const queue = script[target]
    if (!queue || queue.length === 0) throw new Error(`unexpected query on ${target}`)
    return queue.shift()!
  }

  const builder = (target: string) => {
    const rec: Recorded = { target, calls: [], headers: {} }
    log.push(rec)
    const proxy: Record<string, unknown> = {}
    const chain = (name: string) =>
      (...args: unknown[]) => {
        rec.calls.push([name, ...args])
        return proxy
      }
    for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'is', 'order', 'single', 'maybeSingle']) {
      proxy[m] = chain(m)
    }
    proxy.setHeader = (k: string, v: string) => {
      rec.headers[k] = v
      return proxy
    }
    proxy.then = (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) => {
      try {
        const r = next(target)
        return Promise.resolve({ data: r.data ?? null, error: r.error ?? null }).then(resolve, reject)
      } catch (e) {
        return Promise.reject(e).then(resolve, reject)
      }
    }
    return proxy
  }

  const db = {
    from: (table: string) => builder(table),
    rpc: (fn: string, args: unknown) => {
      const b = builder(`rpc:${fn}`)
      ;(b as { _args?: unknown })._args = args
      log[log.length - 1].calls.push(['rpc', args])
      return b
    },
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
  }

  return { db: db as unknown as DbClient, log, remaining: () => Object.entries(script).filter(([, q]) => q.length) }
}

export const methods = (r: Recorded) => r.calls.map((c) => c[0])
export const arg = (r: Recorded, method: string) => r.calls.find((c) => c[0] === method)?.[1]
