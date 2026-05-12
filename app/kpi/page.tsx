'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line,
} from 'recharts'
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Plus, Save, X, Loader2, LayoutDashboard, Printer, UserCheck,
} from 'lucide-react'
import KpiInsights, { InsightData } from '@/components/KpiInsights'

// ── Types ──────────────────────────────────────────────────────────────────
interface LeadRow {
  id: string; status: string; contact_type: string | null; lsa_status: string | null;
  initial_contract_value: number; created_at: string; source_id: string | null;
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
const WON_STAGES = ['closed_won', 'won']
const SRC_COLORS = ['#378ADD','#E07B3A','#10b981','#8b5cf6','#ec4899','#06b6d4','#f59e0b','#ef4444']

function monthRange(y: number, m: number) {
  return { start: new Date(y, m, 1).toISOString(), end: new Date(y, m + 1, 1).toISOString() }
}
function weekRange(weekOffset: number) {
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + weekOffset * 7)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 7)
  return { start: monday.toISOString(), end: sunday.toISOString(), monday }
}
function fmt$(n: number) {
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return '$' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return '$' + Math.round(n).toLocaleString()
}
function pct(a: number, b: number) { return b === 0 ? '—' : Math.round((a / b) * 100) + '%' }
function fmtDate(d: Date) { return `${MONTHS[d.getMonth()]} ${d.getDate()}` }

// ── Collapsible metric (appointments / revenue) ────────────────────────────
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

// ── Bold Metric Card — matching Marketing Spend style ──────────────────────
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

