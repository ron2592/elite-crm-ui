'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { ChevronLeft, ChevronRight, LayoutDashboard, TrendingUp } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────
interface LeadRow {
  id: string; status: string; contact_type: string | null;
  initial_contract_value: number; created_at: string;
  metadata: { salesperson?: string } | null;
  lead_sources: { name: string } | null;
}
interface PaymentRow { amount: number; paid_at: string; lead_id: string }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const WON_STAGES = ['closed_won', 'won']
const ESTIMATED_STAGES = ['estimate_sent', 'closed_won', 'won', 'lost']

const SP_COLORS: Record<string, { bg: string; border: string; text: string; bar: string }> = {
  Ron:             { bg: 'bg-blue-950/30',   border: 'border-blue-700',   text: 'text-blue-400',   bar: '#378ADD' },
  Ray:             { bg: 'bg-purple-950/30', border: 'border-purple-700', text: 'text-purple-400', bar: '#8b5cf6' },
  'Other (Phone)': { bg: 'bg-gray-800/50',   border: 'border-gray-600',   text: 'text-gray-400',   bar: '#6b7280' },
}
const DEFAULT_COLOR = { bg: 'bg-gray-800/50', border: 'border-gray-600', text: 'text-gray-400', bar: '#6b7280' }

function fmt$(n: number) {
  if (n >= 1000) return '$' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return '$' + Math.round(n).toLocaleString()
}
function pct(a: number, b: number) { return b === 0 ? '—' : Math.round((a / b) * 100) + '%' }

function monthRange(year: number, month: number) {
  return { start: new Date(year, month, 1).toISOString(), end: new Date(year, month + 1, 1).toISOString() }
}

