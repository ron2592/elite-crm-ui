'use client'

// components/kpi/cancellation-panel.tsx
// The leakage KPI the Command Center was missing entirely.
// Answers: how much did we sell and then give back, who sold it,
// which lead source did we pay for it, and at what stage did it die.

import { useEffect, useState } from 'react'
import { getCancellations, money, type Cancellation } from '@/lib/production/cancellation'

export function CancellationPanel({ from, to }: { from?: string; to?: string }) {
  const [rows, setRows] = useState<Cancellation[] | null>(null)

  useEffect(() => {
    getCancellations(from && to ? { from, to } : undefined).then(setRows).catch(console.error)
  }, [from, to])

  if (!rows) return <div className="h-40 animate-pulse rounded-lg bg-slate-100" />

  const lost = rows.reduce((a, r) => a + Number(r.revenue_lost), 0)
  const retained = rows.reduce((a, r) => a + Number(r.retained), 0)

  const bySource = group(rows, r => r.source_name)
  const byPerson = group(rows, r => r.salesperson)
  const byStage = group(rows, r => r.cancelled_at_stage)

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-baseline justify-between border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">Cancellations</h3>
        <div className="text-sm">
          <span className="font-semibold tabular-nums text-red-600">{money(lost)}</span>
          <span className="ml-2 text-slate-500">reversed</span>
          {retained > 0 && (
            <span className="ml-3 text-slate-500">
              {money(retained)} kept as fees
            </span>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500">No cancellations in this period.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-px border-b border-slate-200 bg-slate-200">
            <Breakdown title="By lead source" data={bySource} />
            <Breakdown title="By salesperson" data={byPerson} />
            <Breakdown title="Died at stage" data={byStage} />
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <Th>Job</Th><Th>Scope</Th><Th>Source</Th><Th>Rep</Th>
                <Th className="text-right">Contract</Th>
                <Th className="text-right">Kept</Th>
                <Th className="text-right">Reversed</Th>
                <Th>Cancelled</Th><Th>Reason</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={`${r.lead_id}-${r.change_order_id ?? 'base'}`} className="border-b border-slate-100">
                  <Td className="font-medium text-slate-900">{r.lead_name}</Td>
                  <Td className="text-slate-600">{r.scope}</Td>
                  <Td className="text-slate-600">{r.source_name}</Td>
                  <Td className="text-slate-600">{r.salesperson}</Td>
                  <Td className="text-right tabular-nums">{money(r.contract_value)}</Td>
                  <Td className="text-right tabular-nums text-emerald-700">
                    {Number(r.retained) > 0 ? money(r.retained) : '—'}
                  </Td>
                  <Td className="text-right tabular-nums font-medium text-red-600">
                    −{money(r.revenue_lost)}
                  </Td>
                  <Td className="text-slate-600">{r.cancelled_on}</Td>
                  <Td className="max-w-[220px] truncate text-slate-500" title={r.reason ?? ''}>
                    {r.reason ?? <span className="text-amber-600">no reason logged</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

function Breakdown({ title, data }: { title: string; data: Map<string, number> }) {
  const entries = Array.from(data.entries()).sort((a, b) => b[1] - a[1])
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{title}</div>
      <ul className="mt-2 space-y-1">
        {entries.map(([k, v]) => (
          <li key={k} className="flex justify-between text-sm">
            <span className="truncate text-slate-700">{k}</span>
            <span className="ml-3 tabular-nums text-slate-900">{money(v)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const group = (rows: Cancellation[], key: (r: Cancellation) => string) => {
  const m = new Map<string, number>()
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + Number(r.revenue_lost))
  return m
}

const Th = ({ children, className = '' }: any) => <th className={`px-4 py-2 font-medium ${className}`}>{children}</th>
const Td = ({ children, className = '' }: any) => <td className={`px-4 py-2 ${className}`}>{children}</td>
