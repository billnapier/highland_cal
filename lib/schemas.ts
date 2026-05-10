import * as z from 'zod'

export const eventSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  start_date: z.string().min(1, 'Start date is required'),
  is_two_day: z.boolean().default(false),
  type: z.enum(['EVENT', 'PRACTICE']).default('EVENT'),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  location: z.string().optional(),
  registration_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  major_change: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.type === 'PRACTICE') {
    if (!data.start_time) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Start time is required for practices',
        path: ['start_time']
      });
    }
    if (!data.end_time) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End time is required for practices',
        path: ['end_time']
      });
    }
  }
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
