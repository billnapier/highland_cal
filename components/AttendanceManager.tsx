'use client'

import { useState, useTransition } from 'react'
import { setAttendance, InterestLevel, AttendDay } from '@/app/actions/attendance'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface AttendanceRecord {
  user_id: string
  interest_level: InterestLevel
  attend_day?: AttendDay
  profiles?: {
    display_name: string | null
  } | null
}

interface AttendanceManagerProps {
  gameId: string
  currentUserId: string
  role: string
  attendanceRecords: AttendanceRecord[]
  isTwoDay?: boolean
}

export default function AttendanceManager({ gameId, currentUserId, role, attendanceRecords, isTwoDay }: AttendanceManagerProps) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ text: string, type: 'error' | 'success' } | null>(null)

  const currentUserRecord = attendanceRecords.find((r) => r.user_id === currentUserId)
  const [currentLevel, setCurrentLevel] = useState<string>(currentUserRecord?.interest_level || '')
  const [currentDay, setCurrentDay] = useState<string>(currentUserRecord?.attend_day || 'DAY_1')

  const handleValueChange = (value: string | null) => {
    if (!value) return
    setCurrentLevel(value)
    setMessage(null)
    startTransition(async () => {
      const result = await setAttendance(gameId, value as InterestLevel, value === 'REGISTERED' ? currentDay as AttendDay : undefined)
      if (!result.success) {
        setMessage({ text: result.message || 'Failed to update RSVP', type: 'error' })
        setCurrentLevel(currentUserRecord?.interest_level || '')
      } else {
        setMessage({ text: 'RSVP updated', type: 'success' })
        setTimeout(() => setMessage(null), 3000)
      }
    })
  }

  const handleDayChange = (value: string | null) => {
    if (!value) return
    setCurrentDay(value)
    setMessage(null)
    startTransition(async () => {
      const result = await setAttendance(gameId, currentLevel as InterestLevel, value as AttendDay)
      if (!result.success) {
        setMessage({ text: result.message || 'Failed to update RSVP day', type: 'error' })
        setCurrentDay(currentUserRecord?.attend_day || 'DAY_1')
      } else {
        setMessage({ text: 'RSVP day updated', type: 'success' })
        setTimeout(() => setMessage(null), 3000)
      }
    })
  }

  const grouped = attendanceRecords.reduce((acc, record) => {
    const level = record.interest_level;
    if (!acc[level]) acc[level] = [];
    let name = record.profiles?.display_name || 'Unknown User';
    if (level === 'REGISTERED' && isTwoDay && record.attend_day && record.attend_day !== 'BOTH') {
      name += ` (${record.attend_day === 'DAY_1' ? 'Day 1' : 'Day 2'})`;
    }
    acc[level].push(name);
    return acc;
  }, {} as Record<string, string[]>);

  const canEdit = role === 'APPROVED' || role === 'ADMIN'

  return (
    <div className="mt-4 p-6 border border-slate-200/60 dark:border-slate-800/60 rounded-xl bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm space-y-4 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-center justify-between">
        <h4 className="font-extrabold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">Attendance</h4>
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
          
          {currentLevel === 'REGISTERED' && isTwoDay && (
            <Select value={currentDay} onValueChange={handleDayChange} disabled={isPending}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Which day?" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BOTH">Both Days</SelectItem>
                <SelectItem value="DAY_1">Day 1</SelectItem>
                <SelectItem value="DAY_2">Day 2</SelectItem>
              </SelectContent>
            </Select>
          )}
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
