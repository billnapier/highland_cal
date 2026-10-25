'use client'

import { useRouter, usePathname } from 'next/navigation'

interface AdminUserFilterProps {
  currentFilter: string | null
}

export function AdminUserFilter({ currentFilter }: AdminUserFilterProps) {
  const router = useRouter()
  const pathname = usePathname()

  const setFilter = (role: string | null) => {
    const params = new URLSearchParams()
    if (role) {
      params.set('role', role)
    }
    router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`)
  }

  const filters = [
    { label: 'All', value: null },
    { label: 'Pending', value: 'PENDING' },
    { label: 'Approved', value: 'APPROVED' },
    { label: 'Admin', value: 'ADMIN' },
  ]

  return (
    <div className="flex gap-1.5">
      {filters.map((f) => (
        <button
          key={f.label}
          onClick={() => setFilter(f.value)}
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            currentFilter === f.value
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}