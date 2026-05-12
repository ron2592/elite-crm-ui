'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from 'recharts'
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Users, Home, Phone, DollarSign, Target, TrendingUp,
  Plus, Save, X, Loader2, LayoutDashboard, Printer,
  CalendarCheck, UserCheck,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────
interface LeadRow {
  id: string; status: string; contact_type: string | null; lsa_status: string | null;
  initial_contract_value: number; estimated_amount: number; closed_amount: number;
  created_at: string; source_id: string | null;
  metadata: { salesperson?: string } | null;
  lead_sources: { name: string } | null;
}
interface PaymentRow { amount: number; paid_at: string; lead_id: string }
interface SpendRow {
  id: string; period_start: string; source_name: string | null;
  source_id: string | null; amount_spent: number;
  lead_sources: { name: string } | null;
}
interface LeadSource { id: string; name: string }

// ── Helpers ────────────────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const SALESPERSONS = ['Ron', 'Ray', 'Other (Phone)']
const WON_STAGES = ['closed_won', 'won']
const ESTIMATED_STAGES = ['estimate_sent', 'closed_won', 'won', 'lost']
const SRC_COLORS = ['bg-blue-500','bg-orange-500','bg-emerald-500','bg-purple-500','bg-pink-500','bg-cyan-500','bg-yellow-500','bg-red-500']

function monthRange(year: number, month: number) {
  return { start: new Date(year, month, 1).toISOString(), end: new Date(year, month + 1, 1).toISOString() }
}
function fmt$(n: number) {
  if (n >= 1000) return '$' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return '$' + Math.round(n).toLocaleString()
}
function pct(num: number, den: number) {
  if (!den) return '—'
  return Math.round((num / den) * 100) + '%'
}

// ── Collapsible Section Wrapper ────────────────────────────────────────────
function Accordion({ title, defaultOpen = true, badge, children }: {
  title: string; defaultOpen?: boolean; badge?: string; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{title}</span>
          {badge && <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{badge}</span>}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  )
}

// ── Scorecard ──────────────────────────────────────────────────────────────
function ScoreCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  const bg: Record<string, string> = {
    default: 'bg-muted/50', blue: 'bg-blue-50 dark:bg-blue-950/20',
    indigo: 'bg-indigo-50 dark:bg-indigo-950/20', purple: 'bg-purple-50 dark:bg-purple-950/20',
    orange: 'bg-orange-50 dark:bg-orange-950/20', green: 'bg-green-50 dark:bg-green-950/20',
    emerald: 'bg-emerald-50 dark:bg-emerald-950/20',
  }
  const ic: Record<string, string> = {
    default: 'text-muted-foreground', blue: 'text-blue-500', indigo: 'text-indigo-500',
    purple: 'text-purple-500', orange: 'text-orange-500', green: 'text-green-600', emerald: 'text-emerald-600',
  }
  return (
    <div className={`rounded-lg p-3 ${bg[color] || bg.default}`}>
      <div className={`mb-2 ${ic[color] || ic.default}`}>{icon}</div>
      <p className="text-2xl font-bold leading-none">{value}</p>
      <p className="text-xs text-muted-foreground mt-1.5">{label}</p>
    </div>
  )
}

