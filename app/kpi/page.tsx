'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line,
} from 'recharts'
import {
  ChevronDown, ChevronUp, Plus, Save, X, Loader2,
  Printer, Trash2, TrendingUp,
} from 'lucide-react'
import KpiInsights, { InsightData } from '@/components/KpiInsights'
import KpiTabs from '@/components/kpi/KpiTabs'
import { CancellationPanel } from '@/components/kpi/cancellation-panel'

interface LeadRow {
  id: string; first_name?: string; last_name?: string; lead_name?: string; phone?: string;
  status: string; contact_type: string | null; lsa_status: string | null;
  initial_contract_value: number; created_at: string; source_id: string | null;
  metadata: { salesperson?: string; job_type?: string } | null;
  lead_sources: { name: string } | null;
}
interface PaymentRow { amount: number; paid_at: string; lead_id: string }
interface SpendRow {
  id: string; period_start: string; period_end?: string; source_name: string | null;
  source_id: string | null; amount_spent: number;
  lead_sources: { name: string } | null;
}
interface LeadSource { id: string; name: string }
// Year-to-Date block totals — aggregated ONLY from v_ytd_kpi_by_source rows where
// is_paid_channel = true, so ad spend is never divided into organic / referral /
// repeat-client leads, appointments, clients or cash it did not produce.
// clientsWon = closed_jobs from the view, which counts leads (one per client),
// NOT change-order units — a customer is acquired once; the change orders they
// later sign are revenue, never an entry in an acquisition denominator.
interface YtdPaidTotals {
  spend: number
  leads: number
  appts: number
  clientsWon: number
  collected: number
  grossSold: number
  netSold: number
  cancelledChannels: string[]   // paid channels with cancelled_value > 0
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const WON_STAGES = ['closed_won', 'won', 'completed', 'completed_with_balance']

const SRC_COLORS = ['#378ADD','#E07B3A','#10b981','#8b5cf6','#ec4899','#06b6d4','#f59e0b','#ef4444']

function fmt$(n: number) {
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${m}-${day}-${y}`
}

function closeRatePct(won: number, appts: number) {
  return appts === 0 ? '—' : Math.round((won / appts) * 100) + '%'
}
function todayStr() { return new Date().toISOString().split('T')[0] }
function firstOfMonthStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-01`
}

function ExpandMetric({ label, value, color = '', children }: {
  label: string; value: React.ReactNode; color?: string; children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-4 hover:bg-muted/30 transition-colors">
        <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`font-bold text-2xl ${color}`}>{value}</span>
          {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>
      {open && <div className="border-t border-border bg-muted/10 px-4 py-3">{children}</div>}
    </div>
  )
}

function Section({ title, badge, defaultOpen = true, children }: {
  title: string; badge?: string; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{title}</span>
          {badge && <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{badge}</span>}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  )
}

function MetricCard({ label, value, sub, color = '' }: {
  label: string; value: string | number; sub?: string; color?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col justify-between min-h-[100px]">
      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-2">{label}</p>
      <p className={`text-2xl font-bold ${color || 'text-foreground'}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

// Year-to-Date, PAID CHANNELS ONLY. Fetches v_ytd_kpi_by_source (current calendar
// year, one row per lead source), keeps only is_paid_channel rows, and sums them.
// Paid on BOTH sides of every ratio: paid spend over paid leads / appts / clients /
// signed / collected — never paid spend over an all-source count. That all-source
// mix is what inflated Marketing ROI to 10.6x. The view is hard-scoped to the
// current year, so there is no year picker; past-year YTD is not something this
// canonical view answers.
function YtdPaidBlock() {
  const [t, setT] = useState<YtdPaidTotals | null>(null)

  useEffect(() => {
    supabase
      .from('v_ytd_kpi_by_source')
      .select('lead_source,is_paid_channel,ytd_spend,ytd_leads,ytd_appts,closed_jobs,recorded_revenue,gross_sold,net_sold,cancelled_value')
      .then(({ data }) => {
        const paid = ((data as any[]) || []).filter(r => r.is_paid_channel)
        const s = (f: (r: any) => any) => paid.reduce((acc, r) => acc + (Number(f(r)) || 0), 0)
        setT({
          spend: s(r => r.ytd_spend),
          leads: s(r => r.ytd_leads),
          appts: s(r => r.ytd_appts),
          clientsWon: s(r => r.closed_jobs),
          collected: s(r => r.recorded_revenue),
          grossSold: s(r => r.gross_sold),
          netSold: s(r => r.net_sold),
          cancelledChannels: paid.filter(r => Number(r.cancelled_value) > 0).map(r => r.lead_source),
        })
      })
  }, [])

  if (!t) return (
    <div className="rounded-xl border border-border p-4 flex items-center justify-center gap-2 text-muted-foreground text-sm">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading year-to-date metrics…
    </div>
  )

  const year = new Date().getFullYear()
  const hasData = t.spend > 0 && t.clientsWon > 0
  const costPerLead    = t.leads > 0 ? t.spend / t.leads : 0
  const costPerAppt    = t.appts > 0 ? t.spend / t.appts : 0
  const costPerClient  = t.clientsWon > 0 ? t.spend / t.clientsWon : 0
  const avgClientValue = t.clientsWon > 0 ? t.grossSold / t.clientsWon : 0
  const roiOnSigned    = t.spend > 0 ? t.grossSold / t.spend : 0
  const roiOnCollected = t.spend > 0 ? t.collected / t.spend : 0
  const roiAfterCxl    = t.spend > 0 ? t.netSold / t.spend : 0
  // Paid ad spend as a share of every dollar of paid-channel work signed. Scales
  // with the job — a $40k job carries ~$0.36×40k, not a flat per-estimate load.
  const costShareCents = t.grossSold > 0 ? Math.round((t.spend / t.grossSold) * 100) : 0

  const acq: { label: string; value: string; sub: string }[] = [
    { label: 'Cost / Lead',       value: costPerLead > 0 ? fmt$(costPerLead) : '—',       sub: `${t.leads} leads` },
    { label: 'Cost / Appointment', value: costPerAppt > 0 ? fmt$(costPerAppt) : '—',       sub: `${t.appts} appts` },
    { label: 'Cost / Client Won', value: costPerClient > 0 ? fmt$(costPerClient) : '—',    sub: `${t.clientsWon} clients` },
    { label: 'Avg Client Value',  value: avgClientValue > 0 ? fmt$(avgClientValue) : '—',  sub: 'signed / client' },
  ]

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 bg-muted/20 border-b border-border">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-bold">Year-to-Date · {year}</p>
            <p className="text-xs text-muted-foreground">
              Jan 1 – today · For job pricing decisions
              {!hasData && <span className="ml-1 text-amber-500">· No paid spend / clients logged for {year}</span>}
            </p>
          </div>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-semibold border border-primary/20 whitespace-nowrap">
          Paid channels only
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border bg-card">
        {acq.map(a => (
          <div key={a.label} className="px-6 py-5">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">{a.label}</p>
            <p className="text-3xl font-bold mt-1">{a.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{a.sub}</p>
          </div>
        ))}
      </div>

      <div className="px-6 py-5 border-t border-border bg-card">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">Marketing ROI</p>
        <div className="flex items-baseline gap-2">
          <p className={`text-3xl font-bold ${!roiOnSigned ? 'text-muted-foreground' : roiOnSigned >= 5 ? 'text-emerald-600' : roiOnSigned >= 2 ? 'text-amber-500' : 'text-red-500'}`}>
            {roiOnSigned > 0 ? roiOnSigned.toFixed(2) + 'x' : '—'}
          </p>
          <span className="text-xs text-muted-foreground">on signed work</span>
        </div>
        {roiOnCollected > 0 && (
          <p className="text-xs text-muted-foreground mt-1">{roiOnCollected.toFixed(2)}x on cash collected</p>
        )}
        {t.cancelledChannels.length > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
            {roiAfterCxl.toFixed(2)}x after cancellations · {t.cancelledChannels.join(', ')}
          </p>
        )}
      </div>

      {costShareCents > 0 && (
        <div className="px-5 py-3 bg-amber-50/50 dark:bg-amber-950/10 border-t border-amber-200/50 dark:border-amber-800/30">
          <p className="text-xs text-amber-800 dark:text-amber-300">
            <span className="font-semibold">Marketing costs {costShareCents}¢</span> of every $1 of paid-channel work signed —
            build that share into the price, not a flat amount per estimate.
          </p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Data-quality strip — reads v_kpi_health and surfaces ONLY the BROKEN metrics,
// so nobody reads a 0% closing rate (or a zeroed overdue-alert count) as real.
// One muted line, collapsed by default; expands to the metric name + one plain
// sentence each. The view's own `detail` / `what_it_means` text names raw columns
// (next_follow_up_at, estimate_sent, assigned_to) that mean nothing to a reader
// of this page, so we render our own plain copy keyed by the metric name below
// and never show the raw view text.
interface KpiHealthRow {
  kpi: string
  health: 'OK' | 'PARTIAL' | 'BROKEN'
  sort_order: number
}

const HEALTH_PLAIN: Record<string, string> = {
  'Overdue follow-up alerts':
    "Follow-up dates aren't being filled in as leads are worked, so this always shows zero.",
  'Sales closing rate':
    "Estimates sent aren't being recorded yet, so there's nothing to measure closings against and it reads 0%.",
  'Salesperson accountability':
    "Salesperson assignment is kept as free-typed text rather than a fixed pick, so one rep can show up as two.",
}

function KpiHealthStrip() {
  const [rows, setRows] = useState<KpiHealthRow[] | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    supabase
      .from('v_kpi_health')
      .select('kpi,health,sort_order')
      .then(({ data }) => setRows((data as KpiHealthRow[] | null) ?? []))
  }, [])

  if (!rows) return null
  const broken = rows
    .filter(r => r.health === 'BROKEN')
    .sort((a, b) => a.sort_order - b.sort_order)
  if (broken.length === 0) return null

  return (
    <div className="text-xs text-muted-foreground">
      <button
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
      >
        <span>
          {broken.length} metric{broken.length === 1 ? '' : 's'} on this page{' '}
          {broken.length === 1 ? "isn't" : "aren't"} reliable yet
        </span>
        <span className="underline underline-offset-2">{open ? 'hide' : 'see why'}</span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {open && (
        <ul className="mt-2 space-y-1.5 border-l-2 border-border pl-3">
          {broken.map(b => (
            <li key={b.kpi}>
              <span className="font-medium text-foreground">{b.kpi}</span>
              {' — '}
              {HEALTH_PLAIN[b.kpi] ?? 'This metric depends on data that is not being captured yet.'}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Marketing ROI by source — reads the rebuilt v_ytd_kpi_by_source (YTD, one row
// per lead source). Rules:
//  • the three ROI figures are always shown side by side, never one alone;
//  • a negative net_sold or roi_on_sold is always shown with the
//    "signed − cancelled" split that explains the sign;
//  • non-paid channels have no spend, so every spend-derived cell reads
//    "n/a — no ad spend" rather than blank or zero.
interface YtdSourceRow {
  source_id: string
  lead_source: string
  category: string | null
  is_paid_channel: boolean
  ytd_spend: number
  ytd_leads: number
  ytd_appts: number
  appt_rate_pct: number | null
  closed_jobs: number
  cancelled_jobs: number
  cost_per_lead: number | null
  cost_per_appointment: number | null
  cost_per_closed_job: number | null
  gross_sold: number
  cancelled_value: number
  net_sold: number
  recorded_revenue: number
  refunded: number
  roi_on_gross_sold: number | null
  roi_on_sold: number | null
  roi_on_collected: number | null
}

const roiFmt = (n: number) => `${n.toFixed(2)}×`

function MarketingRoiBySource() {
  const [rows, setRows] = useState<YtdSourceRow[] | null>(null)

  useEffect(() => {
    const n = (v: any): number | null => (v == null ? null : Number(v))
    supabase
      .from('v_ytd_kpi_by_source')
      .select('source_id,lead_source,category,is_paid_channel,ytd_spend,ytd_leads,ytd_appts,appt_rate_pct,closed_jobs,cancelled_jobs,cost_per_lead,cost_per_appointment,cost_per_closed_job,gross_sold,cancelled_value,net_sold,recorded_revenue,refunded,roi_on_gross_sold,roi_on_sold,roi_on_collected')
      .then(({ data }) => {
        const mapped: YtdSourceRow[] = ((data as any[]) || []).map(r => ({
          source_id: r.source_id,
          lead_source: r.lead_source,
          category: r.category ?? null,
          is_paid_channel: !!r.is_paid_channel,
          ytd_spend: Number(r.ytd_spend) || 0,
          ytd_leads: Number(r.ytd_leads) || 0,
          ytd_appts: Number(r.ytd_appts) || 0,
          appt_rate_pct: n(r.appt_rate_pct),
          closed_jobs: Number(r.closed_jobs) || 0,
          cancelled_jobs: Number(r.cancelled_jobs) || 0,
          cost_per_lead: n(r.cost_per_lead),
          cost_per_appointment: n(r.cost_per_appointment),
          cost_per_closed_job: n(r.cost_per_closed_job),
          gross_sold: Number(r.gross_sold) || 0,
          cancelled_value: Number(r.cancelled_value) || 0,
          net_sold: Number(r.net_sold) || 0,
          recorded_revenue: Number(r.recorded_revenue) || 0,
          refunded: Number(r.refunded) || 0,
          roi_on_gross_sold: n(r.roi_on_gross_sold),
          roi_on_sold: n(r.roi_on_sold),
          roi_on_collected: n(r.roi_on_collected),
        }))
        mapped.sort((a, b) =>
          Number(b.is_paid_channel) - Number(a.is_paid_channel) ||
          b.ytd_spend - a.ytd_spend ||
          b.ytd_leads - a.ytd_leads,
        )
        setRows(mapped)
      })
  }, [])

  if (!rows) {
    return (
      <Section title="Marketing ROI by Source · Year to Date" defaultOpen>
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </Section>
    )
  }

  const paidCount = rows.filter(r => r.is_paid_channel).length

  // A spend-derived cell (cost-per-* or an ROI). Non-paid channels never have a
  // real value here — show the explicit "n/a" rather than blank or 0.
  const spendCell = (val: number | null, isPaid: boolean, kind: 'money' | 'roi') => {
    if (!isPaid) return <span className="italic text-muted-foreground">n/a — no ad spend</span>
    if (val == null) return <span className="text-muted-foreground">—</span>
    if (kind === 'money') return <span>{fmt$(val)}</span>
    return <span className={val < 0 ? 'font-semibold text-red-500' : 'font-semibold'}>{roiFmt(val)}</span>
  }

  // The "why is this negative" line: gross signed minus what cancelled.
  const splitHint = (r: YtdSourceRow) => (
    <span className="block text-[11px] font-normal text-muted-foreground">
      {fmt$(r.gross_sold)} signed − {fmt$(r.cancelled_value)} cancelled
    </span>
  )

  return (
    <Section title="Marketing ROI by Source · Year to Date" badge={`${paidCount} paid channels`} defaultOpen>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground font-semibold">
              <th className="pb-2 pr-3 whitespace-nowrap">Source</th>
              <th className="pb-2 pr-3 whitespace-nowrap text-right">Spend</th>
              <th className="pb-2 pr-3 whitespace-nowrap text-right">Leads</th>
              <th className="pb-2 pr-3 whitespace-nowrap text-right">Appts</th>
              <th className="pb-2 pr-3 whitespace-nowrap text-right">Closed</th>
              <th className="pb-2 pr-3 whitespace-nowrap text-right">Cost / Lead</th>
              <th className="pb-2 pr-3 whitespace-nowrap text-right">Cost / Appt</th>
              <th className="pb-2 pr-3 whitespace-nowrap text-right">Cost / Job</th>
              <th className="pb-2 pr-3 whitespace-nowrap text-right">Gross Sold</th>
              <th className="pb-2 pr-3 whitespace-nowrap text-right">Net Sold</th>
              <th className="pb-2 pr-3 whitespace-nowrap text-right">Recorded Rev</th>
              <th className="pb-2 pr-3 whitespace-nowrap text-right border-l border-border pl-3">ROI on signed work</th>
              <th className="pb-2 pr-3 whitespace-nowrap text-right">ROI after cancellations</th>
              <th className="pb-2 pr-3 whitespace-nowrap text-right">ROI on cash collected</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const negNet = r.net_sold < 0
              const negRoiSold = r.is_paid_channel && r.roi_on_sold != null && r.roi_on_sold < 0
              return (
                <tr key={r.source_id || r.lead_source} className={`border-b border-border/50 ${r.is_paid_channel ? '' : 'text-muted-foreground/90'}`}>
                  <td className="py-2.5 pr-3 whitespace-nowrap font-medium text-foreground">
                    {r.lead_source}
                    {!r.is_paid_channel && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">no ad spend</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right whitespace-nowrap">{r.is_paid_channel ? fmt$(r.ytd_spend) : '—'}</td>
                  <td className="py-2.5 pr-3 text-right whitespace-nowrap">{r.ytd_leads}</td>
                  <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                    {r.ytd_appts}
                    {r.appt_rate_pct != null && (
                      <span className="text-[11px] text-muted-foreground ml-1">({r.appt_rate_pct.toFixed(1)}%)</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                    {r.closed_jobs}
                    {r.cancelled_jobs > 0 && (
                      <span className="text-[11px] text-red-500 ml-1">−{r.cancelled_jobs} cxl</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right whitespace-nowrap">{spendCell(r.cost_per_lead, r.is_paid_channel, 'money')}</td>
                  <td className="py-2.5 pr-3 text-right whitespace-nowrap">{spendCell(r.cost_per_appointment, r.is_paid_channel, 'money')}</td>
                  <td className="py-2.5 pr-3 text-right whitespace-nowrap">{spendCell(r.cost_per_closed_job, r.is_paid_channel, 'money')}</td>
                  <td className="py-2.5 pr-3 text-right whitespace-nowrap">{fmt$(r.gross_sold)}</td>
                  <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                    <span className={negNet ? 'font-semibold text-red-500' : ''}>{fmt$(r.net_sold)}</span>
                    {negNet && splitHint(r)}
                  </td>
                  <td className="py-2.5 pr-3 text-right whitespace-nowrap">{fmt$(r.recorded_revenue)}</td>
                  <td className="py-2.5 pr-3 text-right whitespace-nowrap border-l border-border pl-3">
                    {spendCell(r.roi_on_gross_sold, r.is_paid_channel, 'roi')}
                  </td>
                  <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                    {spendCell(r.roi_on_sold, r.is_paid_channel, 'roi')}
                    {negRoiSold && splitHint(r)}
                  </td>
                  <td className="py-2.5 pr-3 text-right whitespace-nowrap">{spendCell(r.roi_on_collected, r.is_paid_channel, 'roi')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">signed</span> = did the channel produce sales ·{' '}
        <span className="font-semibold text-foreground">after cancellations</span> = what survived ·{' '}
        <span className="font-semibold text-foreground">collected</span> = what reached the bank.
      </p>
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Marketing Performance (monthly, per source) — reads monthly_source_kpi, which
// is already period-scoped (one row per month per source) and already carries
// every figure shown here: closed_jobs EXCLUDES cancellations, total_revenue is
// NET of them, cancellation_rate / conversion rates / acquisition costs / closing
// rate are all precomputed at the view layer. Nothing is recomputed in TS — MTD
// is the current-month row, "vs" is the previous month's row, and the only
// arithmetic is A − B of two view values for the comparison deltas.
interface MonthlySourceKpi {
  period_start: string
  source_id: string | null
  source_name: string
  total_leads: number
  actual_charged_leads: number
  appointments: number
  closed_jobs: number
  lost_jobs: number
  cancelled_jobs: number
  total_revenue: number
  gross_revenue: number
  cancelled_value: number
  cancellation_rate: number
  ad_spend: number
  appointment_conversion_rate: number
  sales_closing_rate: number
  average_job_size: number
  appointment_acquisition_cost: number
  job_acquisition_cost: number
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
const monthLabel = (iso: string) => {
  const [y, m] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}
const monthShort = (iso: string) => MONTHS[Number(iso.split('-')[1]) - 1]
const pct1 = (n: number) => `${(n * 100).toFixed(1)}%`

function MarketingPerformanceMonthly() {
  const [rows, setRows] = useState<MonthlySourceKpi[] | null>(null)
  const [showCompare, setShowCompare] = useState(false)

  useEffect(() => {
    const now = new Date()
    const from = monthKey(new Date(now.getFullYear(), now.getMonth() - 3, 1))
    const num = (v: any) => (v == null ? 0 : Number(v))
    supabase
      .from('monthly_source_kpi')
      .select('period_start,source_id,source_name,total_leads,actual_charged_leads,appointments,closed_jobs,lost_jobs,cancelled_jobs,total_revenue,gross_revenue,cancelled_value,cancellation_rate,ad_spend,appointment_conversion_rate,sales_closing_rate,average_job_size,appointment_acquisition_cost,job_acquisition_cost')
      .gte('period_start', from)
      .then(({ data }) => {
        setRows(((data as any[]) || []).map(r => ({
          period_start: String(r.period_start).slice(0, 10),
          source_id: r.source_id ?? null,
          source_name: r.source_name || 'Unknown',
          total_leads: num(r.total_leads),
          actual_charged_leads: num(r.actual_charged_leads),
          appointments: num(r.appointments),
          closed_jobs: num(r.closed_jobs),
          lost_jobs: num(r.lost_jobs),
          cancelled_jobs: num(r.cancelled_jobs),
          total_revenue: num(r.total_revenue),
          gross_revenue: num(r.gross_revenue),
          cancelled_value: num(r.cancelled_value),
          cancellation_rate: num(r.cancellation_rate),
          ad_spend: num(r.ad_spend),
          appointment_conversion_rate: num(r.appointment_conversion_rate),
          sales_closing_rate: num(r.sales_closing_rate),
          average_job_size: num(r.average_job_size),
          appointment_acquisition_cost: num(r.appointment_acquisition_cost),
          job_acquisition_cost: num(r.job_acquisition_cost),
        })))
      })
  }, [])

  if (!rows) {
    return (
      <Section title="Marketing Performance" defaultOpen>
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </Section>
    )
  }

  const months = Array.from(new Set(rows.map(r => r.period_start))).sort().reverse()
  const currentMonth = monthKey(new Date())
  // MTD = the current-month row. If nothing has landed this month yet, fall back to
  // the most recent month that has data so the section isn't blank.
  const displayMonth = months.includes(currentMonth) ? currentMonth : (months[0] ?? currentMonth)
  const isFallback = displayMonth !== currentMonth
  const compareMonth = months.find(m => m < displayMonth) ?? null

  const displayRows = rows
    .filter(r => r.period_start === displayMonth)
    .sort((a, b) => b.ad_spend - a.ad_spend || b.total_leads - a.total_leads)
  const prevBySource: Record<string, MonthlySourceKpi> = {}
  if (compareMonth) {
    rows.filter(r => r.period_start === compareMonth)
      .forEach(r => { prevBySource[r.source_id || r.source_name] = r })
  }

  const anyCancellations = displayRows.some(r => r.cancelled_jobs > 0 || r.cancelled_value > 0)

  return (
    <Section
      title="Marketing Performance"
      badge={`${monthLabel(displayMonth)}${isFallback ? ' · latest data' : ' · month to date'}`}
      defaultOpen
    >
      {isFallback && (
        <p className="mb-3 text-xs text-amber-700 dark:text-amber-400">
          No activity recorded for {monthLabel(currentMonth)} yet — showing {monthLabel(displayMonth)}.
        </p>
      )}

      {compareMonth && (
        <button
          onClick={() => setShowCompare(v => !v)}
          className="mb-3 text-xs px-2.5 py-1 rounded-md border border-border hover:bg-muted text-muted-foreground"
        >
          {showCompare ? 'Hide comparison' : `Compare vs ${monthLabel(compareMonth)}`}
        </button>
      )}

      {displayRows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No marketing activity recorded for this month.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground font-semibold">
                <th className="pb-2 pr-3 whitespace-nowrap">Source</th>
                <th className="pb-2 pr-3 whitespace-nowrap text-right">Leads</th>
                <th className="pb-2 pr-3 whitespace-nowrap text-right">Charged</th>
                <th className="pb-2 pr-3 whitespace-nowrap text-right">Appts</th>
                <th className="pb-2 pr-3 whitespace-nowrap text-right">Appt Conv</th>
                <th className="pb-2 pr-3 whitespace-nowrap text-right">Closed</th>
                <th className="pb-2 pr-3 whitespace-nowrap text-right">Lost</th>
                <th className="pb-2 pr-3 whitespace-nowrap text-right">Cancelled</th>
                <th className="pb-2 pr-3 whitespace-nowrap text-right">Close %<sup>*</sup></th>
                <th className="pb-2 pr-3 whitespace-nowrap text-right">Revenue</th>
                <th className="pb-2 pr-3 whitespace-nowrap text-right">Spend</th>
                <th className="pb-2 pr-3 whitespace-nowrap text-right">Appt Cost</th>
                <th className="pb-2 pr-3 whitespace-nowrap text-right">Job Cost</th>
                <th className="pb-2 pr-3 whitespace-nowrap text-right">Avg Job</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map(r => {
                const prev = compareMonth ? prevBySource[r.source_id || r.source_name] : undefined
                const leadDelta = prev ? r.total_leads - prev.total_leads : null
                const revDelta = prev ? r.total_revenue - prev.total_revenue : null
                const hasCxl = r.cancelled_jobs > 0 || r.cancelled_value > 0
                return (
                  <tr key={r.source_id || r.source_name} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="py-2.5 pr-3 whitespace-nowrap font-medium">{r.source_name}</td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                      {r.total_leads}
                      {showCompare && leadDelta !== null && (
                        <span className={`block text-[11px] font-normal ${leadDelta > 0 ? 'text-emerald-600' : leadDelta < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                          {leadDelta > 0 ? '+' : ''}{leadDelta} vs {monthShort(compareMonth!)}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap text-muted-foreground">{r.actual_charged_leads}</td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap">{r.appointments}</td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap text-muted-foreground">{pct1(r.appointment_conversion_rate)}</td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700 font-bold">{r.closed_jobs}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap text-muted-foreground">{r.lost_jobs}</td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                      {r.cancelled_jobs > 0
                        ? <span className="text-red-500 font-medium">{r.cancelled_jobs}<span className="text-[11px] font-normal ml-1">({pct1(r.cancellation_rate)})</span></span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td
                      className="py-2.5 pr-3 text-right whitespace-nowrap text-muted-foreground italic"
                      title="Sales closing rate reads 0% because estimate_sent is not populated yet — not real performance."
                    >
                      {pct1(r.sales_closing_rate)}<sup>*</sup>
                    </td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                      <span className="font-bold text-emerald-600">{fmt$(r.total_revenue)}</span>
                      {hasCxl && (
                        <span className="block text-[11px] font-normal text-muted-foreground">
                          {fmt$(r.gross_revenue)} gross − {fmt$(r.cancelled_value)} cancelled
                        </span>
                      )}
                      {showCompare && revDelta !== null && (
                        <span className={`block text-[11px] font-normal ${revDelta > 0 ? 'text-emerald-600' : revDelta < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                          {revDelta >= 0 ? '+' : '−'}{fmt$(Math.abs(revDelta))} vs {monthShort(compareMonth!)}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap text-muted-foreground">{r.ad_spend > 0 ? fmt$(r.ad_spend) : '—'}</td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap text-muted-foreground">{r.appointment_acquisition_cost > 0 ? fmt$(r.appointment_acquisition_cost) : '—'}</td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap text-muted-foreground">{r.job_acquisition_cost > 0 ? fmt$(r.job_acquisition_cost) : '—'}</td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap text-muted-foreground">{r.average_job_size > 0 ? fmt$(r.average_job_size) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        <sup>*</sup> <span className="font-semibold text-foreground">Close %</span> reads 0% for every source —{' '}
        <code className="text-[11px]">estimate_sent</code> is not being populated yet, so its denominator is empty. This is a
        data-collection gap, not real performance (see the data-quality banner at the top of the page).
      </p>
      {anyCancellations && (
        <p className="mt-1 text-xs text-muted-foreground">
          Revenue is net of cancellations; gross and the cancelled amount are shown wherever a source had a cancellation this month.
        </p>
      )}
    </Section>
  )
}

export default function KPIPage() {
  const router = useRouter()

  const [dateFrom,        setDateFrom]        = useState(firstOfMonthStr())
  const [dateTo,          setDateTo]          = useState(todayStr())
  const [filterSrc,       setFilterSrc]       = useState('')

  const [leads,        setLeads]        = useState<LeadRow[]>([])
  const [payments,     setPayments]     = useState<PaymentRow[]>([])
  const [coPayments,   setCoPayments]   = useState<PaymentRow[]>([])
  // Revenue events = initial contracts + won change orders, each dated by when it was actually
  // won (event_date) rather than by the parent lead's created_at. Source of truth for all
  // revenue figures below — replaces the old changeOrders-only state.
  const [revenueEvents, setRevenueEvents] = useState<{ lead_id: string; source_id: string | null; event_type: 'initial_contract' | 'change_order'; event_date: string; amount: number; record_type: 'change_order' | 'repeat_job' | null; contact_id: string | null; is_repeat_business: boolean }[]>([])
  // Name lookup for whatever lead each revenue_event belongs to -- covers leads outside the
  // current date range too (e.g. an old repeat-client lead whose change order was just won),
  // so the "Additional Job Revenue" breakdown below can always show a real client name.
  const [revLeadNames,  setRevLeadNames]  = useState<Record<string, string>>({})
  // Lead-level signed value = initial_contract_value + every won change order
  // (KPI Definitions rule 3: initial alone is never "contract value"). Keyed by
  // lead id, lifetime — a CO signed in a later month still counts on its lead's row.
  const [signedByLead, setSignedByLead] = useState<Record<string, number>>({})
  // Cash actually received in the period, per source — from v_cash_events (refunds
  // already netted). Used to show a PAID-SOURCE-ONLY "Collected" figure; the
  // all-source payments/coPayments totals include organic + repeat-client cash.
  const [cashEvents,   setCashEvents]   = useState<{ source_id: string | null; amount: number; event_date: string }[]>([])
  const [spend,        setSpend]        = useState<SpendRow[]>([])
  const [sources,      setSources]      = useState<LeadSource[]>([])
  // All-time (not date-range-scoped) set of source_ids that have EVER had marketing spend logged.
  // This is what separates "Marketing Performance" (paid channels, where CAC/ROI mean something)
  // from organic/repeat revenue (referrals, repeat clients — see the Organic & Repeat Revenue tab),
  // which has no spend to divide by and shouldn't be judged by the same yardstick.
  const [paidSourceIds, setPaidSourceIds] = useState<Set<string>>(new Set())
  const [trend,        setTrend]        = useState<{ label: string; contracted: number; actual: number; leads: number }[]>([])
  const [loading,      setLoading]      = useState(true)

  const [showSpendForm,    setShowSpendForm]    = useState(false)
  const [spendForm,        setSpendForm]        = useState({ source_id: '', amount: '', period_start: todayStr(), period_end: todayStr() })
  const [savingSpend,      setSavingSpend]      = useState(false)
  const [deletingSpendId,  setDeletingSpendId]  = useState<string | null>(null)
  const [expandedSpendSrc, setExpandedSpendSrc] = useState<Record<string, boolean>>({})

  const rangeStart = useMemo(() => new Date(dateFrom + 'T00:00:00').toISOString(), [dateFrom])
  const rangeEnd   = useMemo(() => new Date(dateTo   + 'T23:59:59').toISOString(), [dateTo])

  const periodLabel = useMemo(() => {
    if (dateFrom === dateTo) return fmtDate(dateFrom)
    return `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`
  }, [dateFrom, dateTo])

  function setThisWeek() {
    const now = new Date()
    const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    setDateFrom(mon.toISOString().split('T')[0])
    setDateTo(sun.toISOString().split('T')[0])
  }
  function setThisMonth() {
    setDateFrom(firstOfMonthStr())
    setDateTo(todayStr())
  }
  function setLastMonth() {
    const d = new Date()
    d.setDate(1); d.setMonth(d.getMonth() - 1)
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    setDateFrom(d.toISOString().split('T')[0])
    setDateTo(last.toISOString().split('T')[0])
  }

  useEffect(() => { fetchAll() }, [rangeStart, rangeEnd])
  useEffect(() => {
    supabase.from('marketing_spend').select('source_id').then(({ data }) => {
      setPaidSourceIds(new Set((data || []).map((r: any) => r.source_id).filter(Boolean)))
    })
  }, [])

  async function fetchAll() {
    setLoading(true)
    const spendStart = dateFrom
    const spendEnd   = dateTo

    const [leadsRes, paymentsRes, coPaymentsRes, spendRes, srcRes, revEventsRes, cashRes] = await Promise.all([
      supabase.from('leads')
        .select('id,first_name,last_name,lead_name,phone,status,contact_type,lsa_status,initial_contract_value,created_at,source_id,metadata,lead_sources(name)')
        .gte('created_at', rangeStart).lte('created_at', rangeEnd).eq('archived', false),
      supabase.from('payments').select('amount,paid_at,lead_id')
        .gte('paid_at', rangeStart).lte('paid_at', rangeEnd),
      supabase.from('change_order_payments').select('amount,paid_at,lead_id')
        .gte('paid_at', rangeStart).lte('paid_at', rangeEnd),
      supabase.from('marketing_spend')
        .select('id,period_start,period_end,source_name,source_id,amount_spent,lead_sources(name)')
        .gte('period_start', spendStart).lte('period_start', spendEnd),
      supabase.from('lead_sources').select('id,name').order('name'),
      // Revenue events dated by when they were actually won, not by the parent lead's created_at.
      // This is what lets a change order won this period on an old repeat-client lead (e.g. JCC
      // Bayone, lead from 2024) show up here instead of being buried under the lead's intake date.
      supabase.from('revenue_events').select('lead_id,source_id,event_type,event_date,amount,record_type,contact_id,is_repeat_business')
        .gte('event_date', dateFrom).lte('event_date', dateTo),
      // Cash received in the period, carrying source_id so "Collected" can be
      // scoped to paid channels (refunds are already netted in v_cash_events).
      supabase.from('v_cash_events').select('source_id,amount,event_date')
        .gte('event_date', dateFrom).lte('event_date', dateTo),
    ])

    const endDate         = new Date(dateTo + 'T00:00:00')
    const trendStartDate  = new Date(endDate.getFullYear(), endDate.getMonth() - 5, 1)
    const trendStart      = trendStartDate.toISOString()
    const trendStartStr   = trendStartDate.toISOString().split('T')[0]
    // Lead counts still bucket by created_at (a lead only "arrives" once). Revenue ("contracted")
    // and cash collected ("actual") now bucket by their own event/payment date instead, via
    // revenue_events and change_order_payments — so a change order won in, say, month 5 of this
    // trend on an old repeat-client lead shows up in month 5, not wherever the lead first landed.
    const [tLeads, tRevEvents, tPay, tCoPay] = await Promise.all([
      supabase.from('leads').select('created_at').gte('created_at', trendStart).lte('created_at', rangeEnd).eq('archived', false),
      supabase.from('revenue_events').select('event_type,event_date,amount').gte('event_date', trendStartStr).lte('event_date', dateTo),
      supabase.from('payments').select('amount,paid_at').gte('paid_at', trendStart).lte('paid_at', rangeEnd),
      supabase.from('change_order_payments').select('amount,paid_at').gte('paid_at', trendStart).lte('paid_at', rangeEnd),
    ])
    const tMap: Record<string, { contracted: number; actual: number; leads: number }> = {}
    for (let i = 5; i >= 0; i--) {
      const d = new Date(endDate.getFullYear(), endDate.getMonth() - i, 1)
      tMap[`${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`] = { contracted: 0, actual: 0, leads: 0 }
    }
    ;(tLeads.data || []).forEach((l: any) => {
      const d = new Date(l.created_at)
      const k = `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
      if (tMap[k]) tMap[k].leads++
    })
    ;(tRevEvents.data || []).forEach((e: any) => {
      const d = new Date(e.event_date + 'T00:00:00')
      const k = `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
      if (tMap[k]) tMap[k].contracted += Number(e.amount || 0)
    })
    ;[...(tPay.data || []), ...(tCoPay.data || [])].forEach((p: any) => {
      const d = new Date(p.paid_at)
      const k = `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
      if (tMap[k]) tMap[k].actual += Number(p.amount || 0)
    })
    setTrend(Object.entries(tMap).map(([label, v]) => ({ label, ...v })))

    setLeads((leadsRes.data as any[]) || [])
    setPayments(paymentsRes.data || [])
    setCoPayments(coPaymentsRes.data || [])
    setRevenueEvents((revEventsRes.data as any[]) || [])
    setCashEvents((cashRes.data as any[]) || [])
    setSpend((spendRes.data as any[]) || [])
    setSources(srcRes.data || [])
    setLoading(false)

    // Fill in client names for every revenue_event's lead -- a change order won this period on an
    // old repeat-client lead won't be in the leads list above (that list is scoped to leads created
    // in this date range), so without this, "Additional Job Revenue" would show a dollar amount
    // with no name to trace it back to.
    const revLeadIds = Array.from(new Set(((revEventsRes.data as any[]) || []).map(e => e.lead_id).filter(Boolean)))
    if (revLeadIds.length > 0) {
      const { data: nameRows } = await supabase.from('leads').select('id,lead_name,first_name,last_name').in('id', revLeadIds)
      const nameMap: Record<string, string> = {}
      ;(nameRows || []).forEach((l: any) => {
        nameMap[l.id] = l.lead_name || `${l.first_name || ''} ${l.last_name || ''}`.trim() || 'Unknown client'
      })
      setRevLeadNames(nameMap)
    } else {
      setRevLeadNames({})
    }

    // Rule 3 (KPI Definitions): the lead-level Contract Value column must be
    // initial + change orders, not initial alone. Sum non-cancellation
    // revenue_events per shown lead, lifetime (not date-scoped).
    const shownLeadIds = ((leadsRes.data as any[]) || []).map(l => l.id)
    if (shownLeadIds.length > 0) {
      const { data: reRows } = await supabase
        .from('revenue_events')
        .select('lead_id,amount,event_type')
        .in('lead_id', shownLeadIds)
      const signed: Record<string, number> = {}
      ;(reRows || []).forEach((e: any) => {
        if (e.event_type === 'cancellation') return
        signed[e.lead_id] = (signed[e.lead_id] || 0) + Number(e.amount || 0)
      })
      setSignedByLead(signed)
    } else {
      setSignedByLead({})
    }
  }

  const filtered = useMemo(() => leads.filter(l => !filterSrc || l.source_id === filterSrc), [leads, filterSrc])

  const kpi = useMemo(() => {
    const total         = filtered.length
    const inPerson      = filtered.filter(l => l.contact_type === 'in_person').length
    const phoneQ        = filtered.filter(l => l.contact_type === 'phone_quote').length
    const totalAppts    = inPerson + phoneQ
    const won           = filtered.filter(l => WON_STAGES.includes(l.status))
    const wonCount      = won.length

    // Revenue is bucketed by revenue_events.event_date (when it was actually won), not by the
    // parent lead's created_at — so a change order won this period on an old repeat-client lead
    // shows up here instead of being buried under the lead's original intake date.
    // This page is Marketing Performance -- paid channels only. No marketing budget was spent to
    // win back a repeat client or an organic/referral lead, so that revenue doesn't belong in these
    // figures; it's tracked on its own in the Organic & Repeat tab instead.
    const revInRange = (filterSrc ? revenueEvents.filter(e => e.source_id === filterSrc) : revenueEvents)
      .filter(e => paidSourceIds.has(e.source_id || '') && !e.is_repeat_business)
    // Two buckets, full stop:
    // - Initial Job Revenue: the very first job a client ever won with us.
    // - Additional Job Revenue: everything after that — a change order on an existing job, OR the
    //   client coming back later for a separate job (even a different address), whichever happens.
    //   Auto-counted in the month it was actually won (event_date), not the month the original
    //   lead came in.
    const initialJobRevenue = revInRange
      .filter(e => e.event_type === 'initial_contract' && !e.is_repeat_business)
      .reduce((s, e) => s + Number(e.amount || 0), 0)
    const additionalJobRevenue = revInRange
      .filter(e => e.event_type === 'change_order' || (e.event_type === 'initial_contract' && e.is_repeat_business))
      .reduce((s, e) => s + Number(e.amount || 0), 0)
    // One flat list, every dollar in Total Revenue, newest first. This replaces having to split
    // your attention between two subtotals and a separate nested box -- one place, one line per
    // dollar, tagged New Job vs Additional so a change order on a not-yet-won lead (e.g. Renato
    // Stewart, still "Estimate Sent") is never invisible.
    const revenueDetail = revInRange
      .map(e => ({
        name: revLeadNames[e.lead_id] || 'Unknown client',
        isNew: e.event_type === 'initial_contract' && !e.is_repeat_business,
        kind: e.event_type === 'change_order' ? 'Change order' : e.is_repeat_business ? 'Repeat job' : 'New Job',
        amount: Number(e.amount || 0),
        date: e.event_date,
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
    const totalRev = initialJobRevenue + additionalJobRevenue
    // Kept as aliases so the per-source table (which just needs each source's grand total,
    // regardless of bucket) and older references don't need to change.
    const contracted = initialJobRevenue
    const coVolume    = additionalJobRevenue

    const actual        = payments.reduce((s, p) => s + Number(p.amount || 0), 0) + coPayments.reduce((s, p) => s + Number(p.amount || 0), 0)
    // Paid-channel cash only: this page is Marketing Performance, so organic /
    // referral / repeat-client cash (tracked on the Organic & Repeat page) must
    // not appear. v_cash_events carries source_id and already nets refunds.
    const paidCollected = cashEvents
      .filter(c => paidSourceIds.has(c.source_id || '') && (!filterSrc || c.source_id === filterSrc))
      .reduce((s, c) => s + Number(c.amount || 0), 0)
    const lsaCharged    = filtered.filter(l => l.lsa_status === 'charged' || l.lsa_status === 'submitted').length
    const lsaCredited   = filtered.filter(l => l.lsa_status === 'credited').length
    const lsaNotCharged = filtered.filter(l => l.lsa_status === 'not_charged' || !l.lsa_status).length
    const lsaInReview   = filtered.filter(l => l.lsa_status === 'in_review').length
    const totalSpend    = spend.filter(s => !filterSrc || s.source_id === filterSrc).reduce((s, r) => s + Number(r.amount_spent || 0), 0)
    // KPI Definitions rule 1: paid spend only ever divides a paid-sourced count.
    // The denominators here are the appts / clients from channels that actually had
    // ad spend behind them — never the all-source totals above.
    const paidInPerson  = filtered.filter(l => l.contact_type === 'in_person' && paidSourceIds.has(l.source_id || '')).length
    const paidWonCount   = filtered.filter(l => WON_STAGES.includes(l.status) && paidSourceIds.has(l.source_id || '')).length
    const apptAcqCost   = paidInPerson > 0 && totalSpend > 0 ? totalSpend / paidInPerson : 0
    const projAcqCost   = paidWonCount > 0 && totalSpend > 0 ? totalSpend / paidWonCount : 0
    const bySrc: Record<string, { id: string; name: string; total: number; inPerson: number; phoneQ: number; won: number; contracted: number; lsaCharged: number }> = {}
    filtered.forEach(l => {
      const key  = l.source_id || 'unknown'
      const name = (l.lead_sources as any)?.name || 'Unknown'
      if (!bySrc[key]) bySrc[key] = { id: key, name, total: 0, inPerson: 0, phoneQ: 0, won: 0, contracted: 0, lsaCharged: 0 }
      bySrc[key].total++
      if (l.contact_type === 'in_person')   bySrc[key].inPerson++
      if (l.contact_type === 'phone_quote') bySrc[key].phoneQ++
      if (WON_STAGES.includes(l.status)) bySrc[key].won++
      if (l.lsa_status === 'charged' || l.lsa_status === 'submitted') bySrc[key].lsaCharged++
    })
    // Revenue per source comes from revenue_events, not the leads-in-range list above — a source
    // with no new leads this period but a change order won this period on an older lead still
    // gets a row with its revenue, instead of silently disappearing from the table.
    revInRange.forEach(e => {
      const key = e.source_id || 'unknown'
      if (!bySrc[key]) {
        const name = sources.find(s => s.id === e.source_id)?.name || 'Unknown'
        bySrc[key] = { id: key, name, total: 0, inPerson: 0, phoneQ: 0, won: 0, contracted: 0, lsaCharged: 0 }
      }
      bySrc[key].contracted += Number(e.amount || 0)
    })
    return { total, inPerson, phoneQ, totalAppts, wonCount, contracted, coVolume, initialJobRevenue, additionalJobRevenue, revenueDetail, totalRev, actual, paidCollected, lsaCharged, lsaCredited, lsaNotCharged, lsaInReview, totalSpend, apptAcqCost, projAcqCost, bySrc }
  }, [filtered, payments, coPayments, spend, revenueEvents, cashEvents, sources, filterSrc, revLeadNames, paidSourceIds])

  const spendBySrc = useMemo(() => {
    const map: Record<string, any> = {}
    spend.forEach(row => {
      const key  = row.source_id || row.source_name || 'unknown'
      const name = (row.lead_sources as any)?.name || row.source_name || 'Unknown'
      if (!map[key]) map[key] = { id: row.id, name, amount: 0, source_id: row.source_id }
      map[key].amount += Number(row.amount_spent || 0)
    })
    return Object.values(map).sort((a: any, b: any) => b.amount - a.amount)
  }, [spend])

  const srcList = Object.values(kpi.bySrc).sort((a, b) => b.total - a.total)
  // Marketing Performance (this page) only makes sense for channels with actual spend behind them —
  // CAC/ROI comparisons are meaningless for referrals or repeat clients, which cost nothing to
  // reacquire. Those live in their own tab now (KPI Views → Organic & Repeat Revenue).
  const paidSrcList = srcList.filter(s => paidSourceIds.has(s.id))
  // Totals for the paid-only table below — computed from paidSrcList itself so the bottom "Total"
  // row always matches the sum of the visible rows above it (not the whole business, which would
  // silently include organic/repeat revenue again and reintroduce the same mismatch bug as before).
  const paidTotals = paidSrcList.reduce((acc, s) => ({
    total: acc.total + s.total, lsaCharged: acc.lsaCharged + s.lsaCharged,
    inPerson: acc.inPerson + s.inPerson, phoneQ: acc.phoneQ + s.phoneQ,
    won: acc.won + s.won,
  }), { total: 0, lsaCharged: 0, inPerson: 0, phoneQ: 0, won: 0 })

  const insightsData: InsightData = useMemo(() => ({
    totalLeads: paidTotals.total, totalAppts: paidTotals.inPerson, totalPhoneQ: paidTotals.phoneQ,
    // Revenue = initial contracts + change orders (paid, non-repeat). Change orders
    // are always revenue — never feed the insights engine the initial-only figure.
    totalWon: paidTotals.won, totalContracted: kpi.totalRev,
    totalSpend: kpi.totalSpend, period: periodLabel, viewMode: 'weekly',
    sources: paidSrcList.map(src => {
      const srcSpendRow = spendBySrc.find(s => s.source_id === src.id)
      // src.contracted from kpi.bySrc already sums initial + change-order events.
      return { name: src.name, leads: src.total, inPerson: src.inPerson, won: src.won, contracted: src.contracted, spend: srcSpendRow?.amount || 0 }
    }),
    trend: trend.map(t => ({ label: t.label, contracted: t.contracted, leads: t.leads })),
  }), [kpi, periodLabel, paidSrcList, paidTotals, spendBySrc, trend])

  const spendGrouped = useMemo(() => {
    const grouped: Record<string, any> = {}
    const filteredSpend = spend.filter(row => !filterSrc || row.source_id === filterSrc)
    let colorIndex = 0
    filteredSpend.forEach(row => {
      const key  = row.source_id || row.source_name || 'unknown'
      const name = (row.lead_sources as any)?.name || row.source_name || 'Unknown'
      if (!grouped[key]) {
        grouped[key] = { source_id: row.source_id, name, color: SRC_COLORS[colorIndex++ % SRC_COLORS.length], total: 0, entries: [], lsaCharged: kpi.bySrc[row.source_id || '']?.lsaCharged ?? 0 }
      }
      grouped[key].total += Number(row.amount_spent || 0)
      grouped[key].entries.push(row)
    })
    return Object.values(grouped).sort((a: any, b: any) => b.total - a.total)
  }, [spend, filterSrc, kpi.bySrc])

  const grandTotalSpend = spendGrouped.reduce((s: number, g: any) => s + g.total, 0)

  async function handleAddSpend() {
    if (!spendForm.amount || Number(spendForm.amount) <= 0) return
    setSavingSpend(true)
    const src = sources.find(s => s.id === spendForm.source_id)
    await supabase.from('marketing_spend').insert({
      period_start: spendForm.period_start, period_end: spendForm.period_end,
      source_id: spendForm.source_id || null, source_name: src?.name || null,
      amount_spent: Number(spendForm.amount),
    })
    setSpendForm({ source_id: '', amount: '', period_start: todayStr(), period_end: todayStr() })
    setShowSpendForm(false); setSavingSpend(false); fetchAll()
  }

  async function handleDeleteSpend(id: string) {
    setDeletingSpendId(id)
    await supabase.from('marketing_spend').delete().eq('id', id)
    setDeletingSpendId(null); fetchAll()
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">

      {/* Header */}
      <KpiTabs />

      {/* Data-quality warning — BROKEN metrics from v_kpi_health, so nobody acts on a
          number the underlying data can't support yet. */}
      <KpiHealthStrip />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">KPI Dashboard</h1>
          <p className="text-sm text-muted-foreground">Elite Work Home Improvement</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground">
            <Printer className="h-3.5 w-3.5" /> Export PDF
          </button>

          <div className="flex items-center gap-2 flex-wrap rounded-lg border border-border px-3 py-1.5">
            <span className="text-xs text-muted-foreground">From</span>
            <input type="date" value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); if (e.target.value > dateTo) setDateTo(e.target.value) }}
              className="text-xs rounded border border-border bg-background px-2 py-1 focus:outline-none" />
            <span className="text-xs text-muted-foreground">To</span>
            <input type="date" value={dateTo} min={dateFrom}
              onChange={e => setDateTo(e.target.value)}
              className="text-xs rounded border border-border bg-background px-2 py-1 focus:outline-none" />
            <div className="flex gap-1">
              <button onClick={setThisWeek}  className="text-xs px-2 py-1 rounded border border-border hover:bg-muted text-muted-foreground whitespace-nowrap">This week</button>
              <button onClick={setThisMonth} className="text-xs px-2 py-1 rounded border border-border hover:bg-muted text-muted-foreground whitespace-nowrap">This month</button>
              <button onClick={setLastMonth} className="text-xs px-2 py-1 rounded border border-border hover:bg-muted text-muted-foreground whitespace-nowrap">Last month</button>
            </div>
          </div>
        </div>
      </div>

      {/* Source filter */}
      <div className="flex gap-3 items-center flex-wrap">
        <select value={filterSrc} onChange={e => setFilterSrc(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none">
          <option value="">All Sources</option>
          {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {filterSrc && (
          <button onClick={() => setFilterSrc('')}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground">
            <X className="h-3 w-3" /> Clear
          </button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} leads · {periodLabel}</span>
      </div>
      {filterSrc && filtered.length === 0 && kpi.totalRev > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          No new leads with this source in {periodLabel}, but {fmt$(kpi.totalRev)} in revenue shows because a job tied to
          an older lead with this source was won or had a change order signed during this period. Leads count by when
          they came in; revenue counts by when it was actually won — they're different lenses on purpose.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading...
        </div>
      ) : (
        <div className="space-y-5">

          {/* 1. MARKETING SPEND */}
          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 overflow-hidden">
            <div className="px-6 py-4 border-b border-primary/20 flex items-center justify-between">
              <div>
                <p className="text-base font-bold text-primary">Marketing Spend</p>
                <p className="text-xs text-muted-foreground mt-0.5">{periodLabel} · {filterSrc ? spendGrouped.find((g: any) => g.source_id === filterSrc)?.name || 'Filtered source' : 'All sources'}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-3xl font-bold">{fmt$(kpi.totalSpend)}</p>
                  <p className="text-xs text-muted-foreground">total spent</p>
                </div>
                <button onClick={() => setShowSpendForm(v => !v)}
                  className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
                  <Plus className="h-4 w-4" /> Log Spend
                </button>
              </div>
            </div>
            {showSpendForm && (
              <div className="px-6 py-4 border-b border-primary/20 bg-primary/5">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-3">Add Spend</p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div><label className="text-xs text-muted-foreground block mb-1">From</label>
                    <input type="date" value={spendForm.period_start} onChange={e => setSpendForm({...spendForm, period_start: e.target.value})}
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none" /></div>
                  <div><label className="text-xs text-muted-foreground block mb-1">To</label>
                    <input type="date" value={spendForm.period_end} min={spendForm.period_start} onChange={e => setSpendForm({...spendForm, period_end: e.target.value})}
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none" /></div>
                  <div><label className="text-xs text-muted-foreground block mb-1">Source</label>
                    <select value={spendForm.source_id} onChange={e => setSpendForm({...spendForm, source_id: e.target.value})}
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none">
                      <option value="">— Select —</option>
                      {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select></div>
                  <div><label className="text-xs text-muted-foreground block mb-1">Amount ($)</label>
                    <input type="number" placeholder="0.00" value={spendForm.amount} onChange={e => setSpendForm({...spendForm, amount: e.target.value})}
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none" /></div>
                  <div className="flex items-end gap-2">
                    <button onClick={handleAddSpend} disabled={savingSpend || !spendForm.amount || !spendForm.period_start}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40">
                      <Save className="h-3.5 w-3.5" /> {savingSpend ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={() => setShowSpendForm(false)} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">Cancel</button>
                  </div>
                </div>
              </div>
            )}
            <div className="px-6 py-4">
              {spendGrouped.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">No spend logged for this period.</p>
              ) : (
                <div className="rounded-lg border border-border/60 overflow-hidden divide-y divide-border/60 bg-background">
                  {(spendGrouped as any[]).map((group: any) => {
                    const isOpen     = !!expandedSpendSrc[group.source_id || group.name]
                    const cpl        = group.lsaCharged > 0 ? group.total / group.lsaCharged : 0
                    const notCharged = (kpi.bySrc[group.source_id || '']?.total ?? 0) - group.lsaCharged
                    return (
                      <div key={group.source_id || group.name}>
                        <button onClick={() => setExpandedSpendSrc(prev => ({ ...prev, [group.source_id || group.name]: !prev[group.source_id || group.name] }))}
                          className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 text-left">
                          <span className="text-muted-foreground shrink-0">
                            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </span>
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                          <span className="text-sm font-semibold flex-1 truncate">{group.name}</span>
                          <div className="hidden sm:flex items-center gap-2 mr-4">
                            {group.lsaCharged > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">{group.lsaCharged} charged</span>}
                            {notCharged > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{notCharged} not charged</span>}
                          </div>
                          <div className="text-right shrink-0 mr-5 hidden sm:block">
                            <p className="text-xs text-muted-foreground">Cost / charged lead</p>
                            <p className="text-sm font-semibold">{cpl > 0 ? fmt$(cpl) : '—'}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-muted-foreground">Spent</p>
                            <p className="text-sm font-bold">{fmt$(group.total)}</p>
                          </div>
                        </button>
                        {isOpen && (
                          <div className="bg-muted/10 border-t border-border/40 divide-y divide-border/30">
                            {group.entries.slice().sort((a: any, b: any) => a.period_start.localeCompare(b.period_start)).map((entry: any) => {
                              const isDeleting = deletingSpendId === entry.id
                              const dl = !entry.period_end || entry.period_start === entry.period_end
                                ? fmtDate(entry.period_start)
                                : `${fmtDate(entry.period_start)} – ${fmtDate(entry.period_end)}`
                              return (
                                <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5 pl-12 group/row">
                                  <span className="text-xs text-muted-foreground w-48 shrink-0">{dl}</span>
                                  <span className="text-sm font-semibold flex-1">{fmt$(Number(entry.amount_spent))}</span>
                                  <button onClick={() => handleDeleteSpend(entry.id)} disabled={isDeleting}
                                    className="opacity-0 group-hover/row:opacity-100 text-muted-foreground hover:text-red-500 transition-all disabled:opacity-50">
                                    {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                  </button>
                                </div>
                              )
                            })}
                            <div className="flex items-center gap-3 px-4 py-2 pl-12 bg-muted/20">
                              <span className="text-xs font-semibold text-muted-foreground w-48 shrink-0">Subtotal</span>
                              <span className="text-sm font-bold flex-1">{fmt$(group.total)}</span>
                              <span className="text-xs text-muted-foreground">{group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {spendGrouped.length > 1 && (
                    <div className="flex items-center gap-3 px-4 py-3 bg-muted/30">
                      <span className="w-4 shrink-0" /><span className="w-2.5 shrink-0" />
                      <span className="text-xs font-semibold text-muted-foreground flex-1 uppercase tracking-wide">Grand Total</span>
                      <span className="text-sm font-bold">{fmt$(grandTotalSpend)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 2. KEY METRICS */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-4 py-4">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-2">Total Leads</p>
                <p className="text-3xl font-bold">{kpi.total}</p>
                <p className="text-xs text-muted-foreground mt-1">{periodLabel}</p>
              </div>
              <div className="px-4 pb-3 border-t border-border bg-muted/10 pt-2 space-y-1">
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Charged</span><span className="font-semibold">{kpi.lsaCharged}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Not charged</span><span className="font-semibold">{kpi.lsaNotCharged}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">In review</span><span className="font-semibold">{kpi.lsaInReview}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Credited</span><span className="font-semibold">{kpi.lsaCredited}</span></div>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <ExpandMetric label="Total Appointments" value={kpi.totalAppts}>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">In-person visits</span><span className="font-bold">{kpi.inPerson}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Phone quotes</span><span className="font-bold">{kpi.phoneQ}</span></div>
                </div>
              </ExpandMetric>
            </div>
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <ExpandMetric label="Total revenue" value={fmt$(kpi.totalRev)} color="text-emerald-600">
                <div className="space-y-3">
                  <div className="flex gap-5 text-sm">
                    <span className="text-muted-foreground">New Job <span className="font-bold text-foreground">{fmt$(kpi.initialJobRevenue)}</span></span>
                    <span className="text-muted-foreground">Additional <span className="font-bold text-purple-600">{fmt$(kpi.additionalJobRevenue)}</span></span>
                  </div>
                  {kpi.revenueDetail.length > 0 && (
                    // This card sits in a narrow 1/6-width grid column, so the client name gets its
                    // own full-width line instead of squeezing into a row next to the amount --
                    // otherwise the name truncates to nothing and there's no way to tell which job
                    // a dollar amount belongs to.
                    <div className="max-h-72 overflow-y-auto space-y-2">
                      {kpi.revenueDetail.map((d, i) => (
                        <div key={i} className="text-xs py-1 border-b border-border/30 last:border-0">
                          <div className="font-semibold">{d.name}</div>
                          <div className="flex items-center justify-between mt-0.5">
                            <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${d.isNew ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'}`}>{d.kind}</span>
                            <span className="font-semibold text-foreground">{fmt$(d.amount)}</span>
                          </div>
                          <div className="text-muted-foreground text-[11px] mt-0.5">{fmtDate(d.date)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-between text-sm border-t border-border pt-2"><span className="text-muted-foreground">Collected</span><span className="font-bold text-emerald-600">{fmt$(kpi.paidCollected)}</span></div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Signed and collected measure different things — jobs are paid over the months after signing, so these will not match.
                  </p>
                </div>
              </ExpandMetric>
            </div>
            <MetricCard label="Appt Acquisition Cost"
              value={kpi.apptAcqCost > 0 ? fmt$(kpi.apptAcqCost) : '—'}
              sub={kpi.totalSpend > 0 ? 'spend ÷ paid-channel appts' : 'log spend to calculate'} />
            <MetricCard label="Marketing Proj. Acq. Cost"
              value={kpi.projAcqCost > 0 ? fmt$(kpi.projAcqCost) : '—'}
              sub={kpi.totalSpend > 0 ? 'spend ÷ paid-channel clients won' : 'log spend to calculate'} />
            <MetricCard label="Sales Closing Ratio"
              value={closeRatePct(kpi.wonCount, kpi.totalAppts)}
              sub={`${kpi.wonCount} won / ${kpi.totalAppts} appts`}
              color={kpi.wonCount > 0 && kpi.totalAppts > 0 && kpi.wonCount / kpi.totalAppts >= 0.3 ? 'text-emerald-600' : 'text-foreground'} />
          </div>

          {/* 2b. CANCELLATIONS — revenue signed and then given back, by source, rep and stage-at-death */}
          <CancellationPanel from={dateFrom} to={dateTo} />

          {/* 3. YTD BLOCK — paid channels only, straight from v_ytd_kpi_by_source
              (is_paid_channel rows summed). Ad spend is only ever divided into the
              leads / appts / jobs / cash the ads produced. */}
          <YtdPaidBlock />

          {/* 4. MARKETING PERFORMANCE — one row per source per month, straight from
              monthly_source_kpi. That view already excludes cancelled jobs from
              closed_jobs and nets cancellations out of total_revenue, so this is no
              longer a second in-page computation that can disagree with the rest. */}
          <MarketingPerformanceMonthly />

          {/* 4b. MARKETING ROI BY SOURCE — canonical YTD figures straight from
              v_ytd_kpi_by_source: three ROI lenses, cancellation-aware revenue,
              and explicit "n/a" for channels with no ad spend. */}
          <MarketingRoiBySource />

          {/* 5. KPI INSIGHTS */}
          <KpiInsights label="KPI Performance Analysis" data={insightsData} />

          {/* 6. REVENUE TREND */}
          <Section title="Revenue Trend — Last 6 Months" defaultOpen={false}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <div className="flex gap-3 text-xs text-muted-foreground mb-3">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#E07B3A]" /> Contracted</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#378ADD]" /> Collected</span>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={trend} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + (v/1000).toFixed(0) + 'k'} />
                    <Tooltip formatter={(v: number) => fmt$(v)} />
                    <Bar dataKey="contracted" fill="#E07B3A" radius={[3,3,0,0]} name="Contracted" />
                    <Bar dataKey="actual"     fill="#378ADD" radius={[3,3,0,0]} name="Collected" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Lead count trend</p>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={trend}>
                    <Line type="monotone" dataKey="leads" stroke="#378ADD" strokeWidth={2} dot={{ r: 3 }} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: number) => [v, 'Leads']} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Section>

          {/* 7. LEADS THIS PERIOD */}
          <Section title="Leads This Period" badge={`${filtered.length} leads`} defaultOpen={false}>
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No leads for this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {['Name','Phone','Source','Salesperson','Contact Type','LSA Status','Stage','Job Closed','Contract Value','Date'].map(h => (
                        <th key={h} className="text-left text-xs text-muted-foreground font-semibold pb-2 pr-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((lead, i) => {
                      // lead_name (the full name captured at intake) takes priority -- a lot of
                      // older leads never got last_name parsed out of it, so leading with the
                      // first/last split was silently truncating otherwise-complete names.
                      const name        = lead.lead_name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || '—'
                      const source      = (lead.lead_sources as any)?.name || '—'
                      const salesperson = lead.metadata?.salesperson || '—'
                      const contactType = lead.contact_type === 'in_person' ? '🏠 In-Person' : lead.contact_type === 'phone_quote' ? '📞 Phone' : '—'
                      const lsaStatus   = lead.lsa_status ? lead.lsa_status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : '—'
                      const isWon       = WON_STAGES.includes(lead.status)
                      const stageColor  = isWon ? 'text-emerald-600 font-semibold' : lead.status === 'lost' ? 'text-red-500' : 'text-muted-foreground'
                      const stageLabel  = lead.status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
                      const date        = new Date(lead.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
                      const jobClosed   = isWon ? (lead.metadata?.job_type || '—') : '—'
                      // Rule 3: signed value = initial + change orders. Fall back to
                      // initial_contract_value only when the lead has no revenue_events yet.
                      const initialVal  = Number(lead.initial_contract_value) || 0
                      const signedVal   = signedByLead[lead.id] ?? initialVal
                      const coDelta     = (signedByLead[lead.id] ?? initialVal) - initialVal
                      return (
                        <tr key={lead.id} className={`border-b border-border/40 hover:bg-muted/20 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                          <td className="py-2.5 pr-3 font-semibold whitespace-nowrap">{name}</td>
                          <td className="py-2.5 pr-3 text-muted-foreground text-xs">{lead.phone || '—'}</td>
                          <td className="py-2.5 pr-3"><span className="text-xs px-2 py-0.5 rounded-full bg-muted font-medium">{source}</span></td>
                          <td className="py-2.5 pr-3 text-muted-foreground">{salesperson}</td>
                          <td className="py-2.5 pr-3 text-muted-foreground text-xs">{contactType}</td>
                          <td className="py-2.5 pr-3 text-muted-foreground text-xs">{lsaStatus}</td>
                          <td className={`py-2.5 pr-3 text-xs ${stageColor}`}>{stageLabel}</td>
                          <td className="py-2.5 pr-3 text-xs">{isWon ? <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{jobClosed}</span> : <span className="text-muted-foreground">—</span>}</td>
                          <td className="py-2.5 pr-3 font-semibold text-emerald-600 whitespace-nowrap">
                            {signedVal > 0 ? fmt$(signedVal) : '—'}
                            {coDelta > 0.005 && (
                              <span className="block text-[11px] font-normal text-muted-foreground">
                                incl. {fmt$(coDelta)} change orders
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 text-muted-foreground text-xs">{date}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  )
}
