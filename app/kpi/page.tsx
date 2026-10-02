'use client'

// KPI · Marketing (simple view)
// One question: is the ad money working, and which source?
// Lens: leads are counted in the month they CAME IN and followed until they are won or lost.
// A lead won next month still counts against this month's spend. That is how cost per job works.
// Source of truth: monthly_source_kpi (the same definitions the Dashboard uses; a daily check,
// kpi_dashboard_vs_marketing_drift, fails if the two ever disagree).
// The old, detailed page lives at /kpi/detailed (spend entry, cancellations, insights).

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import KpiTabs from '@/components/kpi/KpiTabs'
import LeadDetailDialog from '@/components/leads/LeadDetailDialog'
import { X, Loader2 } from 'lucide-react'

type Row = {
  period_start: string; source_id: string | null; source_name: string | null; total_leads: number;
  actual_charged_leads: number; bad_leads: number; appointments: number; closed_jobs: number;
  lead_month_net_sold: number; ad_spend: number; is_paid_channel: boolean; is_mature: boolean;
}
type RecordRow = { lead_id: string | null; lead_name: string | null; detail: string | null; amount: number | null; event_date: string | null }
type Drill = { title: string; metric: string; from: string; to: string; sourceId: string | null }

const money = (n: number | null | undefined) => n == null ? '—' : `$${Math.round(Number(n)).toLocaleString()}`
const monthLabel = (s: string, long = false) =>
  new Date(s + 'T00:00:00Z').toLocaleDateString('en-US', { month: long ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' })
const monthEnd = (s: string) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10) }
const fmtDay = (s: string) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

// Totals for a set of source rows. Conversion uses charged leads for sources billed per lead,
// all leads for the rest (charged count is 0 for those by definition).
function totals(rows: Row[]) {
  const t = rows.reduce((a, r) => ({
    leads: a.leads + r.total_leads,
    basis: a.basis + (r.actual_charged_leads > 0 ? r.actual_charged_leads : r.total_leads),
    bad: a.bad + r.bad_leads,
    appts: a.appts + r.appointments,
    won: a.won + r.closed_jobs,
    sold: a.sold + Number(r.lead_month_net_sold || 0),
    spend: a.spend + Number(r.ad_spend || 0),
  }), { leads: 0, basis: 0, bad: 0, appts: 0, won: 0, sold: 0, spend: 0 })
  return {
    ...t,
    costPerJob: t.won > 0 && t.spend > 0 ? t.spend / t.won : null,
    costPerLead: t.leads > 0 && t.spend > 0 ? t.spend / t.leads : null,
    conversion: t.basis > 0 ? Math.round((t.won / t.basis) * 1000) / 10 : null,
    returnX: t.spend > 0 ? Math.round((t.sold / t.spend) * 10) / 10 : null,
  }
}

