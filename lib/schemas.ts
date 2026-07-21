import * as z from 'zod'

const preprocessUrl = (val: unknown) => {
  if (typeof val !== 'string' || val.trim() === '') return val
  const trimmed = val.trim()

  // If it already has a protocol, ensure it's http/https
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) {
    if (!/^https?:\/\//i.test(trimmed)) {
      return '' // Return empty string to intentionally fail Zod's URL validation
    }
    return trimmed
  }

  return `https://${trimmed}`
}

export const eventSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  start_date: z.string().min(1, 'Start date is required'),
  is_two_day: z.boolean().default(false),
  type: z.enum(['EVENT', 'PRACTICE']).default('EVENT'),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  location: z.string().optional(),
  registration_url: z.preprocess(preprocessUrl, z.string().url('Must be a valid URL').optional().or(z.literal(''))),
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

export interface ProfileFormData {
  class?: string
  avatar_url?: string
  instagram?: string
  facebook?: string
  customLinks?: {
    title: string
    url: string
  }[]
}

export const profileSchema = z.object({
  class: z.string().optional(),
  avatar_url: z.preprocess(preprocessUrl, z.string().url('Must be a valid URL').optional().or(z.literal(''))),
  instagram: z.preprocess(preprocessUrl, z.string().url('Must be a valid URL').optional().or(z.literal(''))),
  facebook: z.preprocess(preprocessUrl, z.string().url('Must be a valid URL').optional().or(z.literal(''))),
  customLinks: z.array(z.object({
    title: z.string().min(1, 'Title is required'),
    url: z.preprocess(preprocessUrl, z.string().url('Must be a valid URL'))
  })).max(5).optional()
})

export const applicationSchema = z.object({
  throwing_experience: z.string().min(1, 'Please tell us about your throwing experience.'),
  attended_practice: z.boolean({
    message: "Please let us know if you've attended a practice.",
  }),
})

export type ApplicationFormData = z.infer<typeof applicationSchema>

export interface CustomLink {
  title: string;
  url: string;
}
