'use client'

import { useState, useTransition } from 'react'
import { Check, Copy, KeyRound, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { createApiToken, revokeApiToken } from '@/app/actions/tokens'
import type { Scope, TokenRow } from '@/lib/core/tokens'

const SCOPE_OPTIONS: { scope: Scope; label: string; description: string; adminOnly: boolean }[] = [
  { scope: 'attendance:write', label: 'attendance:write', description: 'Set your own RSVPs', adminOnly: false },
  { scope: 'events:write', label: 'events:write', description: 'Create events and edit your events (admins: any event)', adminOnly: false },
  { scope: 'events:delete', label: 'events:delete', description: 'Delete events', adminOnly: true },
  { scope: 'users:admin', label: 'users:admin', description: 'Approve, promote, and delete users; read private fields', adminOnly: true },
]

const EXPIRY_OPTIONS = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
  { value: 'never', label: 'Never' },
] as const

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function CreateTokenDialog({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<Scope[]>([])
  const [expiry, setExpiry] = useState<string>('90')
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()

  const reset = () => {
    setName('')
    setScopes([])
    setExpiry('90')
    setError(null)
    setToken(null)
    setCopied(false)
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    // Drop the plaintext from memory as soon as the dialog closes.
    if (!next) reset()
  }

  const toggleScope = (scope: Scope, checked: boolean) => {
    setScopes((prev) => (checked ? [...prev, scope] : prev.filter((s) => s !== scope)))
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await createApiToken({
        name,
        scopes,
        expires_in_days: expiry === 'never' ? null : (Number(expiry) as 30 | 90 | 365),
      })
      if (res.success) {
        setToken(res.token)
      } else {
        setError(res.message)
      }
    })
  }

  const handleCopy = async () => {
    if (!token) return
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
    } catch {
      setError('Copy failed — select the token and copy it manually.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="mr-2 h-4 w-4" />
        Create token
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        {token ? (
          <>
            <DialogHeader>
              <DialogTitle>Copy your new token</DialogTitle>
              <DialogDescription>
                This is the only time it will be shown. Store it somewhere safe, such as your agent&apos;s secret store.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <Input readOnly value={token} aria-label="New API token" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Create API token</DialogTitle>
              <DialogDescription>
                A token acts as you, limited to the scopes you choose. Reading public data and your own data is always allowed.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="token-name">Name</Label>
              <Input id="token-name" placeholder="e.g. Hermes agent" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <fieldset className="grid gap-3">
              <legend className="text-sm font-medium mb-1">Scopes</legend>
              {SCOPE_OPTIONS.filter((o) => isAdmin || !o.adminOnly).map((o) => (
                <div key={o.scope} className="flex items-start space-x-2">
                  <Checkbox
                    id={`scope-${o.scope}`}
                    checked={scopes.includes(o.scope)}
                    onCheckedChange={(c) => toggleScope(o.scope, !!c)}
                  />
                  <Label htmlFor={`scope-${o.scope}`} className="font-normal text-sm leading-tight">
                    <span className="font-mono">{o.label}</span>
                    <span className="block text-muted-foreground">{o.description}</span>
                  </Label>
                </div>
              ))}
            </fieldset>
            <div className="grid gap-2">
              <Label htmlFor="token-expiry">Expires</Label>
              <Select value={expiry} onValueChange={(v) => setExpiry(String(v))}>
                <SelectTrigger id="token-expiry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={isPending || name.trim() === ''}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create token
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function RevokeButton({ token }: { token: TokenRow }) {
  const [isPending, startTransition] = useTransition()

  const handleRevoke = () => {
    if (!confirm(`Revoke "${token.name}"? Anything using it will stop working immediately. This cannot be undone.`)) return
    startTransition(async () => {
      const res = await revokeApiToken(token.id)
      if (!res.success) alert(res.message)
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={handleRevoke} disabled={isPending} className="border-red-500 text-red-600 hover:bg-red-50">
      {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
      Revoke
    </Button>
  )
}

export default function ApiTokens({ tokens, isAdmin, now }: { tokens: TokenRow[]; isAdmin: boolean; now: number }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> API Tokens
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Let agents and scripts use the Highland Cal API as you. See the{' '}
            <a className="underline" href="https://github.com/billnapier/highland_cal/blob/main/docs/API.md" target="_blank" rel="noreferrer">API guide</a>.
          </p>
        </div>
        <CreateTokenDialog isAdmin={isAdmin} />
      </div>

      {tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground">You have no API tokens.</p>
      ) : (
        <ul className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
          {tokens.map((t) => {
            const expired = t.expires_at !== null && new Date(t.expires_at).getTime() <= now
            return (
              <li key={t.id} className="py-3 flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium truncate">
                    {t.name}{' '}
                    <span className="font-mono text-xs text-muted-foreground">{t.prefix}…</span>
                    {expired && <span className="ml-2 text-xs font-semibold text-amber-600">Expired</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.scopes.length ? t.scopes.map((s) => <code key={s} className="mr-1">{s}</code>) : 'Read-only'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Created {formatDate(t.created_at)} · Last used {formatDate(t.last_used_at)} · Expires {t.expires_at ? formatDate(t.expires_at) : 'never'}
                  </p>
                </div>
                <RevokeButton token={t} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
