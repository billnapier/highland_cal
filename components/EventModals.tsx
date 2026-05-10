'use client'

import { useState, useTransition } from 'react'
import { Plus, Edit } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createEvent, updateEvent } from '@/app/actions/events'
import { eventSchema, EventFormData } from '@/lib/schemas'


export function CreateEventModal() {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, setValue, watch, formState: { errors }, reset } = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      is_two_day: false,
    }
  })

  const isTwoDay = watch('is_two_day')

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      reset({
        is_two_day: false,
      })
      setError(null)
    }
    setOpen(newOpen)
  }

  const onSubmit = (data: EventFormData) => {
    startTransition(async () => {
      setError(null)
      try {
        const payload = {
          ...data,
        }
        const result = await createEvent(payload)
        if (result.success) {
          setOpen(false)
        } else {
          setError(result.message || 'Failed to create event')
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <Plus className="mr-2 h-4 w-4" />
        Create Event
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Event</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <span className="text-xs text-red-500">{errors.name.message}</span>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="start_date">Start Date</Label>
              <Input id="start_date" type="date" {...register('start_date')} />
              {errors.start_date && <span className="text-xs text-red-500">{errors.start_date.message}</span>}
            </div>
            <div className="flex items-center space-x-2 pt-8">
              <Checkbox 
                id="is_two_day" 
                checked={isTwoDay} 
                onCheckedChange={(c) => setValue('is_two_day', !!c)} 
              />
              <Label htmlFor="is_two_day" className="font-normal text-sm">
                Two-day event
              </Label>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="location">Location (optional)</Label>
            <Input id="location" {...register('location')} />
            {errors.location && <span className="text-xs text-red-500">{errors.location.message}</span>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="registration_url">Registration URL (optional)</Label>
            <Input id="registration_url" {...register('registration_url')} />
            {errors.registration_url && <span className="text-xs text-red-500">{errors.registration_url.message}</span>}
          </div>
          {error && <div className="text-sm text-red-500">{error}</div>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating...' : 'Create Event'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface EditEventModalProps {
  game: {
    id: string
    name: string
    start_date: string
    is_two_day: boolean
    location?: string | null
    registration_url?: string | null
  }
}

export function EditEventModal({ game }: EditEventModalProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  
  // We need to manage the checkbox state manually if not using react-hook-form Controller
  const [majorChange, setMajorChange] = useState(false)

  const { register, handleSubmit, setValue, watch, formState: { errors }, reset } = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      name: game.name,
      start_date: game.start_date,
      is_two_day: game.is_two_day,
      location: game.location || '',
      registration_url: game.registration_url || '',
    }
  })

  const isTwoDay = watch('is_two_day')

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      reset({
        name: game.name,
        start_date: game.start_date,
        is_two_day: game.is_two_day,
        location: game.location || '',
        registration_url: game.registration_url || '',
      })
      setMajorChange(false)
      setError(null)
    }
    setOpen(newOpen)
  }

  const onSubmit = (data: EventFormData) => {
    startTransition(async () => {
      setError(null)
      try {
        const payload = {
          ...data,
        }
        const result = await updateEvent(game.id, payload, majorChange)
        if (result.success) {
          setOpen(false)
        } else {
          setError(result.message || 'Failed to update event')
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Edit className="mr-2 h-4 w-4" />
        Edit
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Event</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input id="edit-name" {...register('name')} />
            {errors.name && <span className="text-xs text-red-500">{errors.name.message}</span>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-start_date">Start Date</Label>
              <Input id="edit-start_date" type="date" {...register('start_date')} />
              {errors.start_date && <span className="text-xs text-red-500">{errors.start_date.message}</span>}
            </div>
            <div className="flex items-center space-x-2 pt-8">
              <Checkbox 
                id="edit-is_two_day" 
                checked={isTwoDay} 
                onCheckedChange={(c) => setValue('is_two_day', !!c)} 
              />
              <Label htmlFor="edit-is_two_day" className="font-normal text-sm">
                Two-day event
              </Label>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit-location">Location (optional)</Label>
            <Input id="edit-location" {...register('location')} />
            {errors.location && <span className="text-xs text-red-500">{errors.location.message}</span>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-registration_url">Registration URL (optional)</Label>
            <Input id="edit-registration_url" {...register('registration_url')} />
            {errors.registration_url && <span className="text-xs text-red-500">{errors.registration_url.message}</span>}
          </div>
          
          <div className="flex items-center space-x-2 pt-2 border-t">
            <Checkbox 
              id="major_change" 
              checked={majorChange} 
              onCheckedChange={(c) => setMajorChange(!!c)} 
            />
            <Label htmlFor="major_change" className="font-normal text-sm">
              This is a major change (notify attendees)
            </Label>
          </div>

          {error && <div className="text-sm text-red-500">{error}</div>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Updating...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
