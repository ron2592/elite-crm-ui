// lib/production/cancellation.ts
// Elite Command Center — cancellation + refund data layer
// Every money number on the Production page and the KPI cards comes from here.
//
// The rule this file enforces:
//   Gross sold  = what we signed              (never restated)
//   Cancelled   = what we gave back           (dated at cancellation)
//   Net sold    = gross - cancelled           (the real number)
//   Collected   = cash in MINUS refunds out   (signed ledger)
//   AR          = net sold - collected        (cancelled work is never AR)
//   Refund due  = collected - net sold        (money we hold and no longer own)

// This repo exports a single shared browser client rather than a per-call factory.
import { supabase } from '@/lib/supabaseClient'

// ---------------------------------------------------------------- types

export type CancellationStage =
  | 'Cancelled Before Start'
  | 'Cancelled During Job'

export const CANCELLATION_STAGES: CancellationStage[] = [
  'Cancelled Before Start',
  'Cancelled During Job',
]

export function isCancelledStage(stage?: string | null): boolean {
  return (stage ?? '').toLowerCase().startsWith('cancelled')
}

export type RevenueEvent = {
  lead_id: string
  source_id: string | null
  event_type: 'initial_contract' | 'change_order' | 'cancellation'
  event_date: string
  amount: number
  record_type: string | null
  contact_id: string | null
  is_repeat_business: boolean
  is_cancelled: boolean
  cancelled_at: string | null
  change_order_id: string | null
}

export type Cancellation = {
  lead_id: string
  lead_name: string
  change_order_id: string | null
  scope: string
  description: string
  source_name: string
  source_category: string
  salesperson: string
  cancelled_on: string
  contract_value: number
  retained: number
  revenue_lost: number
  reason: string | null
  cancelled_at_stage: string
  cancelled_month: string
  net_collected_on_lead: number
  refund_due: number
}

export type RefundDue = {
  lead_id: string
  lead_name: string
  source_name: string
  net_sold: number
  net_collected: number
  refund_due: number
  retained: number
  cancelled_at: string | null
  last_payment_at: string | null
  days_since_cancellation: number | null
}

export type ArRow = {
  lead_id: string
  lead_name: string
  source_name: string
  sold: number            // NET sold
  gross_sold: number
  cancelled_amount: number
  collected: number       // NET collected
  gross_collected: number
  refunded: number
  outstanding: number
  pct_collected: number | null
  aging_bucket: '0-30' | '31-60' | '61-90' | '90+'
  days_since_activity: number
}

export type MoneySummary = {
  grossSold: number
  cancelled: number
  netSold: number
  collected: number
  refunded: number
  arOutstanding: number
  refundsDue: number
  cancelledJobs: number
  cancellationRate: number   // cancelled / grossSold
}

export type Period = { from: string; to: string }   // ISO yyyy-mm-dd

// ---------------------------------------------------------------- reads

export async function getRevenueEvents(
  period?: Period,
  opts?: { restated?: boolean },
): Promise<RevenueEvent[]> {
  // contra-revenue is the default; the restated view is the toggle
  const view = opts?.restated ? 'v_revenue_events_restated' : 'revenue_events'
  let q = supabase.from(view).select('*')
  if (period) q = q.gte('event_date', period.from).lte('event_date', period.to)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as RevenueEvent[]
}

export async function getCancellations(period?: Period): Promise<Cancellation[]> {
  let q = supabase.from('v_cancellations').select('*').order('cancelled_on', { ascending: false })
  if (period) q = q.gte('cancelled_on', period.from).lte('cancelled_on', period.to)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Cancellation[]
}

export async function getRefundsDue(): Promise<RefundDue[]> {
  const { data, error } = await supabase
    .from('v_refunds_due')
    .select('*')
    .order('refund_due', { ascending: false })
  if (error) throw error
  return (data ?? []) as RefundDue[]
}

export async function getAr(): Promise<ArRow[]> {
  const { data, error } = await supabase
    .from('v_ar_outstanding')
    .select('*')
    .order('outstanding', { ascending: false })
  if (error) throw error
  return (data ?? []) as ArRow[]
}

