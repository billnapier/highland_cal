'use client'

import { useState, useTransition } from 'react'
import { setAttendance, InterestLevel } from '@/app/actions/attendance'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface AttendanceRecord {
  user_id: string
  interest_level: string
  Profiles?: {
    display_name: string | null
  } | null
}

interface AttendanceManagerProps {
  gameId: string
  currentUserId: string
  role: string
  attendanceRecords: AttendanceRecord[]
}

export default function AttendanceManager({ gameId, currentUserId, role, attendanceRecords }: AttendanceManagerProps) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ text: string, type: 'error' | 'success' } | null>(null)

  const currentUserRecord = attendanceRecords.find((r) => r.user_id === currentUserId)
  const [currentLevel, setCurrentLevel] = useState<string>(currentUserRecord?.interest_level || '')

  const handleValueChange = (value: string | null) => {
    if (!value) return
    setCurrentLevel(value)
    setMessage(null)
    startTransition(async () => {
      const result = await setAttendance(gameId, value as InterestLevel)
      if (!result.success) {
        setMessage({ text: result.message || 'Failed to update RSVP', type: 'error' })
        // revert local state on error
        setCurrentLevel(currentUserRecord?.interest_level || '')
      } else {
        setMessage({ text: 'RSVP updated', type: 'success' })
        // clear success message after 3 seconds
        setTimeout(() => setMessage(null), 3000)
      }
    })
  }

  const grouped = attendanceRecords.reduce((acc, record) => {
    const level = record.interest_level;
    if (!acc[level]) acc[level] = [];
    acc[level].push(record.Profiles?.display_name || 'Unknown User');
    return acc;
  }, {} as Record<string, string[]>);

  const canEdit = role === 'APPROVED' || role === 'ADMIN'

  return (
    <div className="mt-4 p-4 border rounded-md bg-secondary/20 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-lg">Attendance</h4>
        {message && (
          <span className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {message.text}
          </span>
        )}
      </div>
      
      {canEdit ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <span className="text-sm font-medium whitespace-nowrap">Your Status:</span>
          <Select value={currentLevel} onValueChange={handleValueChange} disabled={isPending}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select your RSVP" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="REGISTERED">Registered</SelectItem>
              <SelectItem value="INTERESTED">Interested</SelectItem>
              <SelectItem value="WATCHING">Watching</SelectItem>
              <SelectItem value="NOT_GOING">Not Going</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          {role === 'PENDING' ? 'Your account must be approved to RSVP.' : 'Log in to RSVP.'}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-4">
        <div>
          <div className="font-semibold text-green-600 dark:text-green-400">Registered ({grouped['REGISTERED']?.length || 0})</div>
          <div className="text-muted-foreground text-xs">{grouped['REGISTERED']?.join(', ') || '-'}</div>
        </div>
        <div>
          <div className="font-semibold text-blue-600 dark:text-blue-400">Interested ({grouped['INTERESTED']?.length || 0})</div>
          <div className="text-muted-foreground text-xs">{grouped['INTERESTED']?.join(', ') || '-'}</div>
        </div>
        <div>
          <div className="font-semibold text-yellow-600 dark:text-yellow-400">Watching ({grouped['WATCHING']?.length || 0})</div>
          <div className="text-muted-foreground text-xs">{grouped['WATCHING']?.join(', ') || '-'}</div>
        </div>
        <div>
          <div className="font-semibold text-gray-500 dark:text-gray-400">Not Going ({grouped['NOT_GOING']?.length || 0})</div>
          <div className="text-muted-foreground text-xs">{grouped['NOT_GOING']?.join(', ') || '-'}</div>
        </div>
      </div>
    </div>
  )
}
