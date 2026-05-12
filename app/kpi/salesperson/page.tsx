'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { ChevronLeft, ChevronRight, TrendingUp, Plus, Trash2, X, UserPlus } from 'lucide-react'
import KpiInsights, { InsightData } from '@/components/KpiInsights'

// ── Types ──────────────────────────────────────────────────────────────────
interface Salesperson { id: string; name: string }
interface LeadRow {
  id: string; status: string; contact_type: string | null;
  initial_contract_value: number; created_at: string;
  metadata: { salesperson?: string } | null;
  lead_sources: { name: string } | null;
}
interface PaymentRow { amount: number; paid_at: string; lead_id: string }

// ── Constants ──────────────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const WON_STAGES = ['closed_won', 'won']
const EST_STAGES = ['estimate_sent', 'closed_won', 'won', 'lost']
const PALETTE = [
  { bg: 'bg-blue-950/30',    border: 'border-blue-700',    text: 'text-blue-400',    bar: '#378ADD' },
  { bg: 'bg-purple-950/30',  border: 'border-purple-700',  text: 'text-purple-400',  bar: '#8b5cf6' },
  { bg: 'bg-emerald-950/30', border: 'border-emerald-700', text: 'text-emerald-400', bar: '#10b981' },
  { bg: 'bg-orange-950/30',  border: 'border-orange-700',  text: 'text-orange-400',  bar: '#f97316' },
  { bg: 'bg-pink-950/30',    border: 'border-pink-700',    text: 'text-pink-400',    bar: '#ec4899' },
]
const DEFAULT_PAL = { bg: 'bg-gray-800/50', border: 'border-gray-600', text: 'text-gray-400', bar: '#6b7280' }

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt$ = (n: number) => n >= 1000 ? '$' + (n/1000).toFixed(1).replace(/\.0$/,'') + 'k' : '$' + Math.round(n).toLocaleString()
const pct  = (a: number, b: number) => b === 0 ? '—' : Math.round((a/b)*100) + '%'

function getWeekRange(offset: number) {
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + offset * 7)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 7)
  return { start: monday.toISOString(), end: sunday.toISOString(), monday, sunday }
}

