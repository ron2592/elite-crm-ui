'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

/**
 * Outstanding AR — signed work that hasn't been collected yet, aged.
 *
 * This is the number the KPI page never had. Revenue Sold and Cash Collected will
 * always differ in a given period (a job signed today collects over months; cash
 * landing today may belong to a job sold in March). The difference is this.
 *
 * Reads v_ar_outstanding, which is built on revenue_events (sold) minus
 * v_cash_events (collected) — one bookings definition, shared with the rest of
 * the page. Aging runs from the last money movement on the job.
 */

interface ArRow {
  lead_id: string
  lead_name: string | null
  source_name: string
  source_category: string
  is_repeat_business: boolean
  sold: number
  collected: number
  outstanding: number
  pct_collected: number | null
  last_payment_at: string | null
  days_since_activity: number
  aging_bucket: '0-30' | '31-60' | '61-90' | '90+'
}

const BUCKETS: ArRow['aging_bucket'][] = ['0-30', '31-60', '61-90', '90+']

const BUCKET_TONE: Record<ArRow['aging_bucket'], string> = {
  '0-30': 'text-foreground',
  '31-60': 'text-foreground',
  '61-90': 'text-amber-500',
  '90+': 'text-red-500',
}

const fmt$ = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmt$exact = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

export default function ArPanel({ limit = 8 }: { limit?: number }) {
  const [rows, setRows] = useState<ArRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('v_ar_outstanding')
      .select('*')
      .order('outstanding', { ascending: false })
      .then(({ data, error }) => {
        if (error) setErr(error.message)
        else setRows((data || []) as ArRow[])
      })
  }, [])

  if (err) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
        Could not load AR: {err}
      </div>
    )
  }

  const total = (rows || []).reduce((s, r) => s + Number(r.outstanding), 0)
  const byBucket = BUCKETS.map(b => ({
    bucket: b,
    amount: (rows || []).filter(r => r.aging_bucket === b).reduce((s, r) => s + Number(r.outstanding), 0),
    count: (rows || []).filter(r => r.aging_bucket === b).length,
  }))

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-6 py-5 border-b border-border">
        <div>
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
            Outstanding AR
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Signed contract value not yet collected · as of today
          </p>
        </div>
        <p className="text-3xl font-bold tabular-nums">{rows ? fmt$exact(total) : '—'}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border border-b border-border">
        {byBucket.map(b => (
          <div key={b.bucket} className="px-6 py-4">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">
              {b.bucket} days
            </p>
            <p className={`text-xl font-bold mt-1 tabular-nums ${BUCKET_TONE[b.bucket]}`}>
              {rows ? fmt$(b.amount) : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {b.count} {b.count === 1 ? 'job' : 'jobs'}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
              <th className="py-2.5 px-6 font-semibold">Job</th>
              <th className="py-2.5 pr-3 font-semibold">Source</th>
              <th className="py-2.5 pr-3 font-semibold text-right">Sold</th>
              <th className="py-2.5 pr-3 font-semibold text-right">Collected</th>
              <th className="py-2.5 pr-3 font-semibold text-right">Outstanding</th>
              <th className="py-2.5 pr-6 font-semibold text-right">Idle</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).slice(0, limit).map(r => (
              <tr key={r.lead_id} className="border-b border-border/50 last:border-0">
                <td className="py-2.5 px-6 font-medium">
                  {r.lead_name || '—'}
                  {r.is_repeat_business && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                      repeat
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-muted-foreground">{r.source_name}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground">
                  {fmt$(Number(r.sold))}
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground">
                  {fmt$(Number(r.collected))}
                  {r.pct_collected != null && (
                    <span className="ml-1.5 text-xs opacity-60">{r.pct_collected}%</span>
                  )}
                </td>
                <td className={`py-2.5 pr-3 text-right font-bold tabular-nums ${BUCKET_TONE[r.aging_bucket]}`}>
                  {fmt$exact(Number(r.outstanding))}
                </td>
                <td className={`py-2.5 pr-6 text-right tabular-nums ${r.days_since_activity > 90 ? 'font-bold text-red-500' : 'text-muted-foreground'}`}>
                  {r.days_since_activity}d
                </td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Nothing outstanding — every signed job is fully collected.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rows && rows.length > limit && (
        <p className="px-6 py-3 text-xs text-muted-foreground border-t border-border">
          Showing top {limit} of {rows.length} balances.
        </p>
      )}
    </div>
  )
}
