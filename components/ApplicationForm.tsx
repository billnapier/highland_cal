'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ApplicationFormData, applicationSchema } from '@/lib/schemas'
import { submitApplication } from '@/app/actions/application'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'

export default function ApplicationForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<ApplicationFormData>({
    resolver: zodResolver(applicationSchema),
  })

  const attendedPractice = watch('attended_practice')

  const onSubmit = async (data: ApplicationFormData) => {
    setIsSubmitting(true)
    setError('')
    
    try {
      const result = await submitApplication(data)
      if (!result.success) {
        setError(result.message || 'Failed to submit application')
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl text-card-foreground shadow-xl p-6 mt-6">
      <h2 className="text-2xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 drop-shadow-sm mb-4">Application for Membership</h2>
      <p className="text-muted-foreground text-sm mb-6">
        Please fill out this short questionnaire so we can get to know you better.
      </p>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="throwing_experience">What&apos;s your previous throwing experience?</Label>
          <p className="text-xs text-muted-foreground">E.g., high school, college, highland games, or none at all.</p>
          <Textarea 
            id="throwing_experience" 
            placeholder="Tell us about your experience..." 
            {...register('throwing_experience')}
            rows={4}
          />
          {errors.throwing_experience && <p className="text-red-500 text-xs mt-1">{errors.throwing_experience.message}</p>}
        </div>

        <div className="space-y-3">
          <Label>Have you been out to any of our practices?</Label>
          <RadioGroup 
            onValueChange={(val: string) => setValue('attended_practice', val === 'true')}
            value={attendedPractice === undefined ? undefined : attendedPractice ? 'true' : 'false'}
            className="flex flex-col space-y-1"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="true" id="attended_yes" />
              <Label htmlFor="attended_yes" className="font-normal">Yes</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="false" id="attended_no" />
              <Label htmlFor="attended_no" className="font-normal">No</Label>
            </div>
          </RadioGroup>
          {errors.attended_practice && <p className="text-red-500 text-xs mt-1">{errors.attended_practice.message}</p>}
          
          <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-md text-sm mt-4 border border-blue-100 dark:border-blue-900">
            <p className="text-blue-800 dark:text-blue-200">
              <strong>Tip:</strong> We strongly encourage everyone to come out to our practices to meet the team and learn more about the games! See the dashboard schedule for upcoming practice dates.
            </p>
          </div>
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSubmitting ? 'Submitting...' : 'Submit Application'}
        </Button>
      </form>
    </div>
  )
}
