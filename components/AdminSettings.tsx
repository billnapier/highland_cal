'use client'

import { useState } from 'react'
import { updateSetting } from '@/app/actions/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface AdminSettingsProps {
  initialClubName: string
  initialClubBlurb: string
}

export function AdminSettings({ initialClubName, initialClubBlurb }: AdminSettingsProps) {
  const [clubName, setClubName] = useState(initialClubName)
  const [clubBlurb, setClubBlurb] = useState(initialClubBlurb)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const handleSave = async () => {
    setIsSaving(true)
    setMessage(null)

    const nameResult = await updateSetting('club_name', clubName)
    if (!nameResult.success) {
      setMessage({ text: nameResult.message || 'Failed to save club name', type: 'error' })
      setIsSaving(false)
      return
    }

    const blurbResult = await updateSetting('club_blurb', clubBlurb)
    if (!blurbResult.success) {
      setMessage({ text: blurbResult.message || 'Failed to save club blurb', type: 'error' })
      setIsSaving(false)
      return
    }

    setMessage({ text: 'Settings saved successfully', type: 'success' })
    setIsSaving(false)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <label htmlFor="clubName" className="block text-sm font-medium text-foreground mb-1">
            Club Name
          </label>
          <Input
            id="clubName"
            value={clubName}
            onChange={(e) => setClubName(e.target.value)}
            placeholder="e.g. Highland Cal"
          />
        </div>
        <div>
          <label htmlFor="clubBlurb" className="block text-sm font-medium text-foreground mb-1">
            Home Page Blurb
          </label>
          <Textarea
            id="clubBlurb"
            value={clubBlurb}
            onChange={(e) => setClubBlurb(e.target.value)}
            placeholder="We are a community of athletes..."
            className="min-h-[100px]"
          />
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Settings'}
        </Button>
        {message && (
          <span className={`text-sm ${message.type === 'error' ? 'text-red-500' : 'text-green-600'}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  )
}