/**
 * One call, every headline money number. Use this for the cards so the
 * Production page and the KPI page can never disagree again.
 */
export async function getMoneySummary(
  period?: Period,
  opts?: { restated?: boolean },
): Promise<MoneySummary> {
  const [events, cancels, ar, refunds] = await Promise.all([
    getRevenueEvents(period, opts),
    getCancellations(period),
    getAr(),
    getRefundsDue(),
  ])

  let cashQ = supabase.from('v_cash_events').select('amount, is_refund')
  if (period) cashQ = cashQ.gte('event_date', period.from).lte('event_date', period.to)
  const { data: cash, error: cashErr } = await cashQ
  if (cashErr) throw cashErr

  const grossSold = sum(events.filter(e => e.event_type !== 'cancellation').map(e => e.amount))
  const cancelled = -sum(events.filter(e => e.event_type === 'cancellation').map(e => e.amount))
  const collected = sum((cash ?? []).map((c: any) => Number(c.amount)))
  const refunded = -sum((cash ?? []).filter((c: any) => c.is_refund).map((c: any) => Number(c.amount)))

  return {
    grossSold,
    cancelled,
    netSold: grossSold - cancelled,
    collected,
    refunded,
    arOutstanding: sum(ar.map(r => Number(r.outstanding))),
    refundsDue: sum(refunds.map(r => Number(r.refund_due))),
    cancelledJobs: cancels.length,
    cancellationRate: grossSold > 0 ? cancelled / grossSold : 0,
  }
}

// ---------------------------------------------------------------- writes

export type CancelJobInput = {
  leadId: string
  reason: string                         // required — no silent cancellations
  changeOrderId?: string | null          // set to cancel one CO, omit for the whole job
  stage?: CancellationStage
  retained?: number                      // cancellation fee kept, positive
  refundAmount?: number                  // deposit returned, positive
  refundMethod?: 'Cash' | 'Check' | 'Zelle' | 'Credit Card' | 'Sunlight Financial' | 'Upgrade'
  refundDate?: string                    // yyyy-mm-dd
  cancelledAt?: string                   // ISO, defaults to now
}

export type CancelJobResult = {
  lead_id: string
  change_order_id: string | null
  cancelled_at: string
  contract_value: number
  retained: number
  revenue_reversed: number
  refund_booked: number
  refund_payment_id: string | null
  net_collected_on_lead: number
  refund_still_due: number
}

/**
 * Atomic. Stamps the stage, the reason, the retained fee and books the
 * deposit refund as negative cash in one transaction. Never update
 * production_stage directly from the UI to cancel something — this is the door.
 */
export async function cancelJob(input: CancelJobInput): Promise<CancelJobResult> {
  const { data, error } = await supabase.rpc('cancel_job', {
    p_lead_id: input.leadId,
    p_reason: input.reason,
    p_change_order_id: input.changeOrderId ?? null,
    p_stage: input.stage ?? 'Cancelled Before Start',
    p_retained: input.retained ?? 0,
    p_refund_amount: input.refundAmount ?? 0,
    p_refund_method: input.refundMethod ?? 'Check',
    p_refund_date: input.refundDate ?? null,
    p_cancelled_at: input.cancelledAt ?? null,
  })
  if (error) throw error
  return data as CancelJobResult
}

export async function uncancelJob(
  leadId: string,
  changeOrderId?: string | null,
  stage = 'Pending - Deposit',
) {
  const { data, error } = await supabase.rpc('uncancel_job', {
    p_lead_id: leadId,
    p_change_order_id: changeOrderId ?? null,
    p_stage: stage,
  })
  if (error) throw error
  return data
}

// ---------------------------------------------------------------- helpers

const sum = (xs: number[]) => xs.reduce((a, b) => a + Number(b || 0), 0)

export const money = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(n || 0))

export const moneyExact = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n || 0))

export const pct = (n: number | null | undefined) =>
  `${((Number(n) || 0) * 100).toFixed(1)}%`
