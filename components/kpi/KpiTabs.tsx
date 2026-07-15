'use client'

import { useRouter, usePathname } from 'next/navigation'
import { LayoutDashboard } from 'lucide-react'

const TABS = [
  { href: '/kpi',             label: 'Marketing Performance' },
  { href: '/kpi/organic',     label: 'Organic & Repeat' },
  { href: '/kpi/salesperson', label: 'Salesperson' },
  { href: '/kpi/health',      label: 'Company Health' },
]

// Shared nav strip across all four KPI pages so switching views is a single click from
// anywhere, instead of hunting through a dropdown that hid the destination until opened.
export default function KpiTabs({ dark = false }: { dark?: boolean }) {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button onClick={() => router.push('/dashboard')}
        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors ${
          dark ? 'border-gray-700 hover:bg-gray-800 text-gray-400' : 'border-border hover:bg-muted text-muted-foreground'
        }`}>
        <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
      </button>
      <div className={`flex rounded-lg border overflow-hidden ${dark ? 'border-gray-700' : 'border-border'}`}>
        {TABS.map(t => {
          const active = pathname === t.href
          return (
            <button key={t.href} onClick={() => router.push(t.href)}
              className={`px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : dark ? 'text-gray-400 hover:bg-gray-800' : 'text-muted-foreground hover:bg-muted'
              }`}>
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
