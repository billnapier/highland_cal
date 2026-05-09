import * as z from 'zod'

export const eventSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  start_timestamp: z.string().min(1, 'Start time is required'),
  end_timestamp: z.string().min(1, 'End time is required'),
  local_timezone: z.string().min(1, 'Timezone is required'),
  location: z.string().optional(),
  registration_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  major_change: z.boolean().optional(),
})

export type EventFormData = z.infer<typeof eventSchema>

export const profileSchema = z.object({
  class: z.string().optional(),
  instagram: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  facebook: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  customLinks: z.array(z.object({
    title: z.string().min(1, 'Title is required'),
    url: z.string().url('Must be a valid URL')
  })).max(5).optional()
})

export type ProfileFormData = z.infer<typeof profileSchema>
