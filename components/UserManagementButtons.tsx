'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { approveUser, promoteToAdmin, deleteUser } from '@/app/actions/admin'
import { Loader2, Check, ShieldAlert, Trash2 } from 'lucide-react'

export function ApproveButton({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false)

  const handleApprove = async () => {
    setLoading(true)
    try {
      const res = await approveUser(userId)
      if (!res.success) {
        alert(res.error)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleApprove} disabled={loading} className="border-green-500 text-green-600 hover:bg-green-50">
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Check className="mr-2 h-4 w-4" />
      )}
      {loading ? 'Approving...' : 'Approve'}
    </Button>
  )
}

export function PromoteButton({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false)

  const handlePromote = async () => {
    if (!confirm('Are you sure you want to promote this user to ADMIN? They will have full access.')) return
    
    setLoading(true)
    try {
      const res = await promoteToAdmin(userId)
      if (!res.success) {
        alert(res.error)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handlePromote} disabled={loading} className="border-purple-500 text-purple-600 hover:bg-purple-50">
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <ShieldAlert className="mr-2 h-4 w-4" />
      )}
      {loading ? 'Promoting...' : 'Promote to Admin'}
    </Button>
  )
}

export function DeleteUserButton({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone and will delete all their data.')) return
    
    setLoading(true)
    try {
      const res = await deleteUser(userId)
      if (!res.success) {
        alert(res.error)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="destructive" size="sm" onClick={handleDelete} disabled={loading}>
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="mr-2 h-4 w-4" />
      )}
      {loading ? 'Deleting...' : 'Delete'}
    </Button>
  )
}
