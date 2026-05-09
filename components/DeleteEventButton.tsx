'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deleteEvent } from '@/app/actions/events'

interface DeleteEventButtonProps {
  eventId: string
}

export default function DeleteEventButton({ eventId }: DeleteEventButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this event? This action cannot be undone.')) {
      startTransition(async () => {
        try {
          setError(null)
          const result = await deleteEvent(eventId)
          if (!result.success) {
            setError(result.message || 'Failed to delete event')
          }
        } catch (err: unknown) {
          if (err instanceof Error) {
            setError(err.message || 'An unexpected error occurred')
          } else {
            setError('An unexpected error occurred')
          }
        }
      })
    }
  }

  return (
    <div className="flex flex-col items-end">
      <Button
        variant="destructive"
        size="sm"
        onClick={handleDelete}
        disabled={isPending}
      >
        <Trash2 className="mr-2 h-4 w-4" />
        {isPending ? 'Deleting...' : 'Delete Event'}
      </Button>
      {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
    </div>
  )
}