function CloseRateCard({ label, won, total, sub, color }: { label: string; won: number; total: number; sub: string; color: string }) {
  const rate = total > 0 ? Math.round((won / total) * 100) : 0
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      <p className="text-3xl font-bold mb-3">{total > 0 ? rate + '%' : '—'}</p>
      <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${rate}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function KPIPage() {
  const today = new Date()
  const router = useRouter()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [filterSP, setFilterSP]   = useState('')
  const [filterSrc, setFilterSrc] = useState('')

  const [leads, setLeads]       = useState<LeadRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [changeOrders, setChangeOrders] = useState<{ amount: number; lead_id: string }[]>([])
  const [trend, setTrend]       = useState<{ label: string; contracted: number; actual: number; leads: number }[]>([])
  const [spend, setSpend]       = useState<SpendRow[]>([])
  const [sources, setSources]   = useState<LeadSource[]>([])
  const [loading, setLoading]   = useState(true)

  const [showSpendForm, setShowSpendForm] = useState(false)
  const [spendForm, setSpendForm] = useState({ source_id: '', amount: '' })
  const [savingSpend, setSavingSpend] = useState(false)

  // ── Fetch ────────────────────────────────────────────────────────────────
  useEffect(() => { fetchAll() }, [year, month])

  async function fetchAll() {
    setLoading(true)
    const { start, end } = monthRange(year, month)

    const [leadsRes, paymentsRes, spendRes, srcRes] = await Promise.all([
      supabase.from('leads').select('id,status,contact_type,lsa_status,initial_contract_value,estimated_amount,closed_amount,created_at,source_id,metadata,lead_sources(name)').gte('created_at', start).lt('created_at', end).eq('archived', false),
      supabase.from('payments').select('amount,paid_at,lead_id').gte('paid_at', start).lt('paid_at', end),
      supabase.from('marketing_spend').select('id,period_start,source_name,source_id,amount_spent,lead_sources(name)').gte('period_start', start).lt('period_start', end),
      supabase.from('lead_sources').select('id,name').order('name'),
    ])

    const wonIds = (leadsRes.data || []).filter((l: any) => WON_STAGES.includes(l.status)).map((l: any) => l.id)
    let coData: any[] = []
    if (wonIds.length > 0) {
      const { data } = await supabase.from('change_orders').select('amount,lead_id').eq('status', 'won').in('lead_id', wonIds)
      coData = data || []
    }

    const trendStart = new Date(year, month - 5, 1).toISOString()
    const [trendLeadsRes, trendPayRes] = await Promise.all([
      supabase.from('leads').select('status,initial_contract_value,created_at').gte('created_at', trendStart).lt('created_at', end).eq('archived', false),
      supabase.from('payments').select('amount,paid_at').gte('paid_at', trendStart).lt('paid_at', end),
    ])

    const tMap: Record<string, { contracted: number; actual: number; leads: number }> = {}
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - i, 1)
      tMap[`${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`] = { contracted: 0, actual: 0, leads: 0 }
    }
    ;(trendLeadsRes.data || []).forEach((l: any) => {
      const d = new Date(l.created_at)
      const k = `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
      if (tMap[k]) { tMap[k].leads++; if (WON_STAGES.includes(l.status)) tMap[k].contracted += Number(l.initial_contract_value || 0) }
    })
    ;(trendPayRes.data || []).forEach((p: any) => {
      const d = new Date(p.paid_at)
      const k = `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
      if (tMap[k]) tMap[k].actual += Number(p.amount || 0)
    })

    setLeads((leadsRes.data as any[]) || [])
    setPayments(paymentsRes.data || [])
    setChangeOrders(coData)
    setSpend((spendRes.data as any[]) || [])
    setSources(srcRes.data || [])
    setTrend(Object.entries(tMap).map(([label, v]) => ({ label, ...v })))
    setLoading(false)
  }

  // ── Filtered ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => leads.filter(l => {
    if (filterSP  && (l.metadata?.salesperson || '') !== filterSP)  return false
    if (filterSrc && (l.source_id || '') !== filterSrc) return false
    return true
  }), [leads, filterSP, filterSrc])

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const total     = filtered.length
    const estimated = filtered.filter(l => ESTIMATED_STAGES.includes(l.status)).length
    const inPerson  = filtered.filter(l => l.contact_type === 'in_person').length
    const phoneQ    = filtered.filter(l => l.contact_type === 'phone_quote').length
    const won       = filtered.filter(l => WON_STAGES.includes(l.status))
    const wonCount  = won.length
    const contracted    = won.reduce((s, l) => s + Number(l.initial_contract_value || 0), 0)
    const actual        = payments.reduce((s, p) => s + Number(p.amount || 0), 0)
    const wonInPerson   = filtered.filter(l => WON_STAGES.includes(l.status) && l.contact_type === 'in_person').length
    const wonPhone      = filtered.filter(l => WON_STAGES.includes(l.status) && l.contact_type === 'phone_quote').length
    const lsaCharged    = filtered.filter(l => l.lsa_status === 'charged' || l.lsa_status === 'submitted').length
    const lsaCredited   = filtered.filter(l => l.lsa_status === 'credited').length
    const appointments  = filtered.filter(l => ['appointment_set','estimate_sent','closed_won','won','lost','cancelled_appointment'].includes(l.status)).length
    const coVolume      = changeOrders.reduce((s, co) => s + Number(co.amount || 0), 0)
    const totalSpend    = spend.reduce((s, r) => s + Number(r.amount_spent || 0), 0)
    const costPerLead   = lsaCharged > 0 ? totalSpend / lsaCharged : 0
    const jobAcqCost    = wonCount > 0 ? totalSpend / wonCount : 0
    const apptAcqCost   = inPerson > 0 ? totalSpend / inPerson : 0
    const jobConvRatio  = lsaCharged > 0 ? (wonCount / lsaCharged) * 100 : 0
    const salesCloseRatio = inPerson > 0 ? (wonInPerson / inPerson) * 100 : 0
    const apptConvRatio = lsaCharged > 0 ? (inPerson / lsaCharged) * 100 : 0

    const bySrc: Record<string, { name: string; total: number; won: number; revenue: number; estimated: number }> = {}
    filtered.forEach(l => {
      const key = l.source_id || 'unknown'
      const name = (l.lead_sources as any)?.name || 'Unknown'
      if (!bySrc[key]) bySrc[key] = { name, total: 0, won: 0, revenue: 0, estimated: 0 }
      bySrc[key].total++
      if (ESTIMATED_STAGES.includes(l.status)) bySrc[key].estimated++
      if (WON_STAGES.includes(l.status)) { bySrc[key].won++; bySrc[key].revenue += Number(l.initial_contract_value || 0) }
    })

    return {
      total, estimated, inPerson, phoneQ, wonCount, contracted, actual,
      wonInPerson, wonPhone, lsaCharged, lsaCredited, bySrc, appointments,
      totalSpend, costPerLead, jobAcqCost, apptAcqCost,
      jobConvRatio, salesCloseRatio, apptConvRatio, coVolume,
    }
  }, [filtered, payments, spend, changeOrders])

  // ── Month nav ─────────────────────────────────────────────────────────────
  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  // ── Add spend ─────────────────────────────────────────────────────────────
  async function handleAddSpend() {
    if (!spendForm.amount || Number(spendForm.amount) <= 0) return
    setSavingSpend(true)
    const src = sources.find(s => s.id === spendForm.source_id)
    await supabase.from('marketing_spend').insert({
      period_start: new Date(year, month, 1).toISOString().split('T')[0],
      period_end:   new Date(year, month + 1, 0).toISOString().split('T')[0],
      source_id:    spendForm.source_id || null,
      source_name:  src?.name || null,
      amount_spent: Number(spendForm.amount),
    })
    setSpendForm({ source_id: '', amount: '' })
    setShowSpendForm(false)
    setSavingSpend(false)
    fetchAll()
  }

  const monthLabel = `${MONTHS[month]} ${year}`
  const srcList = Object.values(kpi.bySrc).sort((a, b) => b.total - a.total)
  const maxSrc = Math.max(...srcList.map(s => s.total), 1)
  const maxSrcRevenue = Math.max(...srcList.map(s => s.revenue), 1)

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground transition-colors">
            <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
          </button>
          <div>
            <h1 className="text-2xl font-bold">KPI Dashboard</h1>
            <p className="text-sm text-muted-foreground">Elite Work Home Improvement</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Salesperson KPI link */}
          <button onClick={() => router.push('/kpi/salesperson')}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium">
            <UserCheck className="h-3.5 w-3.5" /> Salesperson KPI
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground transition-colors">
            <Printer className="h-3.5 w-3.5" /> Export PDF
          </button>
          {/* Month nav */}
          <div className="flex items-center gap-1 rounded-lg border border-border px-2 py-1">
            <button onClick={prevMonth} className="p-1 hover:bg-muted rounded transition-colors"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm font-medium w-24 text-center">{monthLabel}</span>
            <button onClick={nextMonth} className="p-1 hover:bg-muted rounded transition-colors"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex gap-3 flex-wrap items-center">
        <select value={filterSP} onChange={e => setFilterSP(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none">
          <option value="">All Salespersons</option>
          {SALESPERSONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterSrc} onChange={e => setFilterSrc(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none">
          <option value="">All Sources</option>
          {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {(filterSP || filterSrc) && (
          <button onClick={() => { setFilterSP(''); setFilterSrc('') }}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground">
            <X className="h-3 w-3" /> Clear
          </button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          Showing {filtered.length} leads for {monthLabel}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading KPI data...
        </div>
      ) : (
        <div className="space-y-4">

          {/* ── Top Scorecards — always visible ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <ScoreCard icon={<Users className="h-4 w-4" />}       label="Total Leads"      value={kpi.total}         color="default" />
            <ScoreCard icon={<CalendarCheck className="h-4 w-4" />} label="Appointments"   value={kpi.appointments}  color="blue" />
            <ScoreCard icon={<Target className="h-4 w-4" />}      label="Estimates Sent"   value={kpi.estimated}     color="indigo" />
            <ScoreCard icon={<Home className="h-4 w-4" />}        label="In-Person"        value={kpi.inPerson}      color="purple" />
            <ScoreCard icon={<Phone className="h-4 w-4" />}       label="Phone Quotes"     value={kpi.phoneQ}        color="orange" />
            <ScoreCard icon={<TrendingUp className="h-4 w-4" />}  label="Closed Won"       value={kpi.wonCount}      color="green" />
            <ScoreCard icon={<DollarSign className="h-4 w-4" />}  label="Contracted"       value={fmt$(kpi.contracted)} color="emerald" />
          </div>

          {/* Quick stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Actual Revenue',    value: fmt$(kpi.actual),                                      sub: 'payments received' },
              { label: 'Overall Close Rate', value: pct(kpi.wonCount, kpi.total),                         sub: `${kpi.wonCount} won / ${kpi.total} leads` },
              { label: 'Estimate Close Rate', value: pct(kpi.wonCount, kpi.estimated),                   sub: 'won / estimates sent' },
              { label: 'Avg Rev / Job',      value: kpi.wonCount ? fmt$(kpi.contracted / kpi.wonCount) : '—', sub: 'contracted value' },
            ].map(c => (
              <div key={c.label} className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
                <p className="text-xl font-bold">{c.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
              </div>
            ))}
          </div>

          {/* ── Revenue Breakdown — collapsible ── */}
          <Accordion title="Revenue Breakdown" badge={fmt$(kpi.contracted + kpi.coVolume)}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs text-muted-foreground mb-1">Initial Contract Volume</p>
                <p className="text-2xl font-bold">{fmt$(kpi.contracted)}</p>
                <p className="text-xs text-muted-foreground mt-1">original signed agreements</p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs text-muted-foreground mb-1">Change Order Volume</p>
                <p className="text-2xl font-bold">{fmt$(kpi.coVolume)}</p>
                <p className="text-xs text-muted-foreground mt-1">additional signed work</p>
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <p className="text-xs text-primary font-medium mb-1">Total Contracted Revenue</p>
                <p className="text-2xl font-bold text-primary">{fmt$(kpi.contracted + kpi.coVolume)}</p>
                <p className="text-xs text-muted-foreground mt-1">initial + change orders</p>
              </div>
            </div>
          </Accordion>

          {/* ── Conversion Metrics — collapsible ── */}
          <Accordion title="Acquisition & Conversion Metrics" defaultOpen={false}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
              {[
                { label: 'Job Acquisition Cost',  value: kpi.jobAcqCost > 0 ? fmt$(kpi.jobAcqCost) : '—',   sub: 'spend ÷ jobs closed' },
                { label: 'Appt Acquisition Cost', value: kpi.apptAcqCost > 0 ? fmt$(kpi.apptAcqCost) : '—', sub: 'spend ÷ in-person appts' },
                { label: 'Job Conversion Ratio',  value: kpi.lsaCharged > 0 ? Math.round(kpi.jobConvRatio) + '%' : '—', sub: 'won ÷ charged leads' },
                { label: 'Sales Closing Ratio',   value: kpi.inPerson > 0 ? Math.round(kpi.salesCloseRatio) + '%' : '—', sub: 'won ÷ in-person appts' },
                { label: 'Appt Conversion Ratio', value: kpi.lsaCharged > 0 ? Math.round(kpi.apptConvRatio) + '%' : '—', sub: 'in-person ÷ charged leads' },
              ].map(m => (
                <div key={m.label} className="space-y-1">
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="text-xl font-bold">{m.value}</p>
                  <p className="text-xs text-muted-foreground">{m.sub}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-border">
              <CloseRateCard label="Overall Close Rate"     won={kpi.wonCount}    total={kpi.total}      sub={`${kpi.wonCount} won of ${kpi.total} leads`}      color="bg-primary" />
              <CloseRateCard label="In-Person Close Rate"   won={kpi.wonInPerson} total={kpi.inPerson}   sub={`${kpi.wonInPerson} won of ${kpi.inPerson} visits`} color="bg-purple-500" />
              <CloseRateCard label="Phone Quote Close Rate" won={kpi.wonPhone}    total={kpi.phoneQ}     sub={`${kpi.wonPhone} won of ${kpi.phoneQ} quotes`}      color="bg-orange-500" />
            </div>
          </Accordion>

          {/* ── Revenue Chart — collapsible ── */}
          <Accordion title="Revenue Trend — Last 6 Months">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <div className="flex gap-3 text-xs text-muted-foreground mb-3">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#E07B3A]" /> Contracted</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#378ADD]" /> Actual</span>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={trend} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + (v/1000).toFixed(0) + 'k'} />
                    <Tooltip formatter={(v: number) => fmt$(v)} />
                    <Bar dataKey="contracted" fill="#E07B3A" radius={[3,3,0,0]} name="Contracted" />
                    <Bar dataKey="actual"     fill="#378ADD" radius={[3,3,0,0]} name="Actual" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Lead count trend</p>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={trend}>
                    <Line type="monotone" dataKey="leads" stroke="#378ADD" strokeWidth={2} dot={{ r: 3 }} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: number) => [v, 'Leads']} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Accordion>

          {/* ── Lead Source Comparison — collapsible ── */}
          <Accordion title="Lead Source Performance" defaultOpen={false} badge={`${srcList.length} sources`}>
            {srcList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No leads this month.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        {['Source','Leads','Estimates','Close Rate','Contracted','Rev / Job','Performance'].map(h => (
                          <th key={h} className="text-left text-xs text-muted-foreground font-medium pb-2 pr-4 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {srcList.map((src, i) => {
                        const cr = src.total > 0 ? Math.round((src.won / src.total) * 100) : 0
                        const rpl = src.won > 0 ? src.revenue / src.won : 0
                        const perfLabel = cr >= 40 ? '🟢 Strong' : cr >= 20 ? '🟡 Average' : src.total === 0 ? '⚪ No data' : '🔴 Weak'
                        const crColor = cr >= 40 ? 'text-emerald-600' : cr >= 20 ? 'text-yellow-600' : 'text-red-500'
                        return (
                          <tr key={src.name} className="border-b border-border/50 hover:bg-muted/20">
                            <td className="py-2.5 pr-4">
                              <div className="flex items-center gap-2">
                                <span className={`w-2.5 h-2.5 rounded-full ${SRC_COLORS[i % SRC_COLORS.length]}`} />
                                <span className="font-medium">{src.name}</span>
                              </div>
                            </td>
                            <td className="py-2.5 pr-4">{src.total}</td>
                            <td className="py-2.5 pr-4">{src.estimated}</td>
                            <td className="py-2.5 pr-4">
                              <div className="flex items-center gap-2">
                                <span className={`font-medium ${crColor}`}>{src.total > 0 ? cr + '%' : '—'}</span>
                                {src.total > 0 && (
                                  <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${cr >= 40 ? 'bg-emerald-500' : cr >= 20 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${Math.min(cr,100)}%` }} />
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 pr-4 font-medium text-emerald-600">{src.revenue > 0 ? fmt$(src.revenue) : '—'}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{rpl > 0 ? fmt$(rpl) : '—'}</td>
                            <td className="py-2.5 pr-4 text-xs font-medium">{perfLabel}</td>
                          </tr>
                        )
                      })}
                      <tr className="bg-muted/30 font-bold">
                        <td className="py-2 pr-4 text-xs uppercase text-muted-foreground">Total</td>
                        <td className="py-2 pr-4">{kpi.total}</td>
                        <td className="py-2 pr-4">{kpi.estimated}</td>
                        <td className="py-2 pr-4">{pct(kpi.wonCount, kpi.total)}</td>
                        <td className="py-2 pr-4 text-emerald-600">{fmt$(kpi.contracted)}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{kpi.wonCount > 0 ? fmt$(kpi.contracted / kpi.wonCount) : '—'}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
                {srcList.some(s => s.revenue > 0) && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Revenue by source</p>
                    <div className="space-y-2">
                      {srcList.filter(s => s.revenue > 0).map((src, i) => (
                        <div key={src.name} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-28 truncate shrink-0">{src.name}</span>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${SRC_COLORS[i % SRC_COLORS.length]}`} style={{ width: `${(src.revenue / maxSrcRevenue) * 100}%` }} />
                          </div>
                          <span className="text-xs font-medium w-16 text-right">{fmt$(src.revenue)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </Accordion>

          {/* ── Marketing Spend — collapsible ── */}
          <Accordion title="Marketing Spend by Source" defaultOpen={false} badge={kpi.totalSpend > 0 ? fmt$(kpi.totalSpend) : undefined}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-muted-foreground">
                Charged leads: <span className="font-medium text-foreground">{kpi.lsaCharged}</span>
                {' · '}Credited: <span className="font-medium text-foreground">{kpi.lsaCredited}</span>
                {kpi.costPerLead > 0 && <> · Avg cost/lead: <span className="font-medium text-foreground">{fmt$(kpi.costPerLead)}</span></>}
              </p>
              <button onClick={() => setShowSpendForm(!showSpendForm)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors">
                <Plus className="h-3.5 w-3.5" /> Log Spend
              </button>
            </div>

            {showSpendForm && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 mb-4 space-y-3">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide">Add Marketing Spend — {monthLabel}</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Source</label>
                    <select value={spendForm.source_id} onChange={e => setSpendForm({...spendForm, source_id: e.target.value})}
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none">
                      <option value="">— Select —</option>
                      {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Amount ($)</label>
                    <input type="number" placeholder="0.00" value={spendForm.amount}
                      onChange={e => setSpendForm({...spendForm, amount: e.target.value})}
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none" />
                  </div>
                  <div className="flex items-end gap-2">
                    <button onClick={handleAddSpend} disabled={savingSpend || !spendForm.amount}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors">
                      <Save className="h-3.5 w-3.5" />{savingSpend ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={() => setShowSpendForm(false)}
                      className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors">Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {spend.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Source','Spent','Leads','Cost / Lead','Revenue','ROI'].map(h => (
                      <th key={h} className="text-left text-xs text-muted-foreground font-medium pb-2 pr-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {spend.map(row => {
                    const srcName = (row.lead_sources as any)?.name || row.source_name || 'Unknown'
                    const srcData = kpi.bySrc[row.source_id || '']
                    const srcLeads = srcData?.total || 0
                    const srcRev   = srcData?.revenue || 0
                    const cpl = srcLeads > 0 ? Number(row.amount_spent) / srcLeads : 0
                    const roi = Number(row.amount_spent) > 0 ? ((srcRev - Number(row.amount_spent)) / Number(row.amount_spent)) * 100 : 0
                    return (
                      <tr key={row.id} className="border-b border-border/50">
                        <td className="py-2.5 pr-4">{srcName}</td>
                        <td className="py-2.5 pr-4 font-medium">{fmt$(Number(row.amount_spent))}</td>
                        <td className="py-2.5 pr-4">{srcLeads}</td>
                        <td className="py-2.5 pr-4">{cpl > 0 ? fmt$(cpl) : '—'}</td>
                        <td className="py-2.5 pr-4 text-emerald-600">{srcRev > 0 ? fmt$(srcRev) : '—'}</td>
                        <td className={`py-2.5 pr-4 font-medium ${roi >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {Number(row.amount_spent) > 0 ? Math.round(roi) + '%' : '—'}
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="bg-muted/30 font-bold">
                    <td className="py-2 pr-4 text-xs uppercase text-muted-foreground">Total</td>
                    <td className="py-2 pr-4">{fmt$(kpi.totalSpend)}</td>
                    <td className="py-2 pr-4">{kpi.lsaCharged}</td>
                    <td className="py-2 pr-4">{kpi.costPerLead > 0 ? fmt$(kpi.costPerLead) : '—'}</td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">
                No spend logged for {monthLabel} yet.
              </p>
            )}
          </Accordion>

        </div>
      )}
    </div>
  )
}