// ── Stat Box ──────────────────────────────────────────────────────────────
function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-600 mt-0.5">{sub}</div>}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function SalespersonKPIPage() {
  const today = new Date()
  const router = useRouter()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const [leads, setLeads]       = useState<LeadRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [trend, setTrend]       = useState<{ label: string; [key: string]: any }[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => { fetchAll() }, [year, month])

  async function fetchAll() {
    setLoading(true)
    const { start, end } = monthRange(year, month)
    const trendStart = new Date(year, month - 5, 1).toISOString()

    const [leadsRes, paymentsRes, trendLeadsRes] = await Promise.all([
      supabase.from('leads').select('id,status,contact_type,initial_contract_value,created_at,metadata,lead_sources(name)').gte('created_at', start).lt('created_at', end).eq('archived', false),
      supabase.from('payments').select('amount,paid_at,lead_id').gte('paid_at', start).lt('paid_at', end),
      supabase.from('leads').select('status,initial_contract_value,created_at,metadata').gte('created_at', trendStart).lt('created_at', end).eq('archived', false),
    ])

    // Build 6-month trend per salesperson
    const tMap: Record<string, { contracted: number; leads: number; won: number }> = {}
    const salespersons = new Set<string>()

    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - i, 1)
      tMap[`${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`] = { contracted: 0, leads: 0, won: 0 }
    }

    ;(trendLeadsRes.data || []).forEach((l: any) => {
      const sp = l.metadata?.salesperson
      if (sp) salespersons.add(sp)
    })

    // Build per-SP per-month data
    const spMonthMap: Record<string, Record<string, { leads: number; won: number; contracted: number }>> = {}
    ;(trendLeadsRes.data || []).forEach((l: any) => {
      const sp = l.metadata?.salesperson || 'Unknown'
      const d  = new Date(l.created_at)
      const k  = `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
      if (!spMonthMap[sp]) spMonthMap[sp] = {}
      if (!spMonthMap[sp][k]) spMonthMap[sp][k] = { leads: 0, won: 0, contracted: 0 }
      spMonthMap[sp][k].leads++
      if (WON_STAGES.includes(l.status)) {
        spMonthMap[sp][k].won++
        spMonthMap[sp][k].contracted += Number(l.initial_contract_value || 0)
      }
    })

    const trendData = Object.keys(tMap).map(label => {
      const row: Record<string, any> = { label }
      Array.from(salespersons).forEach(sp => {
        row[sp + '_leads']      = spMonthMap[sp]?.[label]?.leads || 0
        row[sp + '_contracted'] = spMonthMap[sp]?.[label]?.contracted || 0
      })
      return row
    })

    setLeads((leadsRes.data as any[]) || [])
    setPayments(paymentsRes.data || [])
    setTrend(trendData)
    setLoading(false)
  }

  // ── Per-salesperson data ──────────────────────────────────────────────
  const spData = useMemo(() => {
    const map: Record<string, {
      name: string; leads: number; inPerson: number; phoneQ: number;
      estimated: number; won: number; contracted: number; actual: number;
      sourceBreakdown: Record<string, number>
    }> = {}

    const payByLead: Record<string, number> = {}
    payments.forEach(p => { payByLead[p.lead_id] = (payByLead[p.lead_id] || 0) + Number(p.amount) })

    leads.forEach(l => {
      const sp = l.metadata?.salesperson || 'Unknown'
      if (!map[sp]) map[sp] = { name: sp, leads: 0, inPerson: 0, phoneQ: 0, estimated: 0, won: 0, contracted: 0, actual: 0, sourceBreakdown: {} }
      map[sp].leads++
      if (l.contact_type === 'in_person')   map[sp].inPerson++
      if (l.contact_type === 'phone_quote') map[sp].phoneQ++
      if (ESTIMATED_STAGES.includes(l.status)) map[sp].estimated++
      if (WON_STAGES.includes(l.status)) {
        map[sp].won++
        map[sp].contracted += Number(l.initial_contract_value || 0)
        map[sp].actual += payByLead[l.id] || 0
      }
      const srcName = (l.lead_sources as any)?.name || 'Unknown'
      map[sp].sourceBreakdown[srcName] = (map[sp].sourceBreakdown[srcName] || 0) + 1
    })

    return Object.values(map).sort((a, b) => b.contracted - a.contracted)
  }, [leads, payments])

  const allSalespersons = spData.map(s => s.name)

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  const monthLabel = `${MONTHS[month]} ${year}`

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">

      {/* Header */}
      <div className="sticky top-0 z-50 bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/kpi')}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-gray-700 hover:bg-gray-800 text-gray-400 transition-colors">
            ← KPI Dashboard
          </button>
          <div>
            <div className="text-white font-semibold text-sm">Salesperson Performance</div>
            <div className="text-gray-500 text-xs">Individual KPI breakdown</div>
          </div>
        </div>
        {/* Month nav */}
        <div className="flex items-center gap-1 rounded-lg border border-gray-700 px-2 py-1">
          <button onClick={prevMonth} className="p-1 hover:bg-gray-800 rounded transition-colors"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-medium w-24 text-center text-white">{monthLabel}</span>
          <button onClick={nextMonth} className="p-1 hover:bg-gray-800 rounded transition-colors"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {loading ? (
          <div className="flex items-center justify-center py-24 text-gray-500">Loading...</div>
        ) : spData.length === 0 ? (
          <div className="text-center py-24 text-gray-500">No salesperson data for {monthLabel}.</div>
        ) : (
          <>
            {/* ── Side-by-side comparison cards ── */}
            <div className={`grid gap-4 ${spData.length === 1 ? 'grid-cols-1 max-w-md' : spData.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {spData.map(sp => {
                const c = SP_COLORS[sp.name] || DEFAULT_COLOR
                return (
                  <div key={sp.name} className={`rounded-xl border-2 ${c.border} ${c.bg} p-5`}>
                    {/* Name + avatar */}
                    <div className="flex items-center gap-3 mb-5">
                      <div className={`w-10 h-10 rounded-full border-2 ${c.border} flex items-center justify-center text-lg font-bold ${c.text}`}>
                        {sp.name.charAt(0)}
                      </div>
                      <div>
                        <div className={`font-bold text-lg ${c.text}`}>{sp.name}</div>
                        <div className="text-xs text-gray-500">{monthLabel}</div>
                      </div>
                      <div className="ml-auto text-right">
                        <div className="text-xs text-gray-500">Contracted</div>
                        <div className={`font-bold text-lg ${c.text}`}>{fmt$(sp.contracted)}</div>
                      </div>
                    </div>

                    {/* Main stats grid */}
                    <div className="grid grid-cols-3 gap-3 mb-5">
                      <Stat label="Leads"     value={sp.leads} />
                      <Stat label="In-Person" value={sp.inPerson} />
                      <Stat label="Phone Q"   value={sp.phoneQ} />
                      <Stat label="Estimates" value={sp.estimated} />
                      <Stat label="Won"       value={sp.won} />
                      <Stat label="Close %"   value={pct(sp.won, sp.leads)} />
                    </div>

                    {/* Progress bars */}
                    <div className="space-y-3 mb-5">
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Overall close rate</span>
                          <span className={c.text}>{pct(sp.won, sp.leads)}</span>
                        </div>
                        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ background: c.bar, width: `${sp.leads > 0 ? Math.min((sp.won/sp.leads)*100, 100) : 0}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>In-person close rate</span>
                          <span className={c.text}>{pct(sp.won, sp.inPerson)}</span>
                        </div>
                        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ background: c.bar, width: `${sp.inPerson > 0 ? Math.min((sp.won/sp.inPerson)*100, 100) : 0}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Estimate close rate</span>
                          <span className={c.text}>{pct(sp.won, sp.estimated)}</span>
                        </div>
                        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ background: c.bar, width: `${sp.estimated > 0 ? Math.min((sp.won/sp.estimated)*100, 100) : 0}%` }} />
                        </div>
                      </div>
                    </div>

                    {/* Revenue */}
                    <div className="grid grid-cols-2 gap-2 pt-4 border-t border-gray-700/50">
                      <div className="bg-gray-900/50 rounded-lg p-3 text-center">
                        <div className="text-xs text-gray-500 mb-1">Contracted</div>
                        <div className={`font-bold ${c.text}`}>{fmt$(sp.contracted)}</div>
                      </div>
                      <div className="bg-gray-900/50 rounded-lg p-3 text-center">
                        <div className="text-xs text-gray-500 mb-1">Collected</div>
                        <div className="font-bold text-white">{fmt$(sp.actual)}</div>
                      </div>
                    </div>

                    {/* Source breakdown */}
                    {Object.keys(sp.sourceBreakdown).length > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-700/50">
                        <div className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Leads by source</div>
                        <div className="space-y-1">
                          {Object.entries(sp.sourceBreakdown).sort((a,b) => b[1]-a[1]).map(([src, count]) => (
                            <div key={src} className="flex items-center justify-between text-xs">
                              <span className="text-gray-400 truncate max-w-[130px]">{src}</span>
                              <span className={`font-medium ${c.text}`}>{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* ── Head-to-head summary table ── */}
            {spData.length > 1 && (
              <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <div className="px-6 py-3 border-b border-gray-800 bg-gray-800/50">
                  <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Head-to-Head — {monthLabel}</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        {['Metric', ...spData.map(s => s.name)].map(h => (
                          <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'Total Leads',       fn: (s: typeof spData[0]) => s.leads },
                        { label: 'In-Person Visits',  fn: (s: typeof spData[0]) => s.inPerson },
                        { label: 'Phone Quotes',      fn: (s: typeof spData[0]) => s.phoneQ },
                        { label: 'Estimates Sent',    fn: (s: typeof spData[0]) => s.estimated },
                        { label: 'Closed Won',        fn: (s: typeof spData[0]) => s.won },
                        { label: 'Close Rate',        fn: (s: typeof spData[0]) => pct(s.won, s.leads) },
                        { label: 'In-Person Close %', fn: (s: typeof spData[0]) => pct(s.won, s.inPerson) },
                        { label: 'Contracted Rev',    fn: (s: typeof spData[0]) => fmt$(s.contracted) },
                        { label: 'Collected Rev',     fn: (s: typeof spData[0]) => fmt$(s.actual) },
                        { label: 'Rev / Won Job',     fn: (s: typeof spData[0]) => s.won > 0 ? fmt$(s.contracted / s.won) : '—' },
                      ].map((row, i) => (
                        <tr key={row.label} className={`border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-800/10'}`}>
                          <td className="px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">{row.label}</td>
                          {spData.map(sp => {
                            const c = SP_COLORS[sp.name] || DEFAULT_COLOR
                            return (
                              <td key={sp.name} className={`px-5 py-3 font-semibold ${c.text}`}>
                                {row.fn(sp)}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── 6-Month trend ── */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="px-6 py-3 border-b border-gray-800 bg-gray-800/50 flex items-center gap-3">
                <TrendingUp className="h-4 w-4 text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">6-Month Trend — Contracted Revenue</h2>
                <div className="ml-auto flex gap-4">
                  {allSalespersons.map(sp => {
                    const c = SP_COLORS[sp] || DEFAULT_COLOR
                    return (
                      <div key={sp} className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: c.bar }} />
                        <span className="text-xs text-gray-400">{sp}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="p-6">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={trend} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={v => '$' + (v/1000).toFixed(0) + 'k'} />
                    <Tooltip
                      contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                      labelStyle={{ color: '#f9fafb', fontSize: 12 }}
                      formatter={(v: number) => fmt$(v)}
                    />
                    {allSalespersons.map(sp => {
                      const c = SP_COLORS[sp] || DEFAULT_COLOR
                      return (
                        <Bar key={sp} dataKey={sp + '_contracted'} name={sp} fill={c.bar} radius={[3,3,0,0]} />
                      )
                    })}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </>
        )}
      </div>
    </div>
  )
}