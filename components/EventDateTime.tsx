'use client'

import { useEffect, useState } from 'react'
import { Calendar } from 'lucide-react'

interface EventDateTimeProps {
  startDateStr: string
  isTwoDay: boolean
  type: string
  startTime: string | null
  endTime: string | null
}

export function EventDateTime({ startDateStr, isTwoDay, type, startTime, endTime }: EventDateTimeProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const startDate = new Date(startDateStr + 'T00:00:00')
  const endDate = new Date(startDate)
  if (isTwoDay) endDate.setDate(endDate.getDate() + 1)

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return ''
    const [hours, minutes] = timeStr.split(':')
    const d = new Date()
    d.setHours(parseInt(hours, 10))
    d.setMinutes(parseInt(minutes, 10))
    // Use user's locale for time (e.g. 1:00 PM or 13:00 depending on their system)
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }

  // To prevent hydration mismatch, we render a fallback format on the server
  // and then update it to the user's locale once mounted.
  // Actually, standard Date formatting can mismatch if we use `undefined` locale on server.
  // So we use en-US on server, then user locale on client.

  const renderDate = (d: Date) => {
    if (!mounted) {
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    }
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  }

  const renderTime = (timeStr: string | null) => {
    if (!timeStr) return ''
    if (!mounted) {
      // Fallback: 13:00 -> 1:00 PM for en-US server rendering
      const [hours, minutes] = timeStr.split(':')
      const d = new Date()
      d.setHours(parseInt(hours, 10))
      d.setMinutes(parseInt(minutes, 10))
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    }
    return formatTime(timeStr)
  }

  return (
    <div className="flex items-center">
      <Calendar className="mr-2 h-4 w-4 shrink-0" />
      <span>
        {renderDate(startDate)}
        {type === 'PRACTICE' && startTime ? ` from ${renderTime(startTime)}` : ''}
        {type === 'PRACTICE' && endTime ? ` to ${renderTime(endTime)}` : ''}
        {type !== 'PRACTICE' && isTwoDay && ` - ${renderDate(endDate)}`}
      </span>
    </div>
  )
}
