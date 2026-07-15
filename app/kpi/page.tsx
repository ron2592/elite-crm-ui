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

interface LeadRow {
  id: string; first_name?: string; last_name?: string; lead_name?: string; phone?: string;
  status: string; contact_type: string | null; lsa_status: string | null;
  initial_contract_value: number; created_at: string; source_id: string | null;
  metadata: { salesperson?: string } | null;
  lead_sources: { name: string } | null;
}
interface PaymentRow { amount: number; paid_at: string; lead_id: string }
interface SpendRow {
  id: string; period_start: string; period_end?: string; source_name: string | null;
  source_id: string | null; amount_spent: number;
  lead_sources: { name: string } | null;
}
interface LeadSource { id: string; name: string }
interface YTDData {
  totalLeads: number; totalInPerson: number; totalWon: number;
  totalSpend: number; totalRevenue: number; apptConvRate: number;
  cpa: number; apptAcqCost: number; roi: number; year: number;
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

function YTDBlock({ ytd, year, yearOptions, onYearChange, isCurrentYear }: {
  ytd: YTDData | null; year: number; yearOptions: number[]; onYearChange: (y: number) => void; isCurrentYear: boolean
}) {
  if (!ytd) return (
    <div className="rounded-xl border border-border p-4 flex items-center justify-center gap-2 text-muted-foreground text-sm">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading year-to-date metrics…
    </div>
  )
  const hasData = ytd.totalSpend > 0 && ytd.totalWon > 0
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 bg-muted/20 border-b border-border">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-bold">Year-to-Date · {ytd.year}</p>
            <p className="text-xs text-muted-foreground">
              {isCurrentYear ? 'Jan 1 – today' : `Jan 1 – Dec 31, ${ytd.year}`} · For job pricing decisions
              {!hasData && <span className="ml-1 text-amber-500">· No spend/jobs logged for {ytd.year}</span>}
            </p>
          </div>
        </div>
        <select value={year} onChange={e => onYearChange(Number(e.target.value))}
          className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-semibold border border-primary/20 focus:outline-none cursor-pointer">
          {yearOptions.map(y => <option key={y} value={y}>{y} YTD</option>)}
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border bg-card">
        <div className="px-6 py-5">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">Cost Per Acquisition</p>
          <p className={`text-3xl font-bold mt-1 ${!ytd.cpa ? 'text-muted-foreground' : ytd.cpa <= 700 ? 'text-emerald-600' : ytd.cpa <= 1200 ? 'text-amber-500' : 'text-red-500'}`}>
            {ytd.cpa > 0 ? fmt$(ytd.cpa) : '—'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {ytd.cpa > 0 ? `${fmt$(ytd.totalSpend)} spend ÷ ${ytd.totalWon} jobs` : 'Log spend + close jobs to calculate'}
          </p>
          <p className="text-[11px] text-primary/70 mt-2 font-medium">💡 Minimum to include in every estimate</p>
        </div>
        <div className="px-6 py-5">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">Appt Conversion Rate</p>
          <p className={`text-3xl font-bold mt-1 ${!ytd.apptConvRate ? 'text-muted-foreground' : ytd.apptConvRate >= 0.20 ? 'text-emerald-600' : ytd.apptConvRate >= 0.10 ? 'text-amber-500' : 'text-red-500'}`}>
            {ytd.apptConvRate > 0 ? Math.round(ytd.apptConvRate * 100) + '%' : '—'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{ytd.totalInPerson} in-person / {ytd.totalLeads} leads YTD</p>
          <p className="text-[11px] text-muted-foreground/60 mt-2 italic">Target: ≥ 20% · Below 10% = lead quality issue</p>
        </div>
        <div className="px-6 py-5">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">Marketing ROI</p>
          <p className={`text-3xl font-bold mt-1 ${!ytd.roi ? 'text-muted-foreground' : ytd.roi >= 5 ? 'text-emerald-600' : ytd.roi >= 2 ? 'text-amber-500' : 'text-red-500'}`}>
            {ytd.roi > 0 ? ytd.roi.toFixed(1) + 'x' : '—'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {ytd.roi > 0 ? `Every $1 spent → $${ytd.roi.toFixed(1)} collected` : 'Log spend to calculate'}
          </p>
          <p className="text-[11px] text-muted-foreground/60 mt-2 italic">Target: ≥ 5x · Below 2x = review spend allocation</p>
        </div>
      </div>
      {ytd.cpa > 0 && (
        <div className="px-5 py-3 bg-amber-50/50 dark:bg-amber-950/10 border-t border-amber-200/50 dark:border-amber-800/30">
          <p className="text-xs text-amber-800 dark:text-amber-300">
            <span className="font-semibold">Pricing floor:</span>{' '}
            Every estimate needs at least <span className="font-bold">{fmt$(ytd.cpa)}</span> built in before profit.
            {!hasData && <span className="ml-1 text-amber-600 font-medium">Import missing historical jobs to improve accuracy.</span>}
          </p>
        </div>
      )}
    </div>
  )
}

export default function KPIPage() {
  const today  = new Date()
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
  const [spend,        setSpend]        = useState<SpendRow[]>([])
  const [sources,      setSources]      = useState<LeadSource[]>([])
  // All-time (not date-range-scoped) set of source_ids that have EVER had marketing spend logged.
  // This is what separates "Marketing Performance" (paid channels, where CAC/ROI mean something)
  // from organic/repeat revenue (referrals, repeat clients — see the Organic & Repeat Revenue tab),
  // which has no spend to divide by and shouldn't be judged by the same yardstick.
  const [paidSourceIds, setPaidSourceIds] = useState<Set<string>>(new Set())
  const [trend,        setTrend]        = useState<{ label: string; contracted: number; actual: number; leads: number }[]>([])
  const [loading,      setLoading]      = useState(true)
  const [ytd,          setYtd]          = useState<YTDData | null>(null)

  const [compareMonth, setCompareMonth] = useState<number | null>(null)
  const [compareYear,  setCompareYear]  = useState<number>(today.getFullYear())
  const [compareLeads, setCompareLeads] = useState<LeadRow[]>([])
  const [compareSpend, setCompareSpend] = useState<SpendRow[]>([])
  const [compareRevEvents, setCompareRevEvents] = useState<{ lead_id: string; source_id: string | null; event_type: 'initial_contract' | 'change_order'; event_date: string; amount: number; record_type: 'change_order' | 'repeat_job' | null; contact_id: string | null; is_repeat_business: boolean }[]>([])

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

  const [ytdYear, setYtdYear] = useState<number>(today.getFullYear())
  const ytdYearOptions = useMemo(() => {
    const opts: number[] = []
    for (let y = today.getFullYear(); y >= today.getFullYear() - 4; y--) opts.push(y)
    return opts
  }, [])

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
  useEffect(() => { fetchYtd(ytdYear) }, [ytdYear])
  useEffect(() => {
    supabase.from('marketing_spend').select('source_id').then(({ data }) => {
      setPaidSourceIds(new Set((data || []).map((r: any) => r.source_id).filter(Boolean)))
    })
  }, [])

  async function fetchAll() {
    setLoading(true)
    const spendStart = dateFrom
    const spendEnd   = dateTo

    const [leadsRes, paymentsRes, coPaymentsRes, spendRes, srcRes, revEventsRes] = await Promise.all([
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
    setSpend((spendRes.data as any[]) || [])
    setSources(srcRes.data || [])
    setLoading(false)
  }

  // YTD is its own independent lookup, keyed by ytdYear — NOT tied to the main From/To filter
  // above, so you can check e.g. 2025's YTD performance while looking at a July 2026 KPI window.
  async function fetchYtd(year: number) {
    const isCurrentYear = year === today.getFullYear()
    const ytdStart    = new Date(year, 0, 1).toISOString()
    // For the current year, "to date" means right now. For a past year, it means the full year
    // (Dec 31) — otherwise a past year's YTD would silently include real 2026 data past its own
    // year boundary.
    const ytdEnd      = isCurrentYear ? new Date().toISOString() : new Date(year + 1, 0, 1).toISOString()
    const ytdSpendEnd = isCurrentYear ? todayStr() : `${year}-12-31`

    const [ytdLeadsRes, ytdSpendRes, ytdPayRes, ytdCoPayRes, ytdWonEventsRes] = await Promise.all([
      supabase.from('leads').select('id,status,contact_type,initial_contract_value')
        .gte('created_at', ytdStart).lt('created_at', ytdEnd).eq('archived', false),
      supabase.from('marketing_spend').select('amount_spent')
        .gte('period_start', `${year}-01-01`).lte('period_start', ytdSpendEnd),
      supabase.from('payments').select('amount')
        .gte('paid_at', ytdStart).lt('paid_at', ytdEnd).gt('amount', 0),
      // YTD revenue = cash actually collected, so it needs change_order_payments too — previously
      // this only queried payments, silently excluding every dollar ever collected on a change order.
      supabase.from('change_order_payments').select('amount')
        .gte('paid_at', ytdStart).lt('paid_at', ytdEnd).gt('amount', 0),
      // "Jobs Won" for CPA purposes needs to count by when the job actually closed, not by when the
      // originating lead first came in -- a job that came in 2024 and closed in 2026 (e.g. JCC
      // Bayone) was previously invisible to 2026's YTD Won/CPA entirely, because the old query only
      // looked at leads.created_at. revenue_events.event_date already resolves this the right way
      // (COALESCE(closed_at, created_at)) for the main Total Revenue figures above -- this reuses
      // the same source so YTD stays consistent with it. Repeat-client wins are excluded here since
      // they had no marketing spend behind them and would artificially deflate CPA.
      supabase.from('revenue_events').select('event_type,is_repeat_business')
        .eq('event_type', 'initial_contract').eq('is_repeat_business', false)
        .gte('event_date', `${year}-01-01`).lte('event_date', ytdSpendEnd),
    ])

    const ytdLeads    = (ytdLeadsRes.data || []) as any[]
    const ytdSpendAmt = (ytdSpendRes.data || []).reduce((s: number, r: any) => s + Number(r.amount_spent || 0), 0)
    const ytdRevenue  = (ytdPayRes.data  || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0)
                      + (ytdCoPayRes.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0)
    const ytdIP       = ytdLeads.filter((l: any) => l.contact_type === 'in_person').length
    const ytdWon      = (ytdWonEventsRes.data || []).length

    setYtd({
      totalLeads: ytdLeads.length, totalInPerson: ytdIP, totalWon: ytdWon,
      totalSpend: ytdSpendAmt, totalRevenue: ytdRevenue,
      apptConvRate: ytdLeads.length > 0 ? ytdIP / ytdLeads.length : 0,
      cpa:         ytdWon > 0 && ytdSpendAmt > 0 ? ytdSpendAmt / ytdWon : 0,
      apptAcqCost: ytdIP > 0 && ytdSpendAmt > 0 ? ytdSpendAmt / ytdIP : 0,
      roi:         ytdSpendAmt > 0 && ytdRevenue > 0 ? ytdRevenue / ytdSpendAmt : 0,
      year,
    })
  }

  useEffect(() => {
    if (compareMonth === null) { setCompareLeads([]); setCompareSpend([]); setCompareRevEvents([]); return; }
    const start   = new Date(compareYear, compareMonth, 1).toISOString()
    const end     = new Date(compareYear, compareMonth + 1, 1).toISOString()
    const spStart = start.split('T')[0]
    const spEnd   = new Date(compareYear, compareMonth + 1, 1).toISOString().split('T')[0]
    const revStart = new Date(compareYear, compareMonth, 1).toISOString().split('T')[0]
    const revEnd   = new Date(compareYear, compareMonth + 1, 0).toISOString().split('T')[0]
    Promise.all([
      supabase.from('leads').select('id,status,contact_type,initial_contract_value,source_id,lead_sources(name)').gte('created_at', start).lt('created_at', end).eq('archived', false),
      supabase.from('marketing_spend').select('id,source_id,amount_spent,lead_sources(name)').gte('period_start', spStart).lt('period_start', spEnd),
      // Same fix as the main period: revenue for the comparison month comes from revenue_events
      // (dated by when it was won), not from leads created that month.
      supabase.from('revenue_events').select('lead_id,source_id,event_type,event_date,amount,record_type,contact_id,is_repeat_business').gte('event_date', revStart).lte('event_date', revEnd),
    ]).then(([lr, sr, rr]) => {
      setCompareLeads((lr.data as any[]) || [])
      setCompareSpend((sr.data as any[]) || [])
      setCompareRevEvents((rr.data as any[]) || [])
    })
  }, [compareMonth, compareYear])

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
    const revInRange = filterSrc ? revenueEvents.filter(e => e.source_id === filterSrc) : revenueEvents
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
    const totalRev = initialJobRevenue + additionalJobRevenue
    // Kept as aliases so the per-source table (which just needs each source's grand total,
    // regardless of bucket) and older references don't need to change.
    const contracted = initialJobRevenue
    const coVolume    = additionalJobRevenue

    const actual        = payments.reduce((s, p) => s + Number(p.amount || 0), 0) + coPayments.reduce((s, p) => s + Number(p.amount || 0), 0)
    const lsaCharged    = filtered.filter(l => l.lsa_status === 'charged' || l.lsa_status === 'submitted').length
    const lsaCredited   = filtered.filter(l => l.lsa_status === 'credited').length
    const lsaNotCharged = filtered.filter(l => l.lsa_status === 'not_charged' || !l.lsa_status).length
    const lsaInReview   = filtered.filter(l => l.lsa_status === 'in_review').length
    const totalSpend    = spend.filter(s => !filterSrc || s.source_id === filterSrc).reduce((s, r) => s + Number(r.amount_spent || 0), 0)
    const apptAcqCost   = inPerson > 0 && totalSpend > 0 ? totalSpend / inPerson : 0
    const projAcqCost   = wonCount > 0 && totalSpend > 0 ? totalSpend / wonCount : 0
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
    return { total, inPerson, phoneQ, totalAppts, wonCount, contracted, coVolume, initialJobRevenue, additionalJobRevenue, totalRev, actual, lsaCharged, lsaCredited, lsaNotCharged, lsaInReview, totalSpend, apptAcqCost, projAcqCost, bySrc }
  }, [filtered, payments, coPayments, spend, revenueEvents, sources, filterSrc])

  const compareBySrc = useMemo(() => {
    if (!compareLeads.length && !compareRevEvents.length) return {}
    const bySrc: Record<string, { name: string; total: number; inPerson: number; won: number; contracted: number; spend: number }> = {}
    compareLeads.forEach((l: any) => {
      const key  = l.source_id || 'unknown'
      const name = (l.lead_sources as any)?.name || 'Unknown'
      if (!bySrc[key]) bySrc[key] = { name, total: 0, inPerson: 0, won: 0, contracted: 0, spend: 0 }
      bySrc[key].total++
      if (l.contact_type === 'in_person') bySrc[key].inPerson++
      if (WON_STAGES.includes(l.status)) bySrc[key].won++
    })
    // Revenue comes from revenue_events (dated by when won), same fix as the main period —
    // a source with a change order won this comparison month on an older lead still shows up.
    compareRevEvents.forEach((e: any) => {
      const key = e.source_id || 'unknown'
      if (!bySrc[key]) {
        const name = sources.find(s => s.id === e.source_id)?.name || 'Unknown'
        bySrc[key] = { name, total: 0, inPerson: 0, won: 0, contracted: 0, spend: 0 }
      }
      bySrc[key].contracted += Number(e.amount || 0)
    })
    compareSpend.forEach((s: any) => {
      const key = s.source_id || 'unknown'
      if (bySrc[key]) bySrc[key].spend += Number(s.amount_spent || 0)
    })
    return bySrc
  }, [compareLeads, compareRevEvents, compareSpend, sources])

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
    won: acc.won + s.won, contracted: acc.contracted + s.contracted,
  }), { total: 0, lsaCharged: 0, inPerson: 0, phoneQ: 0, won: 0, contracted: 0 })
  const paidApptAcqCost = paidTotals.inPerson > 0 && kpi.totalSpend > 0 ? kpi.totalSpend / paidTotals.inPerson : 0
  const paidProjAcqCost = paidTotals.won > 0 && kpi.totalSpend > 0 ? kpi.totalSpend / paidTotals.won : 0

