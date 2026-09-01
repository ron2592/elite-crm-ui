'use client'

// components/production/production-summary-cards.tsx
// Replaces the three cards at the top of the Production page.
//
// The old cards were wrong in two ways:
//   1. "Total Jobs — 1 pending, 1 cancelled" counted the same two rows twice
//      and disagreed with the "Cancelled 1" filter chip.
//   2. "Total Balance Due $15,025" was billing the client for work that had
//      been cancelled. Cancelled contract value is not receivable.

import { useEffect, useState } from 'react'
import { getMoneySummary, getRefundsDue, money, type MoneySummary, type RefundDue } from '@/lib/production/cancellation'

type Props = { from?: string; to?: string }

export function ProductionSummaryCards({ from, to }: Props) {
  const [s, setS] = useState<MoneySummary | null>(null)
  const [refunds, setRefunds] = useState<RefundDue[]>([])

  useEffect(() => {
    const period = from && to ? { from, to } : undefined
    getMoneySummary(period).then(setS).catch(console.error)
    getRefundsDue().then(setRefunds).catch(console.error)
  }, [from, to])

  if (!s) return <div className="h-28 animate-pulse rounded-lg bg-slate-100" />

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <Card
        label="Net contract value"
        value={money(s.netSold)}
        sub={`${money(s.grossSold)} signed − ${money(s.cancelled)} cancelled`}
      />
      <Card
        label="Collected"
        value={money(s.collected)}
        tone="good"
        sub={s.refunded > 0 ? `net of ${money(s.refunded)} refunded` : 'net of refunds'}
      />
      <Card
        label="Balance due"
        value={money(s.arOutstanding)}
        tone={s.arOutstanding > 0 ? 'warn' : undefined}
        sub="cancelled work excluded"
      />
      <Card
        label="Cancelled"
        value={money(s.cancelled)}
        tone={s.cancelled > 0 ? 'bad' : undefined}
        sub={`${s.cancelledJobs} job${s.cancelledJobs === 1 ? '' : 's'} · ${(s.cancellationRate * 100).toFixed(1)}% of signed`}
      />

      {refunds.length > 0 && (
        <div className="md:col-span-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-amber-900">
              Deposits held on cancelled jobs — {money(s.refundsDue)} owed back
            </span>
            <span className="text-xs text-amber-700">{refunds.length} customer{refunds.length === 1 ? '' : 's'}</span>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {refunds.map(r => (
              <li key={r.lead_id} className="flex justify-between">
                <span>
                  {r.lead_name}
                  {r.days_since_cancellation != null && (
                    <span className="ml-2 text-xs text-amber-700">
                      cancelled {r.days_since_cancellation}d ago
                    </span>
                  )}
                </span>
                <span className="tabular-nums font-medium">{money(r.refund_due)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Card({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: 'good' | 'warn' | 'bad'
}) {
  const color =
    tone === 'good' ? 'text-emerald-600'
    : tone === 'warn' ? 'text-amber-600'
    : tone === 'bad' ? 'text-red-600'
    : 'text-slate-900'
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}
