'use client'

// components/production/cancel-job-dialog.tsx
// The ONLY way a job or change order gets cancelled in the Command Center.
// Forces a reason, asks the deposit question, and books the refund in the
// same transaction that reverses the revenue.

import { useMemo, useState } from 'react'
import {
  cancelJob,
  CANCELLATION_STAGES,
  type CancellationStage,
  moneyExact,
} from '@/lib/production/cancellation'

type Props = {
  open: boolean
  onClose: () => void
  onDone?: () => void            // refetch the page after this fires
  leadId: string
  changeOrderId?: string | null
  jobLabel: string               // "JCC Bayone — CO #8"
  contractValue: number
  collectedOnJob: number         // cash already received against this job
}

const REASONS = [
  'Customer changed mind',
  'Price / financing fell through',
  'Went with another contractor',
  'Scope no longer needed',
  'Permit or HOA denied',
  'Scheduling could not be met',
  'Company declined the job',
  'Other',
]

export function CancelJobDialog({
  open, onClose, onDone, leadId, changeOrderId,
  jobLabel, contractValue, collectedOnJob,
}: Props) {
  const [stage, setStage] = useState<CancellationStage>('Cancelled Before Start')
  const [reasonPick, setReasonPick] = useState(REASONS[0])
  const [reasonNote, setReasonNote] = useState('')
  const [retained, setRetained] = useState(0)
  const [refund, setRefund] = useState(0)
  const [method, setMethod] = useState<'Check' | 'Zelle' | 'Cash' | 'Credit Card'>('Check')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const reversed = useMemo(
    () => Math.max(contractValue - (retained || 0), 0),
    [contractValue, retained],
  )
  const heldAfter = useMemo(
    () => collectedOnJob - (refund || 0),
    [collectedOnJob, refund],
  )
  const stillOwed = useMemo(
    () => Math.max(heldAfter - (retained || 0), 0),
    [heldAfter, retained],
  )

  if (!open) return null

  const invalid =
    retained > contractValue ||
    refund > collectedOnJob ||
    retained < 0 || refund < 0 ||
    (reasonPick === 'Other' && reasonNote.trim() === '')

  async function submit() {
    setBusy(true); setErr(null)
    try {
      await cancelJob({
        leadId,
        changeOrderId,
        reason: reasonNote.trim() ? `${reasonPick} — ${reasonNote.trim()}` : reasonPick,
        stage,
        retained,
        refundAmount: refund,
        refundMethod: method,
      })
      onDone?.()
      onClose()
    } catch (e: any) {
      setErr(e?.message ?? 'Cancellation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Cancel job</h2>
          <p className="mt-0.5 text-sm text-slate-500">{jobLabel}</p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <Field label="Cancelled at stage">
            <select
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              value={stage}
              onChange={e => setStage(e.target.value as CancellationStage)}
            >
              {CANCELLATION_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>

          <Field label="Reason" hint="Required — this is the leakage report">
            <select
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              value={reasonPick}
              onChange={e => setReasonPick(e.target.value)}
            >
              {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <input
              className="mt-2 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              placeholder={reasonPick === 'Other' ? 'Describe what happened (required)' : 'Detail (optional)'}
              value={reasonNote}
              onChange={e => setReasonNote(e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fee we keep" hint="Restocking / mobilization">
              <MoneyInput value={retained} onChange={setRetained} max={contractValue} />
            </Field>
            <Field label="Deposit refunded" hint={`Collected: ${moneyExact(collectedOnJob)}`}>
              <MoneyInput value={refund} onChange={setRefund} max={collectedOnJob} />
            </Field>
          </div>

          {refund > 0 && (
            <Field label="Refund method">
              <select
                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
                value={method}
                onChange={e => setMethod(e.target.value as any)}
              >
                {['Check', 'Zelle', 'Cash', 'Credit Card'].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </Field>
          )}

          <div className="rounded-md bg-slate-50 px-3 py-3 text-sm">
            <Row label="Revenue reversed" value={`− ${moneyExact(reversed)}`} strong />
            <Row label="Revenue retained" value={moneyExact(retained)} />
            <Row label="Cash going back out" value={refund > 0 ? `− ${moneyExact(refund)}` : '—'} />
            <Row
              label="Still owed to customer after this"
              value={moneyExact(stillOwed)}
              warn={stillOwed > 0}
            />
          </div>

          {retained > contractValue && (
            <p className="text-sm text-red-600">Fee kept cannot exceed the contract value.</p>
          )}
          {refund > collectedOnJob && (
            <p className="text-sm text-red-600">You cannot refund more than was collected.</p>
          )}
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            onClick={onClose}
            disabled={busy}
          >
            Back
          </button>
          <button
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            onClick={submit}
            disabled={busy || invalid}
          >
            {busy ? 'Cancelling…' : 'Cancel job'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: any) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}{hint && <span className="ml-2 font-normal normal-case text-slate-400">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

function MoneyInput({ value, onChange, max }: { value: number; onChange: (n: number) => void; max: number }) {
  return (
    <div className="flex items-center rounded-md border border-slate-300 px-2.5">
      <span className="text-sm text-slate-400">$</span>
      <input
        type="number" min={0} max={max} step="0.01"
        className="w-full px-1.5 py-1.5 text-sm outline-none"
        value={value === 0 ? '' : value}
        placeholder="0"
        onChange={e => onChange(Number(e.target.value || 0))}
      />
    </div>
  )
}

function Row({ label, value, strong, warn }: any) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span className="text-slate-600">{label}</span>
      <span className={[
        'tabular-nums',
        strong ? 'font-semibold text-slate-900' : 'text-slate-700',
        warn ? 'font-semibold text-amber-600' : '',
      ].join(' ')}>{value}</span>
    </div>
  )
}
