'use client'

// KPI · Company Health (simple view)
// One question: is the business healthy?
// Lens: sales count on the date the contract or change order was SIGNED, cash on the date it
// was RECEIVED — regardless of when the lead came in. (Marketing uses the lead month instead.)
// Source of truth: company_health() → v_company_health_monthly + v_job_money + lost reasons.
// The previous version of this page lives at /kpi/health/detailed.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import KpiTabs from '@/components/kpi/KpiTabs'
import LeadDetailDialog from '@/components/leads/LeadDetailDialog'
import { X, Loader2 } from 'lucide-react'

type Month = { month: string; jobs_signed: number; change_orders: number; gross_sold: number; cancelled: number; net_sold: number; collected: number; ad_spend: number; new_leads: number }
type Health = {
  year: number; years_available: number[]; first_spend_month: string | null
  months: Month[]
  totals: { jobs_signed: number; gross_sold: number; cancelled: number; net_sold: number; collected: number; ad_spend: number; new_leads: number; paid: number; organic_referral: number; repeat: number; other: number }
  work: Record<string, { jobs: number; contract_value: number; balance: number }>
  lost_reasons: { key: string; label: string; outcome: string; n: number }[]
}
type RecordRow = { lead_id: string | null; lead_name: string | null; detail: string | null; amount: number | null; event_date: string | null }
type Drill = { title: string; metrics: string[]; from: string | null; to: string | null; label: string }

const money = (n: number | null | undefined) => n == null ? '—' : `$${Math.round(Number(n)).toLocaleString()}`
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : '—')
const monthLabel = (s: string, long = false) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-US', { month: long ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' })
const monthEnd = (s: string) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10) }
const fmtDay = (s: string) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

const CHANNELS: { key: 'paid' | 'organic_referral' | 'repeat' | 'other'; label: string; note: string }[] = [
  { key: 'paid', label: 'Paid ads', note: 'LSA, Meta' },
  { key: 'organic_referral', label: 'Organic & referral', note: 'Website, referrals, partners' },
  { key: 'repeat', label: 'Repeat clients', note: 'Past customers, no ad cost' },
  { key: 'other', label: 'Other', note: '' },
]
const WORK: { key: string; label: string; note: string }[] = [
  { key: 'not_started', label: 'Signed, not started', note: 'Work booked ahead' },
  { key: 'in_progress', label: 'In progress', note: 'Crews on site' },
  { key: 'callback', label: 'Callbacks open', note: 'Return visits owed' },
  { key: 'completed', label: 'Finished', note: '' },
]

