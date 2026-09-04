'use client'

import { useState, useEffect, useMemo, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { Printer, Loader2, Users, Repeat, ChevronDown, ChevronUp } from 'lucide-react'
import KpiTabs from '@/components/kpi/KpiTabs'

const WON_STAGES = ['closed_won', 'won', 'completed', 'completed_with_balance']

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

interface RevEvent {
  lead_id: string; source_id: string | null; event_type: 'initial_contract' | 'change_order'
  event_date: string; amount: number; contact_id: string | null; is_repeat_business: boolean
  change_order_id: string | null
}
interface EventLine { client: string; what: string; date: string; amount: number }
interface LeadRow {
  id: string; first_name?: string; last_name?: string; lead_name?: string; phone?: string;
  source_id: string | null; contact_type: string | null; lsa_status: string | null; status: string;
  initial_contract_value: number; created_at: string;
  metadata: { salesperson?: string; job_type?: string } | null;
  lead_sources: { name: string } | null;
}
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
  // Name lookup for every lead referenced by a revenue event — covers repeat/CO
  // work on leads created before this period (e.g. JCC Bayone, a 2024 lead), which
  // aren't in the date-scoped `leads` list above.
  const [leadNames,    setLeadNames]    = useState<Record<string, string>>({})
  // order_number + description for every change_order referenced by an event.
  const [coInfo,       setCoInfo]       = useState<Record<string, { n: number; desc: string }>>({})

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
      supabase.from('revenue_events').select('lead_id,source_id,event_type,event_date,amount,contact_id,is_repeat_business,change_order_id')
        .gte('event_date', dateFrom).lte('event_date', dateTo),
      supabase.from('leads').select('id,first_name,last_name,lead_name,phone,source_id,contact_type,lsa_status,status,initial_contract_value,created_at,metadata,lead_sources(name)')
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

    // Attribution lookups for the per-client detail rows: contacts, lead names
    // (for out-of-range leads), and change-order number/description.
    const contactIds = Array.from(new Set(events.map(e => e.contact_id).filter(Boolean)))
    const leadIds    = Array.from(new Set(events.map(e => e.lead_id).filter(Boolean)))
    const coIds      = Array.from(new Set(events.map(e => e.change_order_id).filter(Boolean)))

    const [contactRes, leadNameRes, coRes] = await Promise.all([
      contactIds.length ? supabase.from('contacts').select('id,full_name,phone').in('id', contactIds) : Promise.resolve({ data: [] as any[] }),
      leadIds.length    ? supabase.from('leads').select('id,lead_name,first_name,last_name').in('id', leadIds) : Promise.resolve({ data: [] as any[] }),
      coIds.length      ? supabase.from('change_orders').select('id,order_number,description').in('id', coIds) : Promise.resolve({ data: [] as any[] }),
    ])

    const cMap: Record<string, Contact> = {}
    ;(contactRes.data || []).forEach((c: any) => { cMap[c.id] = c })
    setContacts(cMap)

    const nMap: Record<string, string> = {}
    ;(leadNameRes.data || []).forEach((l: any) => {
      nMap[l.id] = l.lead_name || `${l.first_name || ''} ${l.last_name || ''}`.trim() || 'Unknown client'
    })
    setLeadNames(nMap)

    const coMap: Record<string, { n: number; desc: string }> = {}
    ;(coRes.data || []).forEach((co: any) => { coMap[co.id] = { n: co.order_number, desc: co.description || '' } })
    setCoInfo(coMap)

    setLoading(false)
  }

  // Sources whose NAME marks them as repeat business (the lead was manually tagged
  // "Repeat Client"). That tag — not just the auto-matched is_repeat_business flag —
  // is how returning clients actually get recorded here; the flag is never set on a
  // change order signed against an existing lead, which is why the card read $0.00
  // while JCC Bayone's $43,475 CO sat in the table below it.
  const repeatSourceIds = useMemo(
    () => new Set(sources.filter(s => /repeat/i.test(s.name)).map(s => s.id)),
    [sources],
  )
  const isRepeatEvent = (e: RevEvent) => e.is_repeat_business || (!!e.source_id && repeatSourceIds.has(e.source_id))

  // Organic = never had spend AND not a repeat-business source. Repeat revenue is
  // its own section; it must not also be counted as an organic source.
  const organicSourceIds = useMemo(
    () => new Set(sources.filter(s => !paidSourceIds.has(s.id) && !repeatSourceIds.has(s.id)).map(s => s.id)),
    [sources, paidSourceIds, repeatSourceIds],
  )

  // Per-event attribution line: who it was, what it was, when, how much.
  const describe = (e: RevEvent): EventLine => {
    const client = leadNames[e.lead_id] || (e.contact_id ? contacts[e.contact_id]?.full_name : '') || 'Unknown client'
    let what = 'Initial contract'
    if (e.event_type === 'change_order') {
      const co = e.change_order_id ? coInfo[e.change_order_id] : null
      what = co ? `CO #${co.n}${co.desc ? ` · ${co.desc}` : ''}` : 'Change order'
    }
    return { client, what, date: fmtDate(e.event_date), amount: Number(e.amount || 0) }
  }

  const repeatEvents = useMemo(
    () => revEvents.filter(isRepeatEvent).slice().sort((a, b) => b.event_date.localeCompare(a.event_date)),
    [revEvents, repeatSourceIds],
  )
  const repeatTotal = useMemo(() => repeatEvents.reduce((s, e) => s + Number(e.amount || 0), 0), [repeatEvents])
  const repeatLines = useMemo(() => repeatEvents.map(describe), [repeatEvents, leadNames, contacts, coInfo])

  // Organic source performance: sources that have never had marketing spend logged
  // (referrals, organic Google/Maps traffic, etc.) — no spend/CAC columns since
  // there's nothing to divide by.
  const organicLeads = useMemo(() => leads.filter(l => l.source_id && organicSourceIds.has(l.source_id)), [leads, organicSourceIds])
  const organicRevEvents = useMemo(
    () => revEvents.filter(e => e.source_id && organicSourceIds.has(e.source_id) && !isRepeatEvent(e))
                   .slice().sort((a, b) => b.event_date.localeCompare(a.event_date)),
    [revEvents, organicSourceIds, repeatSourceIds],
  )

  const organicBySrc = useMemo(() => {
    const map: Record<string, { name: string; leads: number; inPerson: number; won: number; revenue: number; lines: EventLine[] }> = {}
    const ensure = (key: string) => {
      if (!map[key]) map[key] = { name: sources.find(s => s.id === key)?.name || 'Unknown', leads: 0, inPerson: 0, won: 0, revenue: 0, lines: [] }
      return map[key]
    }
    organicLeads.forEach(l => {
      const g = ensure(l.source_id as string)
      g.leads++
      if (l.contact_type === 'in_person') g.inPerson++
      if (WON_STAGES.includes(l.status)) g.won++
    })
    organicRevEvents.forEach(e => {
      const g = ensure(e.source_id as string)
      g.revenue += Number(e.amount || 0)
      g.lines.push(describe(e))
    })
    return Object.values(map).sort((a, b) => b.revenue - a.revenue)
  }, [organicLeads, organicRevEvents, sources, leadNames, contacts, coInfo])

  const organicTotal = organicBySrc.reduce((s, r) => s + r.revenue, 0)

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <KpiTabs />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Organic & Repeat Revenue</h1>
          <p className="text-sm text-muted-foreground">Revenue with no marketing spend behind it — referrals, organic traffic, and returning clients</p>
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
                  <p className="text-xs text-muted-foreground mt-0.5">{periodLabel} · returning clients — matched automatically by phone/name/email, or tagged as a repeat client on the lead. Includes change orders on an existing job.</p>
                </div>
              </div>
              <p className="text-3xl font-bold text-purple-700">{fmt$(repeatTotal)}</p>
            </div>
            <div className="px-6 py-4">
              {repeatLines.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">No repeat-client revenue in this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        {['Client', 'What it was', 'Date', 'Amount'].map(h => (
                          <th key={h} className="text-left text-xs text-muted-foreground font-semibold pb-2 pr-3 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {repeatLines.map((l, i) => (
                        <tr key={i} className="border-b border-border/40">
                          <td className="py-2.5 pr-3 font-semibold whitespace-nowrap">{l.client}</td>
                          <td className="py-2.5 pr-3 text-muted-foreground">{l.what}</td>
                          <td className="py-2.5 pr-3 text-muted-foreground text-xs whitespace-nowrap">{l.date}</td>
                          <td className="py-2.5 pr-3 font-bold text-purple-700 whitespace-nowrap">{fmt$(l.amount)}</td>
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
                          <Fragment key={i}>
                            <tr className="border-b border-border/40">
                              <td className="py-2.5 pr-3 font-semibold">{src.name}</td>
                              <td className="py-2.5 pr-3">{src.leads}</td>
                              <td className="py-2.5 pr-3">{src.inPerson}</td>
                              <td className="py-2.5 pr-3"><span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700 font-bold">{src.won}</span></td>
                              <td className="py-2.5 pr-3">{src.leads > 0 ? cr + '%' : '—'}</td>
                              <td className="py-2.5 pr-3 font-bold text-emerald-600">{src.revenue > 0 ? fmt$(src.revenue) : '—'}</td>
                            </tr>
                            {src.lines.map((l, j) => (
                              <tr key={`d${i}-${j}`} className="border-b border-border/20 bg-muted/[0.04]">
                                <td colSpan={5} className="py-1.5 pl-6 pr-3 text-xs text-muted-foreground">
                                  <span className="font-medium text-foreground">{l.client}</span> · {l.what} · {l.date}
                                </td>
                                <td className="py-1.5 pr-3 text-xs font-semibold text-emerald-700 whitespace-nowrap">{fmt$(l.amount)}</td>
                              </tr>
                            ))}
                          </Fragment>
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

          {/* LEADS THIS PERIOD -- same list as the main KPI Dashboard, kept here too so you don't
              have to flip pages to see who's behind the organic/repeat numbers above. */}
          <Section title="Leads This Period" badge={`${organicLeads.length} leads`} defaultOpen={false}>
            {organicLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No leads for this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {['Name','Phone','Source','Salesperson','LSA Status','Stage','Job Closed','Contract Value','Date'].map(h => (
                        <th key={h} className="text-left text-xs text-muted-foreground font-semibold pb-2 pr-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {organicLeads.map((lead, i) => {
                      const name        = lead.lead_name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || '—'
                      const source      = (lead.lead_sources as any)?.name || '—'
                      const salesperson = lead.metadata?.salesperson || '—'
                      const lsaStatus   = lead.lsa_status ? lead.lsa_status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : '—'
                      const isWon       = WON_STAGES.includes(lead.status)
                      const stageColor  = isWon ? 'text-emerald-600 font-semibold' : lead.status === 'lost' ? 'text-red-500' : 'text-muted-foreground'
                      const stageLabel  = lead.status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
                      const jobClosed   = isWon ? (lead.metadata?.job_type || '—') : '—'
                      const date        = new Date(lead.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
                      return (
                        <tr key={lead.id} className={`border-b border-border/40 hover:bg-muted/20 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                          <td className="py-2.5 pr-3 font-semibold whitespace-nowrap">{name}</td>
                          <td className="py-2.5 pr-3 text-muted-foreground text-xs">{lead.phone || '—'}</td>
                          <td className="py-2.5 pr-3"><span className="text-xs px-2 py-0.5 rounded-full bg-muted font-medium">{source}</span></td>
                          <td className="py-2.5 pr-3 text-muted-foreground">{salesperson}</td>
                          <td className="py-2.5 pr-3 text-muted-foreground text-xs">{lsaStatus}</td>
                          <td className={`py-2.5 pr-3 text-xs ${stageColor}`}>{stageLabel}</td>
                          <td className="py-2.5 pr-3 text-xs">{isWon ? <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{jobClosed}</span> : <span className="text-muted-foreground">—</span>}</td>
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
