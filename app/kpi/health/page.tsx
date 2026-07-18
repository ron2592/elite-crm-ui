'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  Printer, Loader2, AlertTriangle, Clock, Wallet, Hammer, Target, ChevronDown, ChevronUp,
} from 'lucide-react'
import LeadDetailDialog from '@/components/leads/LeadDetailDialog'
import KpiTabs from '@/components/kpi/KpiTabs'
import { Lead } from '@/types'

const WON_STAGES   = ['closed_won', 'won', 'completed', 'completed_with_balance']
const OPEN_STAGES  = ['new', 'contacted', 'appointment_set', 'estimate_sent']
const STAGE_LABELS: Record<string, string> = {
  new: 'New', contacted: 'Qualified', appointment_set: 'Appointment Set', estimate_sent: 'Estimate Sent',
}
// Same categorization the Production tracker uses, kept in sync so both pages agree on what
// "pending" / "active" / "done" mean for a job that's already been won.
const CANCELLED_STAGES = ['Cancelled Before Start', 'Cancelled Mid-Job']
const COMPLETED_STAGES = ['Completed', 'Completed with Balance']
const isPendingStage = (s: string | null) => !!s && s.startsWith('Pending')
const isActiveStage  = (s: string | null) => !!s && !isPendingStage(s) && !COMPLETED_STAGES.includes(s) && !CANCELLED_STAGES.includes(s)

interface OpenLead {
  id: string; lead_name: string | null; first_name: string | null; last_name: string | null
  phone: string | null; status: string; estimated_amount: number | null; created_at: string
  lead_sources: { name: string } | null
}
interface WonLead {
  id: string; lead_name: string | null; initial_contract_value: number | null
  production_stage: string | null; created_at: string; closed_at: string | null
  metadata: { job_type?: string } | null
}
interface PeriodLead {
  id: string; lead_name: string | null; first_name: string | null; last_name: string | null
  phone: string | null; status: string; created_at: string
  lead_sources: { name: string } | null
  metadata: { reason_lost?: string } | null
}