// ── Main ──────────────────────────────────────────────────────────────────
export default function KPIPage() {
  const today = new Date()
  const router = useRouter()
  const [viewMode, setViewMode] = useState<'monthly' | 'weekly'>('monthly')
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [weekOffset, setWeekOffset] = useState(0)
  const [filterSrc, setFilterSrc] = useState('')

  const [leads, setLeads]       = useState<LeadRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [changeOrders, setChangeOrders] = useState<{ amount: number; lead_id: string }[]>([])
  const [spend, setSpend]       = useState<SpendRow[]>([])
  const [sources, setSources]   = useState<LeadSource[]>([])
  const [trend, setTrend]       = useState<{ label: string; contracted: number; actual: number; leads: number }[]>([])
  const [loading, setLoading]   = useState(true)

  const [showSpendForm, setShowSpendForm] = useState(false)
  const [spendForm, setSpendForm] = useState({ source_id: '', amount: '' })
  const [savingSpend, setSavingSpend] = useState(false)

  const range = useMemo(() => {
    if (viewMode === 'monthly') return monthRange(year, month)
    return weekRange(weekOffset)
  }, [viewMode, year, month, weekOffset])

  const periodLabel = useMemo(() => {
    if (viewMode === 'monthly') return `${MONTHS[month]} ${year}`
    const { monday } = weekRange(weekOffset)
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
    if (weekOffset === 0) return `This week (${fmtDate(monday)} – ${fmtDate(sunday)})`
    if (weekOffset === -1) return `Last week (${fmtDate(monday)} – ${fmtDate(sunday)})`
    return `${fmtDate(monday)} – ${fmtDate(sunday)}`
  }, [viewMode, year, month, weekOffset])

  useEffect(() => { fetchAll() }, [range])

  async function fetchAll() {
    setLoading(true)
    const { start, end } = range

    const [leadsRes, paymentsRes, spendRes, srcRes] = await Promise.all([
      supabase.from('leads').select('id,status,contact_type,lsa_status,initial_contract_value,created_at,source_id,metadata,lead_sources(name)').gte('created_at', start).lt('created_at', end).eq('archived', false),
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

    if (viewMode === 'monthly') {
      const trendStart = new Date(year, month - 5, 1).toISOString()
      const [tLeads, tPay] = await Promise.all([
        supabase.from('leads').select('status,initial_contract_value,created_at').gte('created_at', trendStart).lt('created_at', end).eq('archived', false),
        supabase.from('payments').select('amount,paid_at').gte('paid_at', trendStart).lt('paid_at', end),
      ])
      const tMap: Record<string, { contracted: number; actual: number; leads: number }> = {}
      for (let i = 5; i >= 0; i--) {
        const d = new Date(year, month - i, 1)
        tMap[`${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`] = { contracted: 0, actual: 0, leads: 0 }
      }
      ;(tLeads.data || []).forEach((l: any) => {
        const d = new Date(l.created_at)
        const k = `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
        if (tMap[k]) { tMap[k].leads++; if (WON_STAGES.includes(l.status)) tMap[k].contracted += Number(l.initial_contract_value || 0) }
      })
      ;(tPay.data || []).forEach((p: any) => {
        const d = new Date(p.paid_at)
        const k = `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
        if (tMap[k]) tMap[k].actual += Number(p.amount || 0)
      })
      setTrend(Object.entries(tMap).map(([label, v]) => ({ label, ...v })))
    }

    setLeads((leadsRes.data as any[]) || [])
    setPayments(paymentsRes.data || [])
    setChangeOrders(coData)
    setSpend((spendRes.data as any[]) || [])
    setSources(srcRes.data || [])
    setLoading(false)
  }

  const filtered = useMemo(() => leads.filter(l => !filterSrc || l.source_id === filterSrc), [leads, filterSrc])

  const kpi = useMemo(() => {
    const total        = filtered.length
    const inPerson     = filtered.filter(l => l.contact_type === 'in_person').length
    const phoneQ       = filtered.filter(l => l.contact_type === 'phone_quote').length
    const totalAppts   = inPerson + phoneQ
    const won          = filtered.filter(l => WON_STAGES.includes(l.status))
    const wonCount     = won.length
    const contracted   = won.reduce((s, l) => s + Number(l.initial_contract_value || 0), 0)
    const coVolume     = changeOrders.reduce((s, co) => s + Number(co.amount || 0), 0)
    const totalRev     = contracted + coVolume
    const actual       = payments.reduce((s, p) => s + Number(p.amount || 0), 0)
    const lsaCharged   = filtered.filter(l => l.lsa_status === 'charged' || l.lsa_status === 'submitted').length
    const lsaCredited  = filtered.filter(l => l.lsa_status === 'credited').length
    const lsaNotCharged = filtered.filter(l => l.lsa_status === 'not_charged' || !l.lsa_status).length
    const lsaInReview  = filtered.filter(l => l.lsa_status === 'in_review').length
    const totalSpend   = spend.filter(s => !filterSrc || s.source_id === filterSrc).reduce((s, r) => s + Number(r.amount_spent || 0), 0)
    const apptAcqCost  = inPerson > 0 && totalSpend > 0 ? totalSpend / inPerson : 0
    const projAcqCost  = wonCount > 0 && totalSpend > 0 ? totalSpend / wonCount : 0

    const bySrc: Record<string, { name: string; total: number; inPerson: number; phoneQ: number; won: number; contracted: number; lsaCharged: number }> = {}
    filtered.forEach(l => {
      const key  = l.source_id || 'unknown'
      const name = (l.lead_sources as any)?.name || 'Unknown'
      if (!bySrc[key]) bySrc[key] = { name, total: 0, inPerson: 0, phoneQ: 0, won: 0, contracted: 0, lsaCharged: 0 }
      bySrc[key].total++
      if (l.contact_type === 'in_person')   bySrc[key].inPerson++
      if (l.contact_type === 'phone_quote') bySrc[key].phoneQ++
      if (WON_STAGES.includes(l.status)) { bySrc[key].won++; bySrc[key].contracted += Number(l.initial_contract_value || 0) }
      if (l.lsa_status === 'charged' || l.lsa_status === 'submitted') bySrc[key].lsaCharged++
    })

    return { total, inPerson, phoneQ, totalAppts, wonCount, contracted, coVolume, totalRev, actual, lsaCharged, lsaCredited, lsaNotCharged, lsaInReview, totalSpend, apptAcqCost, projAcqCost, bySrc }
  }, [filtered, payments, spend, changeOrders, filterSrc])

  const spendBySrc = useMemo(() => {
    const map: Record<string, { name: string; amount: number; source_id: string | null }> = {}
    spend.forEach(row => {
      const key = row.source_id || row.source_name || 'unknown'
      const name = (row.lead_sources as any)?.name || row.source_name || 'Unknown'
      if (!map[key]) map[key] = { name, amount: 0, source_id: row.source_id }
      map[key].amount += Number(row.amount_spent || 0)
    })
    return Object.values(map).sort((a, b) => b.amount - a.amount)
  }, [spend])

  const srcList = Object.values(kpi.bySrc).sort((a, b) => b.total - a.total)

  const insightsData: InsightData = useMemo(() => ({
    totalLeads:      kpi.total,
    totalAppts:      kpi.inPerson,
    totalPhoneQ:     kpi.phoneQ,
    totalWon:        kpi.wonCount,
    totalContracted: kpi.contracted + kpi.coVolume,
    totalSpend:      kpi.totalSpend,
    period:          periodLabel,
    viewMode,
    sources: srcList.map(src => {
      const srcSpendRow = spendBySrc.find(s => {
        const key = Object.keys(kpi.bySrc).find(k => kpi.bySrc[k] === src)
        return s.source_id === key
      })
      return { name: src.name, leads: src.total, inPerson: src.inPerson, won: src.won, contracted: src.contracted, spend: srcSpendRow?.amount || 0 }
    }),
    trend: trend.map(t => ({ label: t.label, contracted: t.contracted, leads: t.leads })),
  }), [kpi, periodLabel, viewMode, srcList, spendBySrc, trend])

  async function handleAddSpend() {
    if (!spendForm.amount || Number(spendForm.amount) <= 0) return
    setSavingSpend(true)
    const src = sources.find(s => s.id === spendForm.source_id)
    const { start } = range
    await supabase.from('marketing_spend').insert({
      period_start: start.split('T')[0],
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

  function prevPeriod() {
    if (viewMode === 'monthly') { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
    else setWeekOffset(w => w - 1)
  }
  function nextPeriod() {
    if (viewMode === 'monthly') { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }
    else setWeekOffset(w => Math.min(w + 1, 0))
  }

  const maxRev = Math.max(...srcList.map(s => s.contracted), 1)

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground">
            <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
          </button>
          <div>
            <h1 className="text-2xl font-bold">KPI Dashboard</h1>
            <p className="text-sm text-muted-foreground">Elite Work Home Improvement</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => router.push('/kpi/salesperson')}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground">
            <UserCheck className="h-3.5 w-3.5" /> Salesperson KPI
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground">
            <Printer className="h-3.5 w-3.5" /> Export PDF
          </button>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['monthly','weekly'] as const).map(v => (
              <button key={v} onClick={() => { setViewMode(v); setWeekOffset(0) }}
                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${viewMode === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                {v}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border px-2 py-1">
            <button onClick={prevPeriod} className="p-1 hover:bg-muted rounded"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm font-medium w-48 text-center">{periodLabel}</span>
            <button onClick={nextPeriod} disabled={viewMode === 'weekly' && weekOffset === 0}
              className="p-1 hover:bg-muted rounded disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
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
                <p className="text-xs text-muted-foreground mt-0.5">{periodLabel} · All sources</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-3xl font-bold">{fmt$(kpi.totalSpend)}</p>
                  <p className="text-xs text-muted-foreground">total spent</p>
                </div>
                <button onClick={() => setShowSpendForm(v => !v)}
                  className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium transition-colors">
                  <Plus className="h-4 w-4" /> Log Spend
                </button>
              </div>
            </div>

            {showSpendForm && (
              <div className="px-6 py-4 border-b border-primary/20 bg-primary/5">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-3">Add Spend — {periodLabel}</p>
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
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                      <Save className="h-3.5 w-3.5" /> {savingSpend ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={() => setShowSpendForm(false)}
                      className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">Cancel</button>
                  </div>
                </div>
              </div>
            )}

            <div className="px-6 py-4">
              {spendBySrc.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">No spend logged for {periodLabel}. Click "Log Spend" to add.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {spendBySrc.map((row, i) => {
                    const srcData = kpi.bySrc[row.source_id || ''] || { total: 0, inPerson: 0, won: 0, lsaCharged: 0 }
                    const cpl = srcData.lsaCharged > 0 ? row.amount / srcData.lsaCharged : 0
                    return (
                      <div key={i} className="bg-background rounded-lg border border-border p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: SRC_COLORS[i % SRC_COLORS.length] }} />
                          <span className="text-xs font-medium truncate">{row.name}</span>
                        </div>
                        <p className="text-xl font-bold">{fmt$(row.amount)}</p>
                        {cpl > 0 && <p className="text-xs text-muted-foreground mt-1">{fmt$(cpl)} / charged lead</p>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 2. KEY METRICS — bold cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">

            {/* Total Leads */}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-4 py-4">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-2">Total Leads</p>
                <p className="text-3xl font-bold text-foreground">{kpi.total}</p>
                <p className="text-xs text-muted-foreground mt-1">{periodLabel}</p>
              </div>
              <div className="px-4 pb-3 border-t border-border bg-muted/10 pt-2">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Charged</span><span className="font-semibold">{kpi.lsaCharged}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Not charged</span><span className="font-semibold">{kpi.lsaNotCharged}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">In review</span><span className="font-semibold">{kpi.lsaInReview}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Credited</span><span className="font-semibold">{kpi.lsaCredited}</span></div>
                </div>
              </div>
            </div>

            {/* Total Appointments — expandable */}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <ExpandMetric label="Total Appointments" value={kpi.totalAppts}>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">In-person visits</span><span className="font-bold">{kpi.inPerson}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Phone quotes</span><span className="font-bold">{kpi.phoneQ}</span></div>
                </div>
              </ExpandMetric>
            </div>

            {/* Total Revenue — expandable */}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <ExpandMetric label="Total Revenue" value={fmt$(kpi.totalRev)} color="text-emerald-600">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Initial contracts</span><span className="font-bold">{fmt$(kpi.contracted)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Change orders</span><span className="font-bold">{fmt$(kpi.coVolume)}</span></div>
                  <div className="flex justify-between text-sm border-t border-border pt-2"><span className="text-muted-foreground">Collected (actual)</span><span className="font-bold text-emerald-600">{fmt$(kpi.actual)}</span></div>
                </div>
              </ExpandMetric>
            </div>

            {/* Appt Acquisition Cost */}
            <MetricCard
              label="Appt Acquisition Cost"
              value={kpi.apptAcqCost > 0 ? fmt$(kpi.apptAcqCost) : '—'}
              sub={kpi.totalSpend > 0 ? 'spend ÷ in-person appts' : 'log spend to calculate'}
            />

            {/* Project Acquisition Cost */}
            <MetricCard
              label="Marketing Proj. Acq. Cost"
              value={kpi.projAcqCost > 0 ? fmt$(kpi.projAcqCost) : '—'}
              sub={kpi.totalSpend > 0 ? 'spend ÷ jobs closed' : 'log spend to calculate'}
            />

            {/* Close Rate */}
            <MetricCard
              label="Overall Close Rate"
              value={pct(kpi.wonCount, kpi.total)}
              sub={`${kpi.wonCount} won / ${kpi.total} leads`}
              color={kpi.wonCount / Math.max(kpi.total, 1) >= 0.3 ? 'text-emerald-600' : 'text-foreground'}
            />
          </div>

          {/* 3. SOURCE PERFORMANCE TABLE */}
          <Section title="Lead Source Performance" badge={`${srcList.length} sources`} defaultOpen>
            {srcList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No leads for this period.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        {['Source','Leads','Charged','Appts (In-Person)','Phone Quotes','Closed Won','Close %','Revenue','Spend','Appt Acq. Cost','Proj Acq. Cost'].map(h => (
                          <th key={h} className="text-left text-xs text-muted-foreground font-semibold pb-2 pr-3 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {srcList.map((src, i) => {
                        const srcSpend = spendBySrc.find(s => {
                          const key = Object.keys(kpi.bySrc).find(k => kpi.bySrc[k] === src)
                          return s.source_id === key
                        })?.amount || 0
                        const apptCost = src.inPerson > 0 && srcSpend > 0 ? srcSpend / src.inPerson : 0
                        const projCost = src.won > 0 && srcSpend > 0 ? srcSpend / src.won : 0
                        const cr = src.total > 0 ? Math.round((src.won / src.total) * 100) : 0
                        const crColor = cr >= 40 ? 'text-emerald-600 font-bold' : cr >= 20 ? 'text-yellow-600 font-bold' : 'text-red-500 font-bold'
                        return (
                          <tr key={src.name} className="border-b border-border/50 hover:bg-muted/20">
                            <td className="py-3 pr-3">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SRC_COLORS[i % SRC_COLORS.length] }} />
                                <span className="font-semibold">{src.name}</span>
                              </div>
                            </td>
                            <td className="py-3 pr-3 font-semibold">{src.total}</td>
                            <td className="py-3 pr-3 text-muted-foreground">{src.lsaCharged}</td>
                            <td className="py-3 pr-3 font-semibold">{src.inPerson}</td>
                            <td className="py-3 pr-3 text-muted-foreground">{src.phoneQ}</td>
                            <td className="py-3 pr-3">
                              <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700 font-bold dark:bg-emerald-900/30 dark:text-emerald-400">{src.won}</span>
                            </td>
                            <td className={`py-3 pr-3 ${crColor}`}>{src.total > 0 ? cr + '%' : '—'}</td>
                            <td className="py-3 pr-3 font-bold text-emerald-600">{src.contracted > 0 ? fmt$(src.contracted) : '—'}</td>
                            <td className="py-3 pr-3 text-muted-foreground">{srcSpend > 0 ? fmt$(srcSpend) : '—'}</td>
                            <td className="py-3 pr-3 text-muted-foreground">{apptCost > 0 ? fmt$(apptCost) : '—'}</td>
                            <td className="py-3 pr-3 text-muted-foreground">{projCost > 0 ? fmt$(projCost) : '—'}</td>
                          </tr>
                        )
                      })}
                      <tr className="bg-muted/30 font-bold border-t-2 border-border">
                        <td className="py-2.5 pr-3 text-xs uppercase text-muted-foreground tracking-wide">Total</td>
                        <td className="py-2.5 pr-3">{kpi.total}</td>
                        <td className="py-2.5 pr-3">{kpi.lsaCharged}</td>
                        <td className="py-2.5 pr-3">{kpi.inPerson}</td>
                        <td className="py-2.5 pr-3">{kpi.phoneQ}</td>
                        <td className="py-2.5 pr-3">{kpi.wonCount}</td>
                        <td className="py-2.5 pr-3">{pct(kpi.wonCount, kpi.total)}</td>
                        <td className="py-2.5 pr-3 text-emerald-600">{fmt$(kpi.contracted)}</td>
                        <td className="py-2.5 pr-3">{fmt$(kpi.totalSpend)}</td>
                        <td className="py-2.5 pr-3">{kpi.apptAcqCost > 0 ? fmt$(kpi.apptAcqCost) : '—'}</td>
                        <td className="py-2.5 pr-3">{kpi.projAcqCost > 0 ? fmt$(kpi.projAcqCost) : '—'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {srcList.some(s => s.contracted > 0) && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Revenue by source</p>
                    <div className="space-y-2">
                      {srcList.filter(s => s.contracted > 0).map((src, i) => (
                        <div key={src.name} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-28 truncate shrink-0">{src.name}</span>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ background: SRC_COLORS[i % SRC_COLORS.length], width: `${(src.contracted / maxRev) * 100}%` }} />
                          </div>
                          <span className="text-xs font-bold w-14 text-right">{fmt$(src.contracted)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </Section>

          {/* 4. KPI INSIGHTS */}
          <KpiInsights label="KPI Performance Analysis" data={insightsData} />

          {/* 5. REVENUE TREND */}
          {viewMode === 'monthly' && (
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
          )}

        </div>
      )}
    </div>
  )
}