'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, X } from 'lucide-react'
import Image from 'next/image'

interface ImageUploadProps {
  value: string
  onChange: (url: string) => void
  bucket?: string
  pathPrefix?: string
}

export function ImageUpload({ value, onChange, bucket = 'public_images', pathPrefix = 'uploads' }: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setError(null)
      setIsUploading(true)
      const file = e.target.files?.[0]
      if (!file) return

      const fileExt = file.name.split('.').pop()
      const fileName = `${pathPrefix}/${crypto.randomUUID()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, { upsert: true })

      if (uploadError) {
        throw uploadError
      }

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName)

      if (value) {
        await deleteOldFile(value)
      }

      onChange(publicUrl)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error uploading image')
    } finally {
      setIsUploading(false)
    }
  }

  const deleteOldFile = async (url: string) => {
    try {
      const parts = url.split(`/public/${bucket}/`)
      if (parts.length === 2) {
        const filePath = parts[1]
        await supabase.storage.from(bucket).remove([filePath])
      }
    } catch (err) {
      console.error('Failed to delete old image', err)
    }
  }

  return (
    <div className="space-y-4">
      {value ? (
        <div className="relative inline-block">
          <div className="relative h-40 w-40 overflow-hidden rounded-lg border">
            <Image src={value} alt="Uploaded preview" fill className="object-cover" />
          </div>
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
            onClick={async () => {
              if (value) {
                await deleteOldFile(value)
              }
              onChange('')
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <Input 
            type="file" 
            accept="image/*" 
            onChange={handleUpload} 
            disabled={isUploading}
            className="w-full max-w-sm cursor-pointer"
          />
          {isUploading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