function fmt$(n: number) {
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function todayStr() { return new Date().toISOString().split('T')[0] }
function firstOfMonthStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function daysAgo(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}
function leadName(l: { lead_name?: string | null; first_name?: string | null; last_name?: string | null }) {
  return l.lead_name || `${l.first_name || ''} ${l.last_name || ''}`.trim() || 'Unnamed'
}

function Section({ title, icon, badge, children, defaultOpen = true }: {
  title: string; icon: React.ReactNode; badge?: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-muted/20 hover:bg-muted/40 transition-colors">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-bold">{title}</span>
          {badge && <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">{badge}</span>}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  )
}

export default function CompanyHealthPage() {
  const router = useRouter()

  const [dateFrom, setDateFrom] = useState(firstOfMonthStr())
  const [dateTo,   setDateTo]   = useState(todayStr())
  const [loading,  setLoading]  = useState(true)

  const [periodLeads, setPeriodLeads] = useState<PeriodLead[]>([])
  const [openLeads,   setOpenLeads]   = useState<OpenLead[]>([])
  const [wonLeads,    setWonLeads]    = useState<WonLead[]>([])
  const [coValue,     setCoValue]     = useState(0)
  const [collected,   setCollected]   = useState(0)

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [dialogOpen,   setDialogOpen]   = useState(false)

  function setThisMonth() { setDateFrom(firstOfMonthStr()); setDateTo(todayStr()) }
  function setLastMonth() {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    setDateFrom(d.toISOString().split('T')[0]); setDateTo(last.toISOString().split('T')[0])
  }
  function setYTD() { setDateFrom(`${new Date().getFullYear()}-01-01`); setDateTo(todayStr()) }

  useEffect(() => { fetchPeriod() }, [dateFrom, dateTo])
  useEffect(() => { fetchSnapshot() }, [])

  async function fetchPeriod() {
    setLoading(true)
    const rangeStart = new Date(dateFrom + 'T00:00:00').toISOString()
    const rangeEnd   = new Date(dateTo   + 'T23:59:59').toISOString()
    const { data } = await supabase.from('leads')
      .select('id,lead_name,first_name,last_name,phone,status,created_at,metadata,lead_sources(name)')
      .gte('created_at', rangeStart).lte('created_at', rangeEnd).eq('archived', false)
    setPeriodLeads((data as any[]) || [])
    setLoading(false)
  }

  // Snapshot data (pipeline aging, production backlog, balance due) is always "right now" — it
  // doesn't make sense to bound a backlog or an aging pipeline to a date range, so it's fetched
  // once, separate from the period selector above.
  async function fetchSnapshot() {
    const [openRes, wonRes, coRes, payRes, coPayRes] = await Promise.all([
      supabase.from('leads')
        .select('id,lead_name,first_name,last_name,phone,status,estimated_amount,created_at,lead_sources(name)')
        .in('status', OPEN_STAGES).eq('archived', false),
      supabase.from('leads')
        .select('id,lead_name,initial_contract_value,production_stage,created_at,closed_at,metadata')
        .in('status', WON_STAGES).eq('archived', false),
      supabase.from('change_orders').select('amount').eq('status', 'won').is('deleted_at', null),
      supabase.from('payments').select('amount'),
      supabase.from('change_order_payments').select('amount'),
    ])
    setOpenLeads((openRes.data as any[]) || [])
    setWonLeads((wonRes.data as any[]) || [])
    setCoValue((coRes.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0))
    setCollected(
      (payRes.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0) +
      (coPayRes.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0)
    )
  }

  async function openLead(id: string) {
    const { data } = await supabase.from('leads').select('*').eq('id', id).single()
    if (data) { setSelectedLead(data as Lead); setDialogOpen(true) }
  }

  // ── Company-wide close rate (ALL sources — this is the whole business, not just paid channels,
  // which is what makes this different from the CAC/ROI table on the main KPI Dashboard) ─────────
  const closeRate = useMemo(() => {
    const total = periodLeads.length
    const won   = periodLeads.filter(l => WON_STAGES.includes(l.status)).length
    const lost  = periodLeads.filter(l => l.status === 'lost' || l.status === 'not_qualified').length
    return { total, won, lost, pct: total > 0 ? Math.round((won / total) * 100) : 0 }
  }, [periodLeads])

  // Full detail behind the "Lost / Disqualified" count above -- which leads, and why, sorted
  // newest first so the most recent losses are easiest to review during a SOD/EOD meeting.
  const lostLeads = useMemo(() => {
    return periodLeads
      .filter(l => l.status === 'lost' || l.status === 'not_qualified')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [periodLeads])

  // Won leads sorted newest-first for the Production Status detail list below.
  const wonLeadsSorted = useMemo(() => {
    return [...wonLeads].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [wonLeads])

  // ── Pipeline value in play — quoted/appointment work not yet won or lost ────────────────────────
  const pipelineValue = useMemo(() => openLeads.reduce((s, l) => s + Number(l.estimated_amount || 0), 0), [openLeads])

  // ── Pipeline aging — created_at is the reliable signal here (updated_at gets touched by
  // background syncs/migrations and isn't a trustworthy "still worked on" signal) ─────────────────
  const agingByStage = useMemo(() => {
    const map: Record<string, { stage: string; count: number; avgDays: number; aged14: OpenLead[] }> = {}
    OPEN_STAGES.forEach(s => { map[s] = { stage: s, count: 0, avgDays: 0, aged14: [] } })
    openLeads.forEach(l => {
      const bucket = map[l.status]
      if (!bucket) return
      bucket.count++
      const age = daysAgo(l.created_at)
      bucket.avgDays += age
      if (age >= 14) bucket.aged14.push(l)
    })
    Object.values(map).forEach(b => { b.avgDays = b.count > 0 ? Math.round(b.avgDays / b.count) : 0 })
    return OPEN_STAGES.map(s => map[s]).filter(b => b.count > 0)
  }, [openLeads])

  const allAged = useMemo(() => {
    return agingByStage.flatMap(b => b.aged14).sort((a, b) => daysAgo(b.created_at) - daysAgo(a.created_at))
  }, [agingByStage])

  // ── Production backlog — jobs already won that haven't reached a terminal production stage ─────
  const production = useMemo(() => {
    const pending   = wonLeads.filter(l => isPendingStage(l.production_stage))
    const active    = wonLeads.filter(l => isActiveStage(l.production_stage))
    const completed = wonLeads.filter(l => l.production_stage && COMPLETED_STAGES.includes(l.production_stage))
    const cancelled = wonLeads.filter(l => l.production_stage && CANCELLED_STAGES.includes(l.production_stage))
    const noStage   = wonLeads.filter(l => !l.production_stage)
    const backlog   = [...pending, ...active, ...noStage]
    const backlogValue = backlog.reduce((s, l) => s + Number(l.initial_contract_value || 0), 0)
    return { pending, active, completed, cancelled, noStage, backlog, backlogValue }
  }, [wonLeads])

  // ── Balance due — total signed (initial contracts + won change orders) minus everything actually
  // collected. This is the clearest forward-looking "money owed" number, and it's built entirely
  // from data that's always populated (contract values + payments), unlike closed_at-based metrics.
  const totalContracted = useMemo(() => wonLeads.reduce((s, l) => s + Number(l.initial_contract_value || 0), 0) + coValue, [wonLeads, coValue])
  const balanceDue = Math.max(0, totalContracted - collected)

  // ── Time to close — only meaningful for jobs with a recorded closed_at; most of your historical
  // jobs don't have one yet (see the "Date Won" field on each lead to start filling this in) ──────
  const timeToClose = useMemo(() => {
    const withDates = wonLeads.filter(l => l.closed_at)
    if (withDates.length === 0) return { avgDays: 0, sample: 0 }
    const avg = withDates.reduce((s, l) => s + Math.floor((new Date(l.closed_at!).getTime() - new Date(l.created_at).getTime()) / 86400000), 0) / withDates.length
    return { avgDays: Math.round(avg), sample: withDates.length }
  }, [wonLeads])

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <KpiTabs />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Company Health</h1>
          <p className="text-sm text-muted-foreground">How the business is running — separate from marketing spend/ROI</p>
        </div>
        <button onClick={() => window.print()}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground">
          <Printer className="h-3.5 w-3.5" /> Export PDF
        </button>
        <div className="flex items-center gap-2 flex-wrap rounded-lg border border-border px-3 py-1.5">
          <span className="text-xs text-muted-foreground">From</span>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); if (e.target.value > dateTo) setDateTo(e.target.value) }}
            className="text-xs rounded border border-border bg-background px-2 py-1 focus:outline-none" />
          <span className="text-xs text-muted-foreground">To</span>
          <input type="date" value={dateTo} min={dateFrom} onChange={e => setDateTo(e.target.value)}
            className="text-xs rounded border border-border bg-background px-2 py-1 focus:outline-none" />
          <div className="flex gap-1">
            <button onClick={setThisMonth} className="text-xs px-2 py-1 rounded border border-border hover:bg-muted text-muted-foreground whitespace-nowrap">This month</button>
            <button onClick={setLastMonth} className="text-xs px-2 py-1 rounded border border-border hover:bg-muted text-muted-foreground whitespace-nowrap">Last month</button>
            <button onClick={setYTD}       className="text-xs px-2 py-1 rounded border border-border hover:bg-muted text-muted-foreground whitespace-nowrap">YTD</button>
          </div>
        </div>
      </div>

      {/* SNAPSHOT — always current, not tied to the period picker above */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-2 flex items-center gap-1"><Target className="h-3.5 w-3.5" /> Pipeline in Play</p>
          <p className="text-2xl font-bold">{fmt$(pipelineValue)}</p>
          <p className="text-xs text-muted-foreground mt-1">{openLeads.length} quoted/active leads, right now</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-2 flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> Balance Due</p>
          <p className="text-2xl font-bold text-amber-600">{fmt$(balanceDue)}</p>
          <p className="text-xs text-muted-foreground mt-1">Signed work not yet collected</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-2 flex items-center gap-1"><Hammer className="h-3.5 w-3.5" /> Production Backlog</p>
          <p className="text-2xl font-bold">{production.backlog.length}</p>
          <p className="text-xs text-muted-foreground mt-1">{fmt$(production.backlogValue)} not yet completed</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-2 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Stuck 14+ Days</p>
          <p className={`text-2xl font-bold ${allAged.length > 0 ? 'text-red-500' : ''}`}>{allAged.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Leads sitting untouched in the pipeline</p>
        </div>
      </div>

      {/* COMPANY-WIDE CLOSE RATE — period-scoped, all sources (not just paid) */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <p className="text-sm font-bold">Company-Wide Close Rate</p>
          <span className="text-xs text-muted-foreground">All lead sources — contrast with the paid-only rate on the main KPI Dashboard</span>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div><p className="text-xs text-muted-foreground mb-1">Total Leads</p><p className="text-xl font-bold">{closeRate.total}</p></div>
            <div><p className="text-xs text-muted-foreground mb-1">Won</p><p className="text-xl font-bold text-emerald-600">{closeRate.won}</p></div>
            <div><p className="text-xs text-muted-foreground mb-1">Lost / Disqualified</p><p className="text-xl font-bold text-red-500">{closeRate.lost}</p></div>
            <div><p className="text-xs text-muted-foreground mb-1">Close Rate</p><p className={`text-xl font-bold ${closeRate.pct >= 15 ? 'text-emerald-600' : 'text-amber-500'}`}>{closeRate.total > 0 ? closeRate.pct + '%' : '—'}</p></div>
          </div>
        )}
      </div>

      {/* LOST / DISQUALIFIED DETAIL — the "Lost / Disqualified" count above the fold only tells you
          how many; this is who, and why, so a manager can actually act on it. */}
      <Section title="Lost / Disqualified Leads" icon={<AlertTriangle className="h-4 w-4 text-red-500" />} badge={`${lostLeads.length} leads`} defaultOpen={false}>
        {lostLeads.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No lost or disqualified leads in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Name', 'Phone', 'Source', 'Status', 'Reason Lost', 'Date'].map(h => (
                    <th key={h} className="text-left text-xs text-muted-foreground font-semibold pb-2 pr-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lostLeads.map(l => (
                  <tr key={l.id} className="border-b border-border/40 hover:bg-muted/20 cursor-pointer" onClick={() => openLead(l.id)}>
                    <td className="py-2.5 pr-3 font-semibold whitespace-nowrap">{leadName(l)}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground text-xs">{l.phone || '—'}</td>
                    <td className="py-2.5 pr-3"><span className="text-xs px-2 py-0.5 rounded-full bg-muted font-medium">{(l.lead_sources as any)?.name || '—'}</span></td>
                    <td className="py-2.5 pr-3 text-xs text-red-500 font-medium">{l.status === 'not_qualified' ? 'Not Qualified' : 'Lost'}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground">{l.metadata?.reason_lost || '—'}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* PIPELINE AGING & BOTTLENECKS */}
      <Section title="Pipeline Aging & Bottlenecks" icon={<Clock className="h-4 w-4 text-primary" />} badge={`${allAged.length} stuck 14+ days`}>
        <p className="text-xs text-muted-foreground mb-4">Based on how long a lead has sat in an open stage since it came in. A healthy pipeline keeps this low — a growing pile here means leads are being quoted and then forgotten.</p>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Stage', 'Leads', 'Avg Days in Stage', 'Stuck 14+ Days'].map(h => (
                  <th key={h} className="text-left text-xs text-muted-foreground font-semibold pb-2 pr-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agingByStage.map(b => (
                <tr key={b.stage} className="border-b border-border/40">
                  <td className="py-2.5 pr-3 font-semibold">{STAGE_LABELS[b.stage] || b.stage}</td>
                  <td className="py-2.5 pr-3">{b.count}</td>
                  <td className={`py-2.5 pr-3 font-semibold ${b.avgDays >= 30 ? 'text-red-500' : b.avgDays >= 14 ? 'text-amber-500' : ''}`}>{b.avgDays}d</td>
                  <td className="py-2.5 pr-3">{b.aged14.length > 0 ? <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-600 font-bold">{b.aged14.length}</span> : '—'}</td>
                </tr>
              ))}
              {agingByStage.length === 0 && (
                <tr><td colSpan={4} className="py-4 text-center text-muted-foreground text-sm">No leads currently in an open stage.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {allAged.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Oldest first</p>
            <div className="rounded-lg border border-border/60 divide-y divide-border/40 max-h-80 overflow-y-auto">
              {allAged.map(l => (
                <button key={l.id} onClick={() => openLead(l.id)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/30 text-left">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{leadName(l)}</p>
                    <p className="text-xs text-muted-foreground">{STAGE_LABELS[l.status] || l.status} · {(l.lead_sources as any)?.name || '—'}</p>
                  </div>
                  <span className="text-xs font-bold text-red-500 shrink-0">{daysAgo(l.created_at)}d</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* PRODUCTION STATUS */}
      <Section title="Production Status" icon={<Hammer className="h-4 w-4 text-primary" />} badge={`${wonLeads.length} won jobs`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground mb-1">Pending Start</p><p className="text-xl font-bold">{production.pending.length}</p></div>
          <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground mb-1">In Progress</p><p className="text-xl font-bold text-amber-600">{production.active.length}</p></div>
          <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground mb-1">Completed</p><p className="text-xl font-bold text-emerald-600">{production.completed.length}</p></div>
          <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground mb-1">No Stage Set</p><p className="text-xl font-bold text-muted-foreground">{production.noStage.length}</p></div>
        </div>
        {wonLeadsSorted.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Won jobs · client &amp; job type</p>
            <div className="rounded-lg border border-border/60 divide-y divide-border/40 max-h-80 overflow-y-auto">
              {wonLeadsSorted.map(l => (
                <button key={l.id} onClick={() => openLead(l.id)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/30 text-left">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{leadName(l)}</p>
                    <p className="text-xs text-muted-foreground">{l.metadata?.job_type || 'No job type set'} · {l.production_stage || 'No stage set'}</p>
                  </div>
                  <span className="text-xs font-bold text-emerald-600 shrink-0">{fmt$(Number(l.initial_contract_value || 0))}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <button onClick={() => router.push('/production')} className="text-xs text-primary hover:underline font-medium">View full Production tracker →</button>
      </Section>

      {/* TIME TO CLOSE */}
      <Section title="Time to Close" icon={<Clock className="h-4 w-4 text-primary" />} defaultOpen={false}>
        {timeToClose.sample === 0 ? (
          <p className="text-sm text-muted-foreground">No jobs have a recorded close date yet, so this can't be calculated — every job is currently defaulting to its lead intake date. Use the "Date Won" field on a lead's Initial Contract card to start logging real close dates; this will fill in as you go.</p>
        ) : (
          <>
            <p className="text-2xl font-bold">{timeToClose.avgDays} days</p>
            <p className="text-xs text-muted-foreground mt-1">Average from lead received to job won, based on {timeToClose.sample} job{timeToClose.sample === 1 ? '' : 's'} with a recorded close date. This will get more accurate as more Date Won values are filled in.</p>
          </>
        )}
      </Section>

      <LeadDetailDialog
        lead={selectedLead}
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) { fetchSnapshot(); fetchPeriod() } }}
        onLeadUpdated={() => { fetchSnapshot(); fetchPeriod() }}
        onLeadDeleted={() => { setDialogOpen(false); fetchSnapshot(); fetchPeriod() }}
      />
    </div>
  )
}