function fmtShort(d: Date) { return `${MONTHS[d.getMonth()]} ${d.getDate()}` }

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function SalespersonKPIPage() {
  const today = new Date()
  const router = useRouter()

  // ── View mode ──────────────────────────────────────────────────────────
  const [viewMode, setViewMode]     = useState<'monthly' | 'weekly'>('monthly')
  const [year, setYear]             = useState(today.getFullYear())
  const [month, setMonth]           = useState(today.getMonth())
  const [weekOffset, setWeekOffset] = useState(0)

  const [salespersons, setSalespersons] = useState<Salesperson[]>([])
  const [leads, setLeads]               = useState<LeadRow[]>([])
  const [payments, setPayments]         = useState<PaymentRow[]>([])
  const [trendLeads, setTrendLeads]     = useState<any[]>([])
  const [loading, setLoading]           = useState(true)

  const [showManager, setShowManager] = useState(false)
  const [newName, setNewName]         = useState('')
  const [saving, setSaving]           = useState(false)

  // ── Compute date range + label ─────────────────────────────────────────
  const { rangeStart, rangeEnd, periodLabel } = useMemo(() => {
    if (viewMode === 'monthly') {
      return {
        rangeStart:  new Date(year, month, 1).toISOString(),
        rangeEnd:    new Date(year, month + 1, 1).toISOString(),
        periodLabel: `${MONTHS[month]} ${year}`,
      }
    }
    const { start, end, monday, sunday } = getWeekRange(weekOffset)
    const label = weekOffset === 0
      ? `This week (${fmtShort(monday)} – ${fmtShort(sunday)})`
      : weekOffset === -1
      ? `Last week (${fmtShort(monday)} – ${fmtShort(sunday)})`
      : `${fmtShort(monday)} – ${fmtShort(sunday)}`
    return { rangeStart: start, rangeEnd: end, periodLabel: label }
  }, [viewMode, year, month, weekOffset])

  useEffect(() => { fetchAll() }, [rangeStart, rangeEnd])

  async function fetchAll() {
    setLoading(true)
    const trendStart = new Date(year, month - 5, 1).toISOString()
    const trendEnd   = new Date(year, month + 1, 1).toISOString()

    const [spRes, leadsRes, paymentsRes, trendRes] = await Promise.all([
      supabase.from('salespersons').select('id, name').order('name'),
      supabase.from('leads').select('id,status,contact_type,initial_contract_value,created_at,metadata,lead_sources(name)').gte('created_at', rangeStart).lt('created_at', rangeEnd).eq('archived', false),
      supabase.from('payments').select('amount,paid_at,lead_id').gte('paid_at', rangeStart).lt('paid_at', rangeEnd),
      supabase.from('leads').select('status,initial_contract_value,created_at,metadata').gte('created_at', trendStart).lt('created_at', trendEnd).eq('archived', false),
    ])

    setSalespersons(spRes.data || [])
    setLeads((leadsRes.data as any[]) || [])
    setPayments(paymentsRes.data || [])
    setTrendLeads(trendRes.data || [])
    setLoading(false)
  }

  // ── Add / Delete salesperson ───────────────────────────────────────────
  async function addSalesperson() {
    if (!newName.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('salespersons').insert({ name: newName.trim() }).select().single()
    if (!error && data) {
      setSalespersons(s => [...s, data].sort((a, b) => a.name.localeCompare(b.name)))
      setNewName('')
    } else if (error?.code === '23505') {
      alert(`"${newName.trim()}" already exists.`)
    }
    setSaving(false)
  }

  async function deleteSalesperson(id: string, name: string) {
    if (!confirm(`Remove "${name}" from salesperson list? Their past lead data is not affected.`)) return
    await supabase.from('salespersons').delete().eq('id', id)
    setSalespersons(s => s.filter(sp => sp.id !== id))
  }

  // ── Stats per salesperson ──────────────────────────────────────────────
  const spData = useMemo(() => {
    const payByLead: Record<string, number> = {}
    payments.forEach(p => { payByLead[p.lead_id] = (payByLead[p.lead_id] || 0) + Number(p.amount) })

    const statsMap: Record<string, {
      leads: number; inPerson: number; phoneQ: number; estimated: number;
      won: number; contracted: number; actual: number;
      sourceBreakdown: Record<string, number>
    }> = {}

    leads.forEach(l => {
      const rawSP = (l.metadata?.salesperson || '').trim()
      if (!rawSP) return
      const matched = salespersons.find(s => s.name.toLowerCase() === rawSP.toLowerCase())
      const spName = matched?.name || rawSP
      if (!statsMap[spName]) statsMap[spName] = { leads: 0, inPerson: 0, phoneQ: 0, estimated: 0, won: 0, contracted: 0, actual: 0, sourceBreakdown: {} }
      statsMap[spName].leads++
      if (l.contact_type === 'in_person')   statsMap[spName].inPerson++
      if (l.contact_type === 'phone_quote') statsMap[spName].phoneQ++
      if (EST_STAGES.includes(l.status))    statsMap[spName].estimated++
      if (WON_STAGES.includes(l.status)) {
        statsMap[spName].won++
        statsMap[spName].contracted += Number(l.initial_contract_value || 0)
        statsMap[spName].actual += payByLead[l.id] || 0
      }
      const src = (l.lead_sources as any)?.name || 'Unknown'
      statsMap[spName].sourceBreakdown[src] = (statsMap[spName].sourceBreakdown[src] || 0) + 1
    })

    return salespersons.map(sp => ({
      id: sp.id,
      name: sp.name,
      ...(statsMap[sp.name] || { leads: 0, inPerson: 0, phoneQ: 0, estimated: 0, won: 0, contracted: 0, actual: 0, sourceBreakdown: {} })
    }))
  }, [salespersons, leads, payments])

  // ── Insights data ──────────────────────────────────────────────────────
  const insightsData: InsightData = useMemo(() => ({
    totalLeads:      spData.reduce((s, sp) => s + sp.leads, 0),
    totalAppts:      spData.reduce((s, sp) => s + sp.inPerson, 0),
    totalPhoneQ:     spData.reduce((s, sp) => s + sp.phoneQ, 0),
    totalWon:        spData.reduce((s, sp) => s + sp.won, 0),
    totalContracted: spData.reduce((s, sp) => s + sp.contracted, 0),
    totalSpend:      0,
    period:          periodLabel,
    viewMode,
    salespersons:    spData,
  }), [spData, periodLabel, viewMode])

  // ── 6-month trend ──────────────────────────────────────────────────────
  const trendData = useMemo(() => {
    const tMap: Record<string, Record<string, number>> = {}
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - i, 1)
      tMap[`${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`] = {}
    }
    trendLeads.forEach((l: any) => {
      const d  = new Date(l.created_at)
      const k  = `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
      if (!tMap[k]) return
      const rawSP = (l.metadata?.salesperson || '').trim()
      if (!rawSP) return
      const matched = salespersons.find(s => s.name.toLowerCase() === rawSP.toLowerCase())
      const sp = matched?.name || rawSP
      tMap[k][sp + '_leads'] = (tMap[k][sp + '_leads'] || 0) + 1
      if (WON_STAGES.includes(l.status)) {
        tMap[k][sp + '_rev'] = (tMap[k][sp + '_rev'] || 0) + Number(l.initial_contract_value || 0)
      }
    })
    return Object.entries(tMap).map(([label, v]) => ({ label, ...v }))
  }, [trendLeads, salespersons, year, month])

  // ── Navigation ─────────────────────────────────────────────────────────
  function prevPeriod() {
    if (viewMode === 'monthly') {
      if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1)
    } else {
      setWeekOffset(w => w - 1)
    }
  }
  function nextPeriod() {
    if (viewMode === 'monthly') {
      if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1)
    } else {
      setWeekOffset(w => Math.min(w + 1, 0))
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">

      {/* ── Header ── */}
      <div className="sticky top-0 z-50 bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/kpi')}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-gray-700 hover:bg-gray-800 text-gray-400">
            ← KPI Dashboard
          </button>
          <div>
            <div className="text-white font-semibold">Salesperson Performance</div>
            <div className="text-gray-500 text-xs">Individual KPI breakdown</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowManager(v => !v)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors font-medium ${showManager ? 'bg-purple-700 border-purple-600 text-white' : 'border-gray-700 hover:bg-gray-800 text-gray-400'}`}>
            <UserPlus className="h-3.5 w-3.5" /> Manage Salespersons
          </button>

          {/* ── View toggle ── */}
          <div className="flex rounded-lg border border-gray-700 overflow-hidden">
            {(['monthly', 'weekly'] as const).map(v => (
              <button key={v} onClick={() => { setViewMode(v); setWeekOffset(0) }}
                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${viewMode === v ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                {v}
              </button>
            ))}
          </div>

          {/* ── Period nav ── */}
          <div className="flex items-center gap-1 rounded-lg border border-gray-700 px-2 py-1">
            <button onClick={prevPeriod} className="p-1 hover:bg-gray-800 rounded"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-xs font-medium w-52 text-center text-white">{periodLabel}</span>
            <button onClick={nextPeriod}
              disabled={viewMode === 'weekly' && weekOffset === 0}
              className="p-1 hover:bg-gray-800 rounded disabled:opacity-30">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* ── Salesperson Manager ── */}
        {showManager && (
          <div className="bg-gray-900 rounded-xl border-2 border-purple-800 overflow-hidden">
            <div className="px-6 py-3 border-b border-gray-800 bg-purple-900/20 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-purple-300">Manage Salespersons</h2>
                <p className="text-xs text-gray-500 mt-0.5">Add or remove salespersons. All registered names always appear on this page, even with 0 leads.</p>
              </div>
              <button onClick={() => setShowManager(false)} className="text-gray-500 hover:text-gray-300">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6">
              <div className="flex gap-2 mb-5">
                <input
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-purple-500 placeholder-gray-600"
                  placeholder="Enter salesperson name (e.g. Ron, Ray, Carlos...)"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSalesperson()}
                />
                <button onClick={addSalesperson} disabled={saving || !newName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white rounded-lg text-sm font-medium disabled:opacity-40 transition-colors">
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>
              {salespersons.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No salespersons added yet.</p>
              ) : (
                <div className="space-y-2">
                  {salespersons.map((sp, i) => {
                    const c = PALETTE[i] || DEFAULT_PAL
                    const stats = spData.find(s => s.id === sp.id)
                    return (
                      <div key={sp.id} className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-3 border border-gray-700">
                        <div className={`w-8 h-8 rounded-full border-2 ${c.border} flex items-center justify-center text-sm font-bold ${c.text}`}>
                          {sp.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="flex-1 font-medium text-white">{sp.name}</span>
                        <span className="text-xs text-gray-500">{stats?.leads || 0} leads this period</span>
                        <button onClick={() => deleteSalesperson(sp.id, sp.name)}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 text-red-400 hover:text-red-300 border border-red-900 hover:border-red-700 rounded-lg transition-colors">
                          <Trash2 className="h-3 w-3" /> Remove
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              <p className="text-xs text-gray-600 mt-4 border-t border-gray-800 pt-3">
                ⚠️ Make sure lead records use the exact same name spelling (e.g. "Ron" not "ron" or "Ronald"). Names are matched case-insensitively.
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24 text-gray-500">Loading...</div>
        ) : salespersons.length === 0 ? (
          <div className="text-center py-24 text-gray-500">
            <p className="text-lg mb-2">No salespersons added yet.</p>
            <button onClick={() => setShowManager(true)}
              className="text-sm px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white rounded-lg mt-2">
              + Add Salespersons
            </button>
          </div>
        ) : (
          <>
            {/* ── Summary banner ── */}
            <div className={`grid gap-4 ${spData.length === 1 ? 'grid-cols-1 max-w-sm' : spData.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {spData.map((sp, i) => {
                const c = PALETTE[i] || DEFAULT_PAL
                return (
                  <div key={sp.id} className={`rounded-xl border-2 ${c.border} bg-gray-900 px-5 py-4 flex items-center gap-4`}>
                    <div className={`w-12 h-12 rounded-full border-2 ${c.border} flex items-center justify-center text-xl font-bold ${c.text} flex-shrink-0`}>
                      {sp.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-bold text-lg ${c.text}`}>{sp.name}</div>
                      <div className="text-xs text-gray-500">{sp.leads} leads · {sp.won} won</div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold text-xl ${c.text}`}>{fmt$(sp.contracted)}</div>
                      <div className="text-xs text-gray-500">contracted</div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── Individual cards ── */}
            <div className={`grid gap-4 ${spData.length === 1 ? 'grid-cols-1 max-w-md mx-auto' : spData.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {spData.map((sp, i) => {
                const c = PALETTE[i] || DEFAULT_PAL
                return (
                  <div key={sp.id} className={`rounded-xl border-2 ${c.border} ${c.bg} p-5`}>
                    <div className="flex items-center gap-3 mb-5">
                      <div className={`w-10 h-10 rounded-full border-2 ${c.border} flex items-center justify-center text-lg font-bold ${c.text}`}>
                        {sp.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className={`font-bold text-lg ${c.text}`}>{sp.name}</div>
                        <div className="text-xs text-gray-500">{periodLabel}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mb-5">
                      <Stat label="Leads"     value={sp.leads} />
                      <Stat label="In-Person" value={sp.inPerson} />
                      <Stat label="Phone Q"   value={sp.phoneQ} />
                      <Stat label="Estimates" value={sp.estimated} />
                      <Stat label="Won"       value={sp.won} />
                      <Stat label="Close %"   value={pct(sp.won, sp.leads)} />
                    </div>

                    <div className="space-y-3 mb-5">
                      {[
                        { label: 'Overall close rate',   a: sp.won, b: sp.leads },
                        { label: 'In-person close rate', a: sp.won, b: sp.inPerson },
                        { label: 'Estimate close rate',  a: sp.won, b: sp.estimated },
                      ].map(bar => (
                        <div key={bar.label}>
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>{bar.label}</span>
                            <span className={c.text}>{pct(bar.a, bar.b)}</span>
                          </div>
                          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all"
                              style={{ background: c.bar, width: `${bar.b > 0 ? Math.min((bar.a/bar.b)*100, 100) : 0}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2 border-t border-gray-700/50 pt-4 mb-4">
                      <div className="bg-gray-900/60 rounded-lg p-3 text-center">
                        <div className="text-xs text-gray-500 mb-1">Contracted</div>
                        <div className={`font-bold ${c.text}`}>{fmt$(sp.contracted)}</div>
                      </div>
                      <div className="bg-gray-900/60 rounded-lg p-3 text-center">
                        <div className="text-xs text-gray-500 mb-1">Collected</div>
                        <div className="font-bold text-white">{fmt$(sp.actual)}</div>
                      </div>
                    </div>

                    {Object.keys(sp.sourceBreakdown).length > 0 ? (
                      <div className="border-t border-gray-700/50 pt-4">
                        <div className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Leads by source</div>
                        <div className="space-y-1">
                          {Object.entries(sp.sourceBreakdown).sort((a,b) => b[1]-a[1]).map(([src, count]) => (
                            <div key={src} className="flex justify-between text-xs">
                              <span className="text-gray-400 truncate">{src}</span>
                              <span className={`font-medium ${c.text}`}>{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="border-t border-gray-700/50 pt-4 text-center text-xs text-gray-600">
                        No leads assigned for {periodLabel}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* ── AI Insights ── */}
            <KpiInsights
              label="Salesperson Performance Analysis"
              data={insightsData}
            />

            {/* ── Head-to-head table ── */}
            {spData.length > 1 && (
              <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <div className="px-6 py-3 border-b border-gray-800 bg-gray-800/50">
                  <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Head-to-Head — {periodLabel}</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Metric</th>
                        {spData.map((sp, i) => {
                          const c = PALETTE[i] || DEFAULT_PAL
                          return <th key={sp.id} className={`text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide ${c.text}`}>{sp.name}</th>
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'Total Leads',       fn: (s: typeof spData[0]) => s.leads },
                        { label: 'In-Person',         fn: (s: typeof spData[0]) => s.inPerson },
                        { label: 'Phone Quotes',      fn: (s: typeof spData[0]) => s.phoneQ },
                        { label: 'Estimates Sent',    fn: (s: typeof spData[0]) => s.estimated },
                        { label: 'Closed Won',        fn: (s: typeof spData[0]) => s.won },
                        { label: 'Close Rate',        fn: (s: typeof spData[0]) => pct(s.won, s.leads) },
                        { label: 'In-Person Close %', fn: (s: typeof spData[0]) => pct(s.won, s.inPerson) },
                        { label: 'Estimate Close %',  fn: (s: typeof spData[0]) => pct(s.won, s.estimated) },
                        { label: 'Contracted Rev',    fn: (s: typeof spData[0]) => fmt$(s.contracted) },
                        { label: 'Collected Rev',     fn: (s: typeof spData[0]) => fmt$(s.actual) },
                        { label: 'Rev / Won Job',     fn: (s: typeof spData[0]) => s.won > 0 ? fmt$(s.contracted/s.won) : '—' },
                      ].map((row, ri) => (
                        <tr key={row.label} className={`border-b border-gray-800/50 hover:bg-gray-800/20 ${ri % 2 === 0 ? '' : 'bg-gray-800/10'}`}>
                          <td className="px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">{row.label}</td>
                          {spData.map((sp, i) => {
                            const c = PALETTE[i] || DEFAULT_PAL
                            return <td key={sp.id} className={`px-5 py-3 font-semibold ${c.text}`}>{row.fn(sp)}</td>
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── 6-month trend (monthly only) ── */}
            {viewMode === 'monthly' && (
              <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <div className="px-6 py-3 border-b border-gray-800 bg-gray-800/50 flex items-center gap-3">
                  <TrendingUp className="h-4 w-4 text-gray-400" />
                  <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">6-Month — Contracted Revenue</h2>
                  <div className="ml-auto flex gap-4">
                    {spData.map((sp, i) => {
                      const c = PALETTE[i] || DEFAULT_PAL
                      return (
                        <div key={sp.id} className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: c.bar }} />
                          <span className="text-xs text-gray-400">{sp.name}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="p-6">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={trendData} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={v => '$'+(v/1000).toFixed(0)+'k'} />
                      <Tooltip
                        contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                        labelStyle={{ color: '#f9fafb', fontSize: 12 }}
                        formatter={(v: number) => fmt$(v)}
                      />
                      {spData.map((sp, i) => {
                        const c = PALETTE[i] || DEFAULT_PAL
                        return <Bar key={sp.id} dataKey={sp.name + '_rev'} name={sp.name} fill={c.bar} radius={[3,3,0,0]} />
                      })}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

          </>
        )}
      </div>
    </div>
  )
}