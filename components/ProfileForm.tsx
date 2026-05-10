'use client'

import { useState, useTransition } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { profileSchema, ProfileFormData } from '@/lib/schemas'
import { updateProfile } from '@/app/actions/profile'

interface ProfileFormProps {
  initialData: {
    class?: string | null
    outward_links?: {
      instagram?: string | null
      facebook?: string | null
      customLinks?: { title: string; url: string }[] | null
    } | null
  }
}

export default function ProfileForm({ initialData }: ProfileFormProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const { register, control, handleSubmit, formState: { errors } } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      class: initialData.class || '',
      instagram: initialData.outward_links?.instagram || '',
      facebook: initialData.outward_links?.facebook || '',
      customLinks: initialData.outward_links?.customLinks || [],
    }
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'customLinks'
  })

  const onSubmit = (data: ProfileFormData) => {
    startTransition(async () => {
      setError(null)
      setSuccess(false)
      try {
        const result = await updateProfile(data)
        if (result.success) {
          setSuccess(true)
        } else {
          setError(result.message || 'Failed to update profile')
        }
      } catch {
        setError('An unexpected error occurred')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="class">Competition Class</Label>
          <Input id="class" placeholder="e.g. A-Class, Masters, Women" {...register('class')} />
          {errors.class && <span className="text-xs text-red-500">{errors.class.message}</span>}
        </div>

        <div className="pt-4 border-t">
          <h3 className="text-lg font-medium mb-4">Social Links</h3>
          
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="instagram">Instagram URL</Label>
              <Input id="instagram" placeholder="https://instagram.com/yourusername" {...register('instagram')} />
              {errors.instagram && <span className="text-xs text-red-500">{errors.instagram.message}</span>}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="facebook">Facebook URL</Label>
              <Input id="facebook" placeholder="https://facebook.com/yourusername" {...register('facebook')} />
              {errors.facebook && <span className="text-xs text-red-500">{errors.facebook.message}</span>}
            </div>
          </div>
        </div>

        <div className="pt-4 border-t">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium">Custom Links</h3>
            {fields.length < 5 && (
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={() => append({ title: '', url: '' })}
              >
                <Plus className="mr-2 h-4 w-4" /> Add Link
              </Button>
            )}
          </div>
          
          <div className="space-y-4">
            {fields.map((item, index) => (
              <div key={item.id} className="flex gap-4 items-start">
                <div className="grid gap-2 flex-1">
                  <Input placeholder="Title (e.g. NASGA Profile)" {...register(`customLinks.${index}.title` as const)} />
                  {errors.customLinks?.[index]?.title && (
                    <span className="text-xs text-red-500">{errors.customLinks[index]?.title?.message}</span>
                  )}
                </div>
                <div className="grid gap-2 flex-[2] w-[50%]">
                  <Input placeholder="URL" {...register(`customLinks.${index}.url` as const)} />
                  {errors.customLinks?.[index]?.url && (
                    <span className="text-xs text-red-500">{errors.customLinks[index]?.url?.message}</span>
                  )}
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="mt-0 shrink-0">
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
            
            {fields.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No custom links added yet.</p>
            )}
            {fields.length >= 5 && (
              <p className="text-xs text-yellow-600">Maximum of 5 custom links reached.</p>
            )}
          </div>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-md text-sm">{error}</div>}
      {success && <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-md text-sm">Profile updated successfully!</div>}

      <div className="pt-4 border-t flex justify-end">
        <Button type="submit" disabled={isPending}>
          <Save className="mr-2 h-4 w-4" />
          {isPending ? 'Saving...' : 'Save Profile'}
        </Button>
      </div>
    </form>
  )
}