export default function CompanyHealthPage() {
  const router = useRouter()
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [data, setData] = useState<Health | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drill, setDrill] = useState<Drill | null>(null)
  const [records, setRecords] = useState<RecordRow[]>([])
  const [recLoading, setRecLoading] = useState(false)
  const [selectedLead, setSelectedLead] = useState<any | null>(null)
  const [leadOpen, setLeadOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    supabase.rpc('company_health', { p_year: year }).then(({ data, error }) => {
      if (cancelled) return
      if (error) { console.error('company_health', error); setError(error.message) }
      else setData(data as Health)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [year])

  useEffect(() => {
    if (!drill) return
    let cancelled = false
    setRecLoading(true); setRecords([])
    Promise.all(drill.metrics.map(m => supabase.rpc('management_summary_records', { p_metric: m, p_from: drill.from, p_to: drill.to, p_source_id: null })))
      .then(results => {
        if (cancelled) return
        const all: RecordRow[] = []
        results.forEach(r => { if (r.error) console.error('management_summary_records', r.error); else all.push(...((r.data as RecordRow[]) || [])) })
        setRecords(all); setRecLoading(false)
      })
    return () => { cancelled = true }
  }, [drill])

  async function openLead(id: string) {
    const { data } = await supabase.from('leads').select('*, lead_sources(name)').eq('id', id).single()
    if (data) { setSelectedLead(data); setLeadOpen(true) }
  }

  const t = data?.totals
  const yFrom = `${year}-01-01`, yTo = `${year}-12-31`
  const channelTotal = t ? t.paid + t.organic_referral + t.repeat + t.other : 0
  const spendTracked = data?.first_spend_month ? data.first_spend_month <= yFrom : false
  const lostReal = (data?.lost_reasons || []).filter(r => r.outcome !== 'disqualified')
  const lostNotFit = (data?.lost_reasons || []).filter(r => r.outcome === 'disqualified')
  const lostTotal = (data?.lost_reasons || []).reduce((s, r) => s + r.n, 0)
  const noReason = (data?.lost_reasons || []).find(r => r.key === 'no_reason_recorded')?.n || 0
  const notStarted = data?.work?.not_started
  const inProgress = data?.work?.in_progress

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <KpiTabs />

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-bold">Is the business healthy?</h1>
          <p className="text-sm text-muted-foreground">Sales count on the day they were signed, cash on the day it came in.</p>
        </div>
        <div className="flex gap-1.5">
          {(data?.years_available || [year]).map(y => (
            <button key={y} onClick={() => setYear(y)}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${y === year ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted'}`}>
              {y}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Could not load: {error}</div>}
      {loading && !data && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}

      {data && t && (
        <div className={`space-y-6 ${loading ? 'opacity-60' : ''}`}>
          {/* 1. The year */}
          <div className="grid gap-3 md:grid-cols-4">
            <button onClick={() => setDrill({ title: `Sold in ${year}`, metrics: ['jobs_signed', 'change_orders', 'cancelled'], from: yFrom, to: yTo, label: String(year) })}
              className="text-left rounded-xl border border-border bg-card p-5 hover:border-foreground/30 transition-colors">
              <p className="text-sm text-muted-foreground">Sold</p>
              <p className="text-3xl font-bold mt-1">{money(t.net_sold)}</p>
              <p className="text-xs text-muted-foreground mt-2">{t.jobs_signed} new jobs + change orders</p>
            </button>
            <button onClick={() => setDrill({ title: `Collected in ${year}`, metrics: ['cash_collected'], from: yFrom, to: yTo, label: String(year) })}
              className="text-left rounded-xl border border-border bg-card p-5 hover:border-foreground/30 transition-colors">
              <p className="text-sm text-muted-foreground">Collected</p>
              <p className="text-3xl font-bold mt-1 text-emerald-700">{money(t.collected)}</p>
              <p className="text-xs text-muted-foreground mt-2">Payments received</p>
            </button>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">Ad spend</p>
              <p className="text-3xl font-bold mt-1">{spendTracked ? money(t.ad_spend) : '—'}</p>
              <p className="text-xs text-muted-foreground mt-2">{spendTracked ? `${pct(t.ad_spend, t.net_sold)} of what we sold` : 'Not tracked for this year'}</p>
            </div>
            <button onClick={() => setDrill({ title: `Cancelled in ${year}`, metrics: ['cancelled'], from: yFrom, to: yTo, label: String(year) })}
              className="text-left rounded-xl border border-border bg-card p-5 hover:border-foreground/30 transition-colors">
              <p className="text-sm text-muted-foreground">Cancelled</p>
              <p className={`text-3xl font-bold mt-1 ${t.cancelled > 0 ? 'text-red-600' : ''}`}>{money(t.cancelled)}</p>
              <p className="text-xs text-muted-foreground mt-2">{pct(t.cancelled, t.gross_sold)} of signed work given back</p>
            </button>
          </div>

          {/* 2. Month by month */}
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 pt-5 pb-2">
              <h2 className="font-semibold">Month by month</h2>
              <p className="text-xs text-muted-foreground">Click a number to see the jobs or payments behind it.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    {['Month', 'New jobs', 'Sold', 'Cancelled', 'Collected', 'Ad spend', 'Ad spend ÷ sold'].map(h => (
                      <th key={h} className={`px-4 py-2 font-medium ${h === 'Month' ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.months.map(m => {
                    const f = m.month, to = monthEnd(m.month)
                    return (
                      <tr key={m.month} className="hover:bg-muted/30">
                        <td className="px-4 py-2 font-medium">{monthLabel(m.month)}</td>
                        <td className="px-4 py-2 text-right">{m.jobs_signed}{m.change_orders ? <span className="text-xs text-muted-foreground"> +{m.change_orders} CO</span> : null}</td>
                        <td className="px-4 py-2 text-right">
                          <button className="hover:underline" onClick={() => setDrill({ title: 'Sold', metrics: ['jobs_signed', 'change_orders', 'cancelled'], from: f, to, label: monthLabel(f, true) })}>{money(m.net_sold)}</button>
                        </td>
                        <td className={`px-4 py-2 text-right ${m.cancelled > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                          {m.cancelled > 0 ? <button className="hover:underline" onClick={() => setDrill({ title: 'Cancelled', metrics: ['cancelled'], from: f, to, label: monthLabel(f, true) })}>{money(m.cancelled)}</button> : '—'}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button className="hover:underline" onClick={() => setDrill({ title: 'Collected', metrics: ['cash_collected'], from: f, to, label: monthLabel(f, true) })}>{money(m.collected)}</button>
                        </td>
                        <td className="px-4 py-2 text-right">{m.ad_spend ? money(m.ad_spend) : <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-4 py-2 text-right">{m.ad_spend && m.net_sold > 0 ? pct(m.ad_spend, m.net_sold) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/30 font-semibold">
                    <td className="px-4 py-2">{year} total</td>
                    <td className="px-4 py-2 text-right">{t.jobs_signed}</td>
                    <td className="px-4 py-2 text-right">{money(t.net_sold)}</td>
                    <td className="px-4 py-2 text-right">{t.cancelled ? money(t.cancelled) : '—'}</td>
                    <td className="px-4 py-2 text-right">{money(t.collected)}</td>
                    <td className="px-4 py-2 text-right">{spendTracked ? money(t.ad_spend) : '—'}</td>
                    <td className="px-4 py-2 text-right">{spendTracked ? pct(t.ad_spend, t.net_sold) : '—'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            {/* 3. Where sales came from */}
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold">Where {year} sales came from</h2>
              <p className="text-xs text-muted-foreground">Signed contracts and change orders, before cancellations.</p>
              <div className="mt-4 space-y-3">
                {CHANNELS.filter(c => t[c.key] > 0 || c.key !== 'other').map(c => {
                  const v = t[c.key]; const share = channelTotal ? Math.round((v / channelTotal) * 100) : 0
                  return (
                    <div key={c.key}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span><span className="font-medium">{c.label}</span>{c.note && <span className="ml-2 text-xs text-muted-foreground">{c.note}</span>}</span>
                        <span><b>{money(v)}</b> <span className="text-xs text-muted-foreground">{share}%</span></span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-foreground/70" style={{ width: `${share}%` }} /></div>
                    </div>
                  )
                })}
              </div>
              {channelTotal > 0 && t.paid / channelTotal < 0.5 && spendTracked && (
                <p className="mt-4 text-xs text-muted-foreground">
                  Paid ads brought {Math.round((t.paid / channelTotal) * 100)}% of sales for {money(t.ad_spend)} in spend. The rest came with no ad cost: referrals and repeat clients are worth protecting.
                </p>
              )}
            </section>

            {/* 4. Work */}
            <section className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 pt-5 pb-2">
                <h2 className="font-semibold">Work right now</h2>
                <p className="text-xs text-muted-foreground">All signed jobs, whatever year is picked above.</p>
              </div>
              <div className="divide-y divide-border">
                {WORK.map(w => {
                  const v = data.work[w.key]
                  return (
                    <button key={w.key} onClick={() => setDrill({ title: w.label, metrics: [`work:${w.key}`], from: null, to: null, label: 'Right now' })}
                      className="w-full flex items-center justify-between gap-3 px-5 py-2.5 text-left hover:bg-muted/40">
                      <span>
                        <span className="block text-sm font-medium">{w.label}</span>
                        {w.key === 'completed' && v?.balance ? <span className="block text-xs text-red-600">{money(v.balance)} still owed</span>
                          : w.note ? <span className="block text-xs text-muted-foreground">{w.note}</span> : null}
                      </span>
                      <span className="text-right">
                        <span className="block text-sm font-bold">{v?.jobs ?? 0} {(v?.jobs ?? 0) === 1 ? 'job' : 'jobs'}</span>
                        <span className="block text-xs text-muted-foreground">{money(v?.contract_value ?? 0)}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
              {(notStarted?.jobs ?? 0) + (inProgress?.jobs ?? 0) <= 3 && (
                <p className="px-5 py-3 text-xs text-amber-800 bg-amber-50 border-t border-amber-200">
                  Only {money((notStarted?.contract_value ?? 0) + (inProgress?.contract_value ?? 0))} of work is booked ahead. Crews run out of work unless estimates close soon.
                </p>
              )}
            </section>
          </div>

          {/* 5. Why leads didn't buy */}
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 pt-5 pb-2">
              <h2 className="font-semibold">Why {year} leads didn&apos;t buy</h2>
              <p className="text-xs text-muted-foreground">{lostTotal} leads received in {year} were closed without a sale. Click a reason to see them.</p>
            </div>
            <div className="grid md:grid-cols-2 md:divide-x divide-border border-t border-border">
              {[{ title: 'Real lost sales', rows: lostReal }, { title: 'Never a fit (bad leads)', rows: lostNotFit }].map(g => (
                <div key={g.title}>
                  <p className="px-5 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</p>
                  {g.rows.map(r => (
                    <button key={r.key} onClick={() => setDrill({ title: r.label, metrics: [`lost:${r.key}`], from: yFrom, to: yTo, label: `Leads received in ${year}` })}
                      className="w-full flex items-center justify-between px-5 py-1.5 text-sm text-left hover:bg-muted/40">
                      <span className={r.key === 'no_reason_recorded' ? 'text-muted-foreground' : ''}>{r.label}</span>
                      <span className="font-semibold">{r.n}</span>
                    </button>
                  ))}
                  {g.rows.length === 0 && <p className="px-5 py-2 text-sm text-muted-foreground">None</p>}
                </div>
              ))}
            </div>
            {noReason > 0 && lostTotal > 0 && (
              <p className="px-5 py-3 text-xs text-muted-foreground border-t border-border">
                {Math.round((noReason / lostTotal) * 100)}% have no reason recorded (closed before reasons were required). From now on every closed lead needs one, so this list gets sharper each month.
              </p>
            )}
          </section>

          <div className="flex justify-end text-xs">
            <button onClick={() => router.push('/kpi/health/detailed')} className="text-primary font-medium">Pipeline aging, time to close · detailed view →</button>
          </div>
        </div>
      )}

      {/* Records panel */}
      {drill && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setDrill(null)} />
          <aside className="fixed right-0 top-0 z-40 h-full w-full max-w-md bg-background border-l border-border shadow-xl flex flex-col">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
              <div>
                <h3 className="font-bold">{drill.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {drill.label} · {recLoading ? 'loading…' : `${records.length} records`}
                  {!recLoading && records.some(r => r.amount) && <> · {money(records.reduce((s, r) => s + Number(r.amount || 0), 0))}</>}
                </p>
              </div>
              <button onClick={() => setDrill(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-border">
              {recLoading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
              {!recLoading && records.length === 0 && <p className="px-5 py-8 text-sm text-muted-foreground">Nothing here.</p>}
              {records.map((r, i) => (
                <button key={`${r.lead_id}-${i}`} disabled={!r.lead_id} onClick={() => r.lead_id && openLead(r.lead_id)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-2.5 text-left hover:bg-muted/40">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.lead_name || '—'}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.detail}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {r.amount != null && Number(r.amount) !== 0 && <p className={`text-sm font-semibold ${Number(r.amount) < 0 ? 'text-red-600' : ''}`}>{money(r.amount)}</p>}
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