  const insightsData: InsightData = useMemo(() => ({
    totalLeads: paidTotals.total, totalAppts: paidTotals.inPerson, totalPhoneQ: paidTotals.phoneQ,
    totalWon: paidTotals.won, totalContracted: paidTotals.contracted,
    totalSpend: kpi.totalSpend, period: periodLabel, viewMode: 'weekly',
    sources: paidSrcList.map(src => {
      const srcSpendRow = spendBySrc.find(s => s.source_id === src.id)
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
  const maxRev = Math.max(...paidSrcList.map(s => s.contracted), 1)

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

  const compareOptions = useMemo(() => {
    const opts: { label: string; m: number; y: number }[] = []
    for (let i = 1; i <= 24; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
      opts.push({ label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, m: d.getMonth(), y: d.getFullYear() })
    }
    return opts
  }, [])

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">

      {/* Header */}
      <KpiTabs />
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
              <ExpandMetric label="Total Revenue" value={fmt$(kpi.totalRev)} color="text-emerald-600">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Initial Job Revenue <span className="text-[11px]">(first job won per client)</span></span><span className="font-bold">{fmt$(kpi.initialJobRevenue)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Additional Job Revenue <span className="text-[11px]">(change orders + repeat clients)</span></span><span className="font-bold text-purple-600">{fmt$(kpi.additionalJobRevenue)}</span></div>
                  <div className="flex justify-between text-sm border-t border-border pt-2"><span className="text-muted-foreground">Collected (actual)</span><span className="font-bold text-emerald-600">{fmt$(kpi.actual)}</span></div>
                </div>
              </ExpandMetric>
            </div>
            <MetricCard label="Appt Acquisition Cost"
              value={kpi.apptAcqCost > 0 ? fmt$(kpi.apptAcqCost) : '—'}
              sub={kpi.totalSpend > 0 ? 'spend ÷ in-person appts' : 'log spend to calculate'} />
            <MetricCard label="Marketing Proj. Acq. Cost"
              value={kpi.projAcqCost > 0 ? fmt$(kpi.projAcqCost) : '—'}
              sub={kpi.totalSpend > 0 ? 'spend ÷ jobs closed' : 'log spend to calculate'} />
            <MetricCard label="Sales Closing Ratio"
              value={closeRatePct(kpi.wonCount, kpi.totalAppts)}
              sub={`${kpi.wonCount} won / ${kpi.totalAppts} appts`}
              color={kpi.wonCount > 0 && kpi.totalAppts > 0 && kpi.wonCount / kpi.totalAppts >= 0.3 ? 'text-emerald-600' : 'text-foreground'} />
          </div>

          {/* 3. YTD BLOCK */}
          <YTDBlock ytd={ytd} year={ytdYear} yearOptions={ytdYearOptions} onYearChange={setYtdYear} isCurrentYear={ytdYear === today.getFullYear()} />

          {/* 4. SOURCE PERFORMANCE — paid/marketing channels only. Referrals and repeat clients
              don't belong in a CAC/ROI table since there's no spend behind them to measure —
              see the Organic & Repeat Revenue tab (KPI Views ▾) for those. */}
          <Section title="Marketing Performance" badge={`${paidSrcList.length} paid sources`} defaultOpen>
            {paidSrcList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No paid-source leads for this period.</p>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Compare with:</p>
                  <select
                    value={compareMonth !== null ? `${compareYear}-${compareMonth}` : ''}
                    onChange={e => {
                      if (!e.target.value) { setCompareMonth(null); return; }
                      const [y, m] = e.target.value.split('-').map(Number)
                      setCompareYear(y); setCompareMonth(m);
                    }}
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none text-muted-foreground">
                    <option value="">— No comparison —</option>
                    {compareOptions.map(o => (
                      <option key={`${o.y}-${o.m}`} value={`${o.y}-${o.m}`}>{o.label}</option>
                    ))}
                  </select>
                  {compareMonth !== null && (
                    <span className="text-xs text-primary font-medium">
                      vs {MONTHS[compareMonth]} {compareYear}
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        {['Source','Leads','Charged','Appts','Phone Q','Closed','Close %','Revenue','Spend','Appt Cost','Proj Cost'].map(h => (
                          <th key={h} className="text-left text-xs text-muted-foreground font-semibold pb-2 pr-3 whitespace-nowrap">{h}</th>
                        ))}
                        {compareMonth !== null && (
                          <th className="text-left text-xs text-primary font-semibold pb-2 pr-3 whitespace-nowrap border-l border-primary/20 pl-3">
                            vs {MONTHS[compareMonth]}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {paidSrcList.map((src, i) => {
                        const srcKey   = src.id
                        const srcSpend = spendBySrc.filter(s => s.source_id === srcKey).reduce((sum, s) => sum + s.amount, 0)
                        const apptCost = src.inPerson > 0 && srcSpend > 0 ? srcSpend / src.inPerson : 0
                        const projCost = src.won > 0 && srcSpend > 0 ? srcSpend / src.won : 0
                        const srcAppts = src.inPerson + src.phoneQ
                        const cr       = srcAppts > 0 ? Math.round((src.won / srcAppts) * 100) : 0
                        const crColor  = cr >= 40 ? 'text-emerald-600 font-bold' : cr >= 20 ? 'text-yellow-600 font-bold' : 'text-red-500 font-bold'
                        const cmp      = compareBySrc[srcKey]
                        const leadDelta = cmp ? src.total - cmp.total : null
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
                            <td className="py-3 pr-3"><span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700 font-bold">{src.won}</span></td>
                            <td className={`py-3 pr-3 ${crColor}`}>{srcAppts > 0 ? cr + '%' : '—'}</td>
                            <td className="py-3 pr-3 font-bold text-emerald-600">{src.contracted > 0 ? fmt$(src.contracted) : '—'}</td>
                            <td className="py-3 pr-3 text-muted-foreground">{srcSpend > 0 ? fmt$(srcSpend) : '—'}</td>
                            <td className="py-3 pr-3 text-muted-foreground">{apptCost > 0 ? fmt$(apptCost) : '—'}</td>
                            <td className="py-3 pr-3 text-muted-foreground">{projCost > 0 ? fmt$(projCost) : '—'}</td>
                            {compareMonth !== null && (
                              <td className="py-3 pr-3 border-l border-primary/20 pl-3">
                                {leadDelta !== null ? (
                                  <span className={`text-xs font-semibold ${leadDelta > 0 ? 'text-emerald-600' : leadDelta < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                                    {leadDelta > 0 ? '+' : ''}{leadDelta} leads
                                    {cmp && <span className="text-muted-foreground font-normal ml-1">({cmp.total} prior)</span>}
                                  </span>
                                ) : <span className="text-xs text-muted-foreground">New</span>}
                              </td>
                            )}
                          </tr>
                        )
                      })}
                      <tr className="bg-muted/30 font-bold border-t-2 border-border">
                        <td className="py-2.5 pr-3 text-xs uppercase text-muted-foreground tracking-wide">Total</td>
                        <td className="py-2.5 pr-3">{paidTotals.total}</td>
                        <td className="py-2.5 pr-3">{paidTotals.lsaCharged}</td>
                        <td className="py-2.5 pr-3">{paidTotals.inPerson}</td>
                        <td className="py-2.5 pr-3">{paidTotals.phoneQ}</td>
                        <td className="py-2.5 pr-3">{paidTotals.won}</td>
                        <td className="py-2.5 pr-3">{closeRatePct(paidTotals.won, paidTotals.inPerson + paidTotals.phoneQ)}</td>
                        <td className="py-2.5 pr-3 text-emerald-600">{fmt$(paidTotals.contracted)}</td>
                        <td className="py-2.5 pr-3">{fmt$(kpi.totalSpend)}</td>
                        <td className="py-2.5 pr-3">{paidApptAcqCost > 0 ? fmt$(paidApptAcqCost) : '—'}</td>
                        <td className="py-2.5 pr-3">{paidProjAcqCost > 0 ? fmt$(paidProjAcqCost) : '—'}</td>
                        {compareMonth !== null && (
                          <td className="py-2.5 pr-3 border-l border-primary/20 pl-3">
                            <span className={`text-xs font-semibold ${paidTotals.total > compareLeads.length ? 'text-emerald-600' : 'text-red-500'}`}>
                              {paidTotals.total > compareLeads.length ? '+' : ''}{paidTotals.total - compareLeads.length} total
                            </span>
                          </td>
                        )}
                      </tr>
                    </tbody>
                  </table>
                </div>
                {paidSrcList.some(s => s.contracted > 0) && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Revenue by source</p>
                    <div className="space-y-2">
                      {paidSrcList.filter(s => s.contracted > 0).map((src, i) => (
                        <div key={src.name} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-28 truncate shrink-0">{src.name}</span>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ background: SRC_COLORS[i % SRC_COLORS.length], width: `${(src.contracted / maxRev) * 100}%` }} />
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
                      {['Name','Phone','Source','Salesperson','Contact Type','LSA Status','Stage','Contract Value','Date'].map(h => (
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
                      return (
                        <tr key={lead.id} className={`border-b border-border/40 hover:bg-muted/20 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                          <td className="py-2.5 pr-3 font-semibold whitespace-nowrap">{name}</td>
                          <td className="py-2.5 pr-3 text-muted-foreground text-xs">{lead.phone || '—'}</td>
                          <td className="py-2.5 pr-3"><span className="text-xs px-2 py-0.5 rounded-full bg-muted font-medium">{source}</span></td>
                          <td className="py-2.5 pr-3 text-muted-foreground">{salesperson}</td>
                          <td className="py-2.5 pr-3 text-muted-foreground text-xs">{contactType}</td>
                          <td className="py-2.5 pr-3 text-muted-foreground text-xs">{lsaStatus}</td>
                          <td className={`py-2.5 pr-3 text-xs ${stageColor}`}>{stageLabel}</td>
                          <td className="py-2.5 pr-3 font-semibold text-emerald-600">{lead.initial_contract_value > 0 ? fmt$(lead.initial_contract_value) : '—'}</td>
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
