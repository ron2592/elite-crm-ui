'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { ChevronLeft, LayoutDashboard, Loader2, Users, Repeat } from 'lucide-react'

const WON_STAGES = ['closed_won', 'won', 'completed', 'completed_with_balance']

interface RevEvent {
  lead_id: string; source_id: string | null; event_type: 'initial_contract' | 'change_order'
  event_date: string; amount: number; contact_id: string | null; is_repeat_business: boolean
}
interface LeadRow { id: string; source_id: string | null; contact_type: string | null; status: string }
interface LeadSource { id: string; name: string }
interface Contact { id: string; full_name: string; phone: string | null }

function fmt$(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${m}-${day}-${y}`
}
function todayStr() { return new Date().toISOString().split('T')[0] }
function firstOfMonthStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function OrganicRevenuePage() {
  const router = useRouter()

  const [dateFrom, setDateFrom] = useState(firstOfMonthStr())
  const [dateTo,   setDateTo]   = useState(todayStr())
  const [loading,  setLoading]  = useState(true)

  const [revEvents,   setRevEvents]   = useState<RevEvent[]>([])
  const [leads,        setLeads]        = useState<LeadRow[]>([])
  const [sources,      setSources]      = useState<LeadSource[]>([])
  const [paidSourceIds, setPaidSourceIds] = useState<Set<string>>(new Set())
  const [contacts,     setContacts]     = useState<Record<string, Contact>>({})

  const periodLabel = useMemo(() => {
    if (dateFrom === dateTo) return fmtDate(dateFrom)
    return `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`
  }, [dateFrom, dateTo])

  function setThisMonth() { setDateFrom(firstOfMonthStr()); setDateTo(todayStr()) }
  function setLastMonth() {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    setDateFrom(d.toISOString().split('T')[0]); setDateTo(last.toISOString().split('T')[0])
  }
  function setYTD() { setDateFrom(`${new Date().getFullYear()}-01-01`); setDateTo(todayStr()) }

  useEffect(() => { fetchAll() }, [dateFrom, dateTo])

  async function fetchAll() {
    setLoading(true)
    const rangeStart = new Date(dateFrom + 'T00:00:00').toISOString()
    const rangeEnd   = new Date(dateTo + 'T23:59:59').toISOString()

    const [revRes, leadsRes, srcRes, spendSrcRes] = await Promise.all([
      supabase.from('revenue_events').select('lead_id,source_id,event_type,event_date,amount,contact_id,is_repeat_business')
        .gte('event_date', dateFrom).lte('event_date', dateTo),
      supabase.from('leads').select('id,source_id,contact_type,status')
        .gte('created_at', rangeStart).lte('created_at', rangeEnd).eq('archived', false),
      supabase.from('lead_sources').select('id,name').order('name'),
      // All-time, not date-scoped — same "has this source ever had spend logged" rule as the main
      // KPI page, so a source only shows up here if it has genuinely never cost anything.
      supabase.from('marketing_spend').select('source_id'),
    ])

    const events = (revRes.data as any[]) || []
    setRevEvents(events)
    setLeads((leadsRes.data as any[]) || [])
    setSources(srcRes.data || [])
    setPaidSourceIds(new Set((spendSrcRes.data || []).map((r: any) => r.source_id).filter(Boolean)))

    const repeatContactIds = Array.from(new Set(events.filter(e => e.is_repeat_business && e.contact_id).map(e => e.contact_id)))
    if (repeatContactIds.length > 0) {
      const { data: contactRows } = await supabase.from('contacts').select('id,full_name,phone').in('id', repeatContactIds)
      const map: Record<string, Contact> = {}
      ;(contactRows || []).forEach((c: any) => { map[c.id] = c })
      setContacts(map)
    } else {
      setContacts({})
    }
    setLoading(false)
  }

  const organicSourceIds = useMemo(() => new Set(sources.filter(s => !paidSourceIds.has(s.id)).map(s => s.id)), [sources, paidSourceIds])

  // Repeat Business Revenue: is_repeat_business is the real, contact-matched signal (phone/name/email
  // matching, not a manual source tag) — a client who already worked with you before, regardless of
  // what their original lead source was, or whether this new job is at a different address entirely.
  const repeatEvents = useMemo(() => revEvents.filter(e => e.is_repeat_business), [revEvents])
  const repeatTotal  = useMemo(() => repeatEvents.reduce((s, e) => s + Number(e.amount || 0), 0), [repeatEvents])

  const repeatByClient = useMemo(() => {
    const map: Record<string, { name: string; phone: string | null; jobs: number; revenue: number }> = {}
    repeatEvents.forEach(e => {
      const key = e.contact_id || e.lead_id
      const c = e.contact_id ? contacts[e.contact_id] : null
      if (!map[key]) map[key] = { name: c?.full_name || 'Unknown client', phone: c?.phone || null, jobs: 0, revenue: 0 }
      map[key].jobs++
      map[key].revenue += Number(e.amount || 0)
    })
    return Object.values(map).sort((a, b) => b.revenue - a.revenue)
  }, [repeatEvents, contacts])

  // Organic source performance: sources that have never had marketing spend logged (referrals,
  // organic Google/Maps traffic, etc.) — no spend/CAC columns since there's nothing to divide by.
  const organicLeads = useMemo(() => leads.filter(l => l.source_id && organicSourceIds.has(l.source_id)), [leads, organicSourceIds])
  const organicRevEvents = useMemo(() => revEvents.filter(e => e.source_id && organicSourceIds.has(e.source_id)), [revEvents, organicSourceIds])

  const organicBySrc = useMemo(() => {
    const map: Record<string, { name: string; leads: number; inPerson: number; won: number; revenue: number }> = {}
    organicLeads.forEach(l => {
      const key = l.source_id as string
      const name = sources.find(s => s.id === key)?.name || 'Unknown'
      if (!map[key]) map[key] = { name, leads: 0, inPerson: 0, won: 0, revenue: 0 }
      map[key].leads++
      if (l.contact_type === 'in_person') map[key].inPerson++
      if (WON_STAGES.includes(l.status)) map[key].won++
    })
    organicRevEvents.forEach(e => {
      const key = e.source_id as string
      if (!map[key]) { const name = sources.find(s => s.id === key)?.name || 'Unknown'; map[key] = { name, leads: 0, inPerson: 0, won: 0, revenue: 0 } }
      map[key].revenue += Number(e.amount || 0)
    })
    return Object.values(map).sort((a, b) => b.revenue - a.revenue)
  }, [organicLeads, organicRevEvents, sources])

  const organicTotal = organicBySrc.reduce((s, r) => s + r.revenue, 0)

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/kpi')}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground">
            <ChevronLeft className="h-3.5 w-3.5" /> KPI Dashboard
          </button>
          <div>
            <h1 className="text-2xl font-bold">Organic & Repeat Revenue</h1>
            <p className="text-sm text-muted-foreground">Revenue with no marketing spend behind it — referrals, organic traffic, and returning clients</p>
          </div>
        </div>
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

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading...
        </div>
      ) : (
        <div className="space-y-5">

          {/* REPEAT BUSINESS */}
          <div className="rounded-xl border-2 border-purple-300/50 bg-purple-50/40 dark:bg-purple-950/10 overflow-hidden">
            <div className="px-6 py-4 border-b border-purple-200/50 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Repeat className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="text-base font-bold text-purple-700">Repeat Business Revenue</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{periodLabel} · clients who already worked with you before, matched automatically by phone/name/email — regardless of source or job address</p>
                </div>
              </div>
              <p className="text-3xl font-bold text-purple-700">{fmt$(repeatTotal)}</p>
            </div>
            <div className="px-6 py-4">
              {repeatByClient.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">No repeat-client revenue in this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        {['Client', 'Phone', 'Jobs', 'Revenue'].map(h => (
                          <th key={h} className="text-left text-xs text-muted-foreground font-semibold pb-2 pr-3 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {repeatByClient.map((c, i) => (
                        <tr key={i} className="border-b border-border/40">
                          <td className="py-2.5 pr-3 font-semibold">{c.name}</td>
                          <td className="py-2.5 pr-3 text-muted-foreground text-xs">{c.phone || '—'}</td>
                          <td className="py-2.5 pr-3">{c.jobs}</td>
                          <td className="py-2.5 pr-3 font-bold text-purple-700">{fmt$(c.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* ORGANIC SOURCES */}
          <div className="rounded-xl border-2 border-emerald-300/50 bg-emerald-50/30 dark:bg-emerald-950/10 overflow-hidden">
            <div className="px-6 py-4 border-b border-emerald-200/50 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-600" />
                <div>
                  <p className="text-base font-bold text-emerald-700">Organic Source Performance</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{periodLabel} · referrals and other channels that have never had marketing spend logged against them</p>
                </div>
              </div>
              <p className="text-3xl font-bold text-emerald-700">{fmt$(organicTotal)}</p>
            </div>
            <div className="px-6 py-4">
              {organicBySrc.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">No organic-source activity in this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        {['Source', 'Leads', 'In-Person', 'Closed', 'Close %', 'Revenue'].map(h => (
                          <th key={h} className="text-left text-xs text-muted-foreground font-semibold pb-2 pr-3 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {organicBySrc.map((src, i) => {
                        const cr = src.leads > 0 ? Math.round((src.won / src.leads) * 100) : 0
                        return (
                          <tr key={i} className="border-b border-border/40">
                            <td className="py-2.5 pr-3 font-semibold">{src.name}</td>
                            <td className="py-2.5 pr-3">{src.leads}</td>
                            <td className="py-2.5 pr-3">{src.inPerson}</td>
                            <td className="py-2.5 pr-3"><span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700 font-bold">{src.won}</span></td>
                            <td className="py-2.5 pr-3">{src.leads > 0 ? cr + '%' : '—'}</td>
                            <td className="py-2.5 pr-3 font-bold text-emerald-600">{src.revenue > 0 ? fmt$(src.revenue) : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                No Spend / CAC / ROI columns here on purpose — these channels don't cost anything to acquire, so those metrics don't apply. Paid-channel performance lives on the main KPI Dashboard.
              </p>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
