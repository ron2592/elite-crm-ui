'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react'

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

// Auto-assign colors based on index — fully dynamic, no hardcoded names
const PALETTE = [
  { bg: 'bg-blue-950/30',   border: 'border-blue-700',   text: 'text-blue-400',   bar: '#378ADD' },
  { bg: 'bg-purple-950/30', border: 'border-purple-700', text: 'text-purple-400', bar: '#8b5cf6' },
  { bg: 'bg-emerald-950/30',border: 'border-emerald-700',text: 'text-emerald-400',bar: '#10b981' },
  { bg: 'bg-orange-950/30', border: 'border-orange-700', text: 'text-orange-400', bar: '#f97316' },
  { bg: 'bg-pink-950/30',   border: 'border-pink-700',   text: 'text-pink-400',   bar: '#ec4899' },
]
const DEFAULT_PAL = { bg: 'bg-gray-800/50', border: 'border-gray-600', text: 'text-gray-400', bar: '#6b7280' }

function fmt$(n: number) {
  if (n >= 1000) return '$' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return '$' + Math.round(n).toLocaleString()
}
function pct(a: number, b: number) { return b === 0 ? '—' : Math.round((a / b) * 100) + '%' }

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
    </div>
  )
}

export default function SalespersonKPIPage() {
  const today = new Date()
  const router = useRouter()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const [leads, setLeads]       = useState<LeadRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [trendLeads, setTrendLeads] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => { fetchAll() }, [year, month])

  async function fetchAll() {
    setLoading(true)
    const start = new Date(year, month, 1).toISOString()
    const end   = new Date(year, month + 1, 1).toISOString()
    const trendStart = new Date(year, month - 5, 1).toISOString()

    const [leadsRes, paymentsRes, trendRes] = await Promise.all([
      supabase.from('leads').select('id,status,contact_type,initial_contract_value,created_at,metadata,lead_sources(name)').gte('created_at', start).lt('created_at', end).eq('archived', false),
      supabase.from('payments').select('amount,paid_at,lead_id').gte('paid_at', start).lt('paid_at', end),
      supabase.from('leads').select('status,initial_contract_value,created_at,metadata').gte('created_at', trendStart).lt('created_at', end).eq('archived', false),
    ])

    setLeads((leadsRes.data as any[]) || [])
    setPayments(paymentsRes.data || [])
    setTrendLeads(trendRes.data || [])
    setLoading(false)
  }

  // ── Per-salesperson data ──────────────────────────────────────────────
  const { spData, allSP } = useMemo(() => {
    const map: Record<string, {
      name: string; leads: number; inPerson: number; phoneQ: number;
      estimated: number; won: number; contracted: number; actual: number;
      sourceBreakdown: Record<string, number>
    }> = {}

    const payByLead: Record<string, number> = {}
    payments.forEach(p => { payByLead[p.lead_id] = (payByLead[p.lead_id] || 0) + Number(p.amount) })

    leads.forEach(l => {
      // Pull salesperson — handle null/undefined/empty
      const sp = (l.metadata?.salesperson || '').trim() || 'Unassigned'
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

    const spData = Object.values(map).sort((a, b) => b.leads - a.leads)
    const allSP = spData.map(s => s.name)
    return { spData, allSP }
  }, [leads, payments])

  // ── 6-month trend per salesperson ────────────────────────────────────
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
      const sp = (l.metadata?.salesperson || '').trim() || 'Unassigned'
      if (!tMap[k][sp]) tMap[k][sp] = 0
      if (WON_STAGES.includes(l.status)) tMap[k][sp + '_rev'] = (tMap[k][sp + '_rev'] || 0) + Number(l.initial_contract_value || 0)
      tMap[k][sp + '_leads'] = (tMap[k][sp + '_leads'] || 0) + 1
    })

    return Object.entries(tMap).map(([label, v]) => ({ label, ...v }))
  }, [trendLeads, year, month])

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
            <div className="text-white font-semibold">Salesperson Performance</div>
            <div className="text-gray-500 text-xs">Individual KPI breakdown</div>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-gray-700 px-2 py-1">
          <button onClick={prevMonth} className="p-1 hover:bg-gray-800 rounded"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-medium w-24 text-center text-white">{monthLabel}</span>
          <button onClick={nextMonth} className="p-1 hover:bg-gray-800 rounded"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {loading ? (
          <div className="flex items-center justify-center py-24 text-gray-500">Loading...</div>
        ) : spData.length === 0 ? (
          <div className="text-center py-24 text-gray-500">
            <p>No leads found for {monthLabel}.</p>
            <p className="text-xs mt-2">Make sure salesperson is set in lead metadata.</p>
          </div>
        ) : (
          <>
            {/* ── Summary banner ── */}
            <div className="grid grid-cols-3 gap-4">
              {spData.map((sp, i) => {
                const c = PALETTE[i] || DEFAULT_PAL
                return (
                  <div key={sp.name} className={`rounded-xl border-2 ${c.border} bg-gray-900 px-5 py-4 flex items-center gap-4`}>
                    <div className={`w-12 h-12 rounded-full border-2 ${c.border} flex items-center justify-center text-xl font-bold ${c.text}`}>
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
                const metrics = [
                  { label: 'Leads',    value: sp.leads },
                  { label: 'In-Person',value: sp.inPerson },
                  { label: 'Phone Q',  value: sp.phoneQ },
                  { label: 'Estimates',value: sp.estimated },
                  { label: 'Won',      value: sp.won },
                  { label: 'Close %',  value: pct(sp.won, sp.leads) },
                ]
                const bars = [
                  { label: 'Overall close rate',   won: sp.won, total: sp.leads },
                  { label: 'In-person close rate',  won: sp.won, total: sp.inPerson },
                  { label: 'Estimate close rate',   won: sp.won, total: sp.estimated },
                ]
                return (
                  <div key={sp.name} className={`rounded-xl border-2 ${c.border} ${c.bg} p-5`}>
                    <div className="flex items-center gap-3 mb-5">
                      <div className={`w-10 h-10 rounded-full border-2 ${c.border} flex items-center justify-center text-lg font-bold ${c.text}`}>
                        {sp.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className={`font-bold text-lg ${c.text}`}>{sp.name}</div>
                        <div className="text-xs text-gray-500">{monthLabel}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mb-5">
                      {metrics.map(m => <Stat key={m.label} label={m.label} value={m.value} />)}
                    </div>

                    <div className="space-y-3 mb-5">
                      {bars.map(b => (
                        <div key={b.label}>
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>{b.label}</span>
                            <span className={c.text}>{pct(b.won, b.total)}</span>
                          </div>
                          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ background: c.bar, width: `${b.total > 0 ? Math.min((b.won/b.total)*100, 100) : 0}%` }} />
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

                    {Object.keys(sp.sourceBreakdown).length > 0 && (
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
                    )}
                  </div>
                )
              })}
            </div>

            {/* ── Head-to-head table ── */}
            {spData.length > 1 && (
              <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <div className="px-6 py-3 border-b border-gray-800 bg-gray-800/50">
                  <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Head-to-Head — {monthLabel}</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Metric</th>
                        {spData.map((sp, i) => {
                          const c = PALETTE[i] || DEFAULT_PAL
                          return <th key={sp.name} className={`text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide ${c.text}`}>{sp.name}</th>
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'Total Leads',        fn: (s: typeof spData[0]) => s.leads },
                        { label: 'In-Person Visits',   fn: (s: typeof spData[0]) => s.inPerson },
                        { label: 'Phone Quotes',       fn: (s: typeof spData[0]) => s.phoneQ },
                        { label: 'Estimates Sent',     fn: (s: typeof spData[0]) => s.estimated },
                        { label: 'Closed Won',         fn: (s: typeof spData[0]) => s.won },
                        { label: 'Close Rate',         fn: (s: typeof spData[0]) => pct(s.won, s.leads) },
                        { label: 'In-Person Close %',  fn: (s: typeof spData[0]) => pct(s.won, s.inPerson) },
                        { label: 'Estimate Close %',   fn: (s: typeof spData[0]) => pct(s.won, s.estimated) },
                        { label: 'Contracted Rev',     fn: (s: typeof spData[0]) => fmt$(s.contracted) },
                        { label: 'Collected Rev',      fn: (s: typeof spData[0]) => fmt$(s.actual) },
                        { label: 'Rev / Won Job',      fn: (s: typeof spData[0]) => s.won > 0 ? fmt$(s.contracted / s.won) : '—' },
                      ].map((row, ri) => (
                        <tr key={row.label} className={`border-b border-gray-800/50 hover:bg-gray-800/20 ${ri % 2 === 0 ? '' : 'bg-gray-800/10'}`}>
                          <td className="px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">{row.label}</td>
                          {spData.map((sp, i) => {
                            const c = PALETTE[i] || DEFAULT_PAL
                            return <td key={sp.name} className={`px-5 py-3 font-semibold ${c.text}`}>{row.fn(sp)}</td>
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── 6-month trend ── */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="px-6 py-3 border-b border-gray-800 bg-gray-800/50 flex items-center gap-3">
                <TrendingUp className="h-4 w-4 text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">6-Month — Contracted Revenue</h2>
                <div className="ml-auto flex gap-4">
                  {allSP.map((sp, i) => {
                    const c = PALETTE[i] || DEFAULT_PAL
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
                  <BarChart data={trendData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={v => '$' + (v/1000).toFixed(0) + 'k'} />
                    <Tooltip
                      contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                      labelStyle={{ color: '#f9fafb', fontSize: 12 }}
                      formatter={(v: number) => fmt$(v)}
                    />
                    {allSP.map((sp, i) => {
                      const c = PALETTE[i] || DEFAULT_PAL
                      return <Bar key={sp} dataKey={sp + '_rev'} name={sp} fill={c.bar} radius={[3,3,0,0]} />
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