export default function KpiMarketingPage() {
  const router = useRouter()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [month, setMonth] = useState<string | null>(null)
  const [drill, setDrill] = useState<Drill | null>(null)
  const [records, setRecords] = useState<RecordRow[]>([])
  const [recLoading, setRecLoading] = useState(false)
  const [selectedLead, setSelectedLead] = useState<any | null>(null)
  const [leadOpen, setLeadOpen] = useState(false)

  useEffect(() => {
    const since = new Date(); since.setUTCMonth(since.getUTCMonth() - 12); since.setUTCDate(1)
    supabase.from('monthly_source_kpi')
      .select('period_start,source_id,source_name,total_leads,actual_charged_leads,bad_leads,appointments,closed_jobs,lead_month_net_sold,ad_spend,is_paid_channel,is_mature')
      .gte('period_start', since.toISOString().slice(0, 10))
      .order('period_start', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error('monthly_source_kpi', error); setError(error.message); setRows([]); return }
        const r = ((data as Row[]) || []).filter(x => x.total_leads > 0 || Number(x.ad_spend) > 0)
        setRows(r)
        // Default: the last month that has spend entered or leads (usually last month).
        const months = Array.from(new Set(r.map(x => x.period_start))).sort().reverse()
        const thisMonth = new Date().toISOString().slice(0, 8) + '01'
        setMonth(months.find(m => m < thisMonth) || months[0] || null)
      })
  }, [])

  useEffect(() => {
    if (!drill) return
    let cancelled = false
    setRecLoading(true); setRecords([])
    supabase.rpc('management_summary_records', { p_metric: drill.metric, p_from: drill.from, p_to: drill.to, p_source_id: drill.sourceId })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('management_summary_records', error)
        setRecords((data as RecordRow[]) || []); setRecLoading(false)
      })
    return () => { cancelled = true }
  }, [drill])

  async function openLead(id: string) {
    const { data } = await supabase.from('leads').select('*, lead_sources(name)').eq('id', id).single()
    if (data) { setSelectedLead(data); setLeadOpen(true) }
  }

  const months = useMemo(() => Array.from(new Set((rows || []).map(r => r.period_start))).sort().reverse(), [rows])
  const monthRows = useMemo(() => (rows || []).filter(r => r.period_start === month)
    .sort((a, b) => Number(b.is_paid_channel) - Number(a.is_paid_channel) || Number(b.ad_spend) - Number(a.ad_spend) || b.total_leads - a.total_leads), [rows, month])
  const paidMonth = totals(monthRows.filter(r => r.is_paid_channel))
  const mature = monthRows.length > 0 && monthRows.every(r => r.is_mature)
  const history = months.map(m => ({ m, t: totals((rows || []).filter(r => r.period_start === m && r.is_paid_channel)), mature: (rows || []).filter(r => r.period_start === m).every(r => r.is_mature) }))

  const show = (title: string, metric: string, sourceId: string | null) =>
    month && setDrill({ title, metric, from: month, to: monthEnd(month), sourceId })

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <KpiTabs />

      <div>
        <h1 className="text-xl font-bold">Is the ad money working?</h1>
        <p className="text-sm text-muted-foreground">
          Leads are counted in the month they came in and followed until they are won or lost. A lead won later still counts for that month.
        </p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Could not load: {error}</div>}
      {!rows && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}

      {rows && month && (
        <>
          {/* Month picker */}
          <div className="flex flex-wrap gap-1.5">
            {months.slice(0, 6).map(m => (
              <button key={m} onClick={() => setMonth(m)}
                className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${m === month ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted'}`}>
                {monthLabel(m)}
              </button>
            ))}
          </div>

          {/* Paid ads, selected month */}
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">Paid ads · {monthLabel(month, true)}</h2>
              {!mature && <span className="text-xs px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">Still maturing: these leads can still turn into jobs</span>}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { label: 'Spent', value: money(paidMonth.spend), sub: paidMonth.costPerLead != null ? `${money(paidMonth.costPerLead)} per lead` : '' },
                { label: 'Jobs won', value: String(paidMonth.won), sub: `from ${paidMonth.leads} leads` + (paidMonth.conversion != null ? ` · ${paidMonth.conversion}%` : '') },
                { label: 'Cost per job won', value: paidMonth.costPerJob != null ? money(paidMonth.costPerJob) : 'no job yet', sub: 'Spent ÷ jobs won', bad: paidMonth.costPerJob == null && paidMonth.spend > 0 },
                { label: 'Return', value: paidMonth.returnX != null ? `${paidMonth.returnX}x` : '—', sub: `${money(paidMonth.sold)} sold ÷ spent` },
              ].map(k => (
                <div key={k.label} className="rounded-lg bg-muted/40 px-4 py-3">
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className={`text-2xl font-bold ${(k as any).bad ? 'text-red-600 text-lg' : ''}`}>{k.value}</p>
                  <p className="text-xs text-muted-foreground">{k.sub}</p>
                </div>
              ))}
            </div>
          </section>

          {/* By source */}
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 pt-5 pb-2">
              <h2 className="font-semibold">By source · {monthLabel(month, true)}</h2>
              <p className="text-xs text-muted-foreground">Click a number to see the leads.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    {['Source', 'Leads', 'Bad leads', 'Site visits', 'Jobs won', 'Conversion', 'Sold', 'Ad spend', 'Cost per job'].map(h => (
                      <th key={h} className={`px-4 py-2 font-medium ${h === 'Source' ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {monthRows.map(r => {
                    const t = totals([r])
                    const sid = r.source_id ?? 'none'
                    const badPct = r.total_leads ? Math.round((r.bad_leads / r.total_leads) * 100) : 0
                    return (
                      <tr key={sid} className="hover:bg-muted/30">
                        <td className="px-4 py-2 font-medium">{r.source_name || 'No source'}</td>
                        <td className="px-4 py-2 text-right">
                          <button className="hover:underline" onClick={() => show(`${r.source_name || 'No source'} · leads`, 'funnel_leads', sid)}>{r.total_leads}</button>
                          {r.actual_charged_leads > 0 && r.actual_charged_leads !== r.total_leads && <span className="text-xs text-muted-foreground"> ({r.actual_charged_leads} charged)</span>}
                        </td>
                        <td className={`px-4 py-2 text-right ${badPct >= 50 ? 'text-red-600 font-semibold' : ''}`}>{r.bad_leads ? `${r.bad_leads} (${badPct}%)` : '0'}</td>
                        <td className="px-4 py-2 text-right">{r.appointments}</td>
                        <td className="px-4 py-2 text-right">
                          {r.closed_jobs > 0
                            ? <button className="font-semibold hover:underline" onClick={() => show(`${r.source_name} · jobs won`, 'funnel_won', sid)}>{r.closed_jobs}</button>
                            : <span className="text-muted-foreground">0</span>}
                        </td>
                        <td className="px-4 py-2 text-right">{t.conversion != null ? `${t.conversion}%` : '—'}</td>
                        <td className="px-4 py-2 text-right">{t.sold ? money(t.sold) : '—'}</td>
                        <td className="px-4 py-2 text-right">{t.spend ? money(t.spend) : <span className="text-muted-foreground">free</span>}</td>
                        <td className="px-4 py-2 text-right font-semibold">
                          {t.costPerJob != null ? money(t.costPerJob) : t.spend ? <span className="font-normal text-muted-foreground">no job yet</span> : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="px-5 py-2 text-xs text-muted-foreground border-t border-border">
              Conversion = jobs won ÷ charged leads for sources that bill per lead (LSA, Pro Referral), ÷ all leads for the rest.
              Bad lead = closed as invalid, spam, too small, outside the area or a service we don&apos;t offer.
            </p>
          </section>

          {/* Trend */}
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 pt-5 pb-2">
              <h2 className="font-semibold">Paid ads, month by month</h2>
              <p className="text-xs text-muted-foreground">Click a month to open it above.</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  {['Month', 'Leads', 'Jobs won', 'Spent', 'Cost per job', 'Return'].map(h => (
                    <th key={h} className={`px-4 py-2 font-medium ${h === 'Month' ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map(({ m, t, mature }) => (
                  <tr key={m} onClick={() => setMonth(m)} className={`cursor-pointer hover:bg-muted/30 ${m === month ? 'bg-muted/40' : ''}`}>
                    <td className="px-4 py-2 font-medium">{monthLabel(m)}{!mature && <span className="ml-2 text-xs text-amber-700">maturing</span>}</td>
                    <td className="px-4 py-2 text-right">{t.leads}</td>
                    <td className="px-4 py-2 text-right">{t.won}</td>
                    <td className="px-4 py-2 text-right">{money(t.spend)}</td>
                    <td className="px-4 py-2 text-right font-semibold">{t.costPerJob != null ? money(t.costPerJob) : <span className="font-normal text-muted-foreground">no job yet</span>}</td>
                    <td className="px-4 py-2 text-right">{t.returnX != null ? `${t.returnX}x` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="flex flex-wrap justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Ad spend is entered on the detailed view.</span>
            <button onClick={() => router.push('/kpi/detailed')} className="text-primary font-medium">Enter ad spend · detailed view →</button>
          </div>
        </>
      )}

      {/* Records panel */}
      {drill && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setDrill(null)} />
          <aside className="fixed right-0 top-0 z-40 h-full w-full max-w-md bg-background border-l border-border shadow-xl flex flex-col">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
              <div>
                <h3 className="font-bold">{drill.title}</h3>
                <p className="text-xs text-muted-foreground">{monthLabel(drill.from, true)} · {recLoading ? 'loading…' : `${records.length} leads`}</p>
              </div>
              <button onClick={() => setDrill(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-border">
              {recLoading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
              {!recLoading && records.length === 0 && <p className="px-5 py-8 text-sm text-muted-foreground">Nobody here.</p>}
              {records.map((r, i) => (
                <button key={`${r.lead_id}-${i}`} disabled={!r.lead_id} onClick={() => r.lead_id && openLead(r.lead_id)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-2.5 text-left hover:bg-muted/40">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.lead_name || '—'}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.detail}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {r.amount != null && Number(r.amount) !== 0 && <p className="text-sm font-semibold">{money(r.amount)}</p>}
                    {r.event_date && <p className="text-xs text-muted-foreground">{fmtDay(r.event_date)}</p>}
                  </div>
                </button>
              ))}
            </div>
          </aside>
        </>
      )}

      <LeadDetailDialog lead={selectedLead} open={leadOpen} onOpenChange={setLeadOpen}
        onLeadUpdated={(id) => openLead(id)} onLeadDeleted={() => setLeadOpen(false)} />
    </div>
  )
}
