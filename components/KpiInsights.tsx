'use client'

import { useState, useMemo } from 'react'
import { Sparkles, EyeOff, Eye, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────
export interface InsightData {
  totalLeads: number
  totalAppts: number
  totalPhoneQ: number
  totalWon: number
  totalContracted: number
  totalSpend: number
  period: string
  viewMode: 'monthly' | 'weekly'
  salespersons?: {
    name: string; leads: number; inPerson: number; phoneQ: number
    estimated: number; won: number; contracted: number
  }[]
  sources?: {
    name: string; leads: number; inPerson: number; won: number
    contracted: number; spend: number
  }[]
  trend?: { label: string; contracted: number; leads: number }[]
}

interface Insight {
  summary: string
  performing_well: string[]
  needs_attention: string[]
  action_items: string[]
  revenue_note: string
}

// ── Benchmarks ────────────────────────────────────────────────────────────
const BENCH = {
  closeRate:     0.30,
  inPersonClose: 0.45,
  estimateClose: 0.50,
  apptRate:      0.60,
  weeklyLeads:   10,
  monthlyLeads:  40,
}

// ── Analysis engine ───────────────────────────────────────────────────────
function analyze(data: InsightData): Insight {
  const { totalLeads, totalAppts, totalPhoneQ, totalWon, totalContracted, totalSpend, period, viewMode, salespersons, sources, trend } = data

  const totalApptsCombined = totalAppts + totalPhoneQ
  const closeRate     = totalLeads > 0 ? totalWon / totalLeads : 0
  const apptRate      = totalLeads > 0 ? totalApptsCombined / totalLeads : 0
  const inPersonClose = totalAppts > 0 ? totalWon / totalAppts : 0
  const avgJobValue   = totalWon > 0 ? totalContracted / totalWon : 0
  const cpa           = totalSpend > 0 && totalAppts > 0 ? totalSpend / totalAppts : 0
  const roi           = totalSpend > 0 ? ((totalContracted - totalSpend) / totalSpend) * 100 : 0

  const performing: string[] = []
  const attention: string[]  = []
  const actions: string[]    = []

  if (closeRate >= BENCH.closeRate) {
    performing.push(`Close rate of ${pct(closeRate)} is at or above the ${pct(BENCH.closeRate)} target — strong sales execution.`)
  } else if (closeRate > 0) {
    attention.push(`Close rate is ${pct(closeRate)}, below the ${pct(BENCH.closeRate)} target. ${totalLeads - totalWon} leads did not convert.`)
    actions.push(`Review what happened with the ${totalLeads - totalWon} unconverted leads — identify the most common drop-off stage and address it in the next sales meeting.`)
  }

  if (inPersonClose >= BENCH.inPersonClose) {
    performing.push(`In-person close rate of ${pct(inPersonClose)} is strong — appointments are being converted effectively.`)
  } else if (totalAppts > 0) {
    attention.push(`In-person close rate is ${pct(inPersonClose)}, below the ${pct(BENCH.inPersonClose)} target. ${totalAppts - totalWon} in-person visits did not close.`)
    actions.push(`Focus on improving the in-person pitch — review estimate presentation quality and follow-up speed after appointments.`)
  }

  if (apptRate >= BENCH.apptRate) {
    performing.push(`${pct(apptRate)} of leads resulted in appointments — good lead qualification and follow-up.`)
  } else if (totalLeads > 0) {
    const missed = totalLeads - totalApptsCombined
    attention.push(`Only ${pct(apptRate)} of leads got appointments. ${missed} leads never reached the appointment stage.`)
    actions.push(`Improve lead follow-up speed — contact new leads within 5 minutes of intake. ${missed} missed appointments this period represent significant lost revenue potential.`)
  }

  const leadsTarget = viewMode === 'weekly' ? BENCH.weeklyLeads : BENCH.monthlyLeads
  if (totalLeads >= leadsTarget) {
    performing.push(`Lead volume of ${totalLeads} meets the ${viewMode} target of ${leadsTarget}+ leads.`)
  } else {
    attention.push(`Lead volume of ${totalLeads} is below the ${viewMode} target of ${leadsTarget}. More marketing activity may be needed.`)
    actions.push(`Review marketing spend and LSA budget — consider increasing spend on the best-performing sources to hit the ${leadsTarget}-lead ${viewMode} target.`)
  }

  if (totalContracted > 0) {
    performing.push(`${totalWon} job${totalWon !== 1 ? 's' : ''} contracted at ${fmt$(totalContracted)} total — avg job value of ${fmt$(avgJobValue)}.`)
  } else if (totalLeads > 0) {
    attention.push(`No revenue contracted this period despite ${totalLeads} leads coming in.`)
    actions.push(`Urgent: investigate why no jobs were closed this period — check if estimates were sent and what the follow-up cadence was.`)
  }

  if (totalSpend > 0) {
    if (roi >= 300) {
      performing.push(`Marketing ROI of ${Math.round(roi)}% — every dollar spent returned ${(roi/100+1).toFixed(1)}x in contracted revenue.`)
    } else if (roi >= 100) {
      performing.push(`Marketing ROI of ${Math.round(roi)}% — positive return on ad spend.`)
    } else if (roi > 0) {
      attention.push(`Marketing ROI of ${Math.round(roi)}% is low. Spend of ${fmt$(totalSpend)} generated ${fmt$(totalContracted)} contracted.`)
      actions.push(`Audit which lead sources have the lowest close rates and consider reallocating budget to higher-performing sources.`)
    } else if (totalContracted === 0) {
      attention.push(`${fmt$(totalSpend)} was spent on marketing with no contracted revenue this period — -100% ROI.`)
    }
    if (cpa > 0) actions.push(`Current appointment acquisition cost is ${fmt$(cpa)}. Track this weekly — if it rises above ${fmt$(cpa * 1.3)}, reduce spend on underperforming sources.`)
  }

  if (salespersons && salespersons.length > 1) {
    const sorted = [...salespersons].sort((a, b) => (b.won / Math.max(b.leads, 1)) - (a.won / Math.max(a.leads, 1)))
    const top = sorted[0], bottom = sorted[sorted.length - 1]
    const topRate = top.leads > 0 ? top.won / top.leads : 0
    const bottomRate = bottom.leads > 0 ? bottom.won / bottom.leads : 0
    if (topRate > bottomRate + 0.15) {
      attention.push(`${top.name} is closing at ${pct(topRate)} vs ${bottom.name} at ${pct(bottomRate)} — a ${Math.round((topRate - bottomRate) * 100)}% gap.`)
      actions.push(`Pair ${bottom.name} with ${top.name} for a ride-along or joint estimate — identify what's different in their approach.`)
    } else if (topRate > 0) {
      performing.push(`Salesperson close rates are consistent — ${top.name} at ${pct(topRate)}, ${bottom.name} at ${pct(bottomRate)}.`)
    }
    const highLeadsLowWins = salespersons.find(sp => sp.leads >= totalLeads * 0.4 && sp.won / Math.max(sp.leads, 1) < BENCH.closeRate)
    if (highLeadsLowWins) {
      attention.push(`${highLeadsLowWins.name} has ${highLeadsLowWins.leads} leads but only ${highLeadsLowWins.won} closed — high volume, low conversion.`)
    }
  }

  if (sources && sources.length > 0) {
    const withLeads = sources.filter(s => s.leads > 0)
    const sorted = [...withLeads].sort((a, b) => (b.won / Math.max(b.leads, 1)) - (a.won / Math.max(a.leads, 1)))
    const best = sorted[0], worst = sorted[sorted.length - 1]
    if (best && best.won > 0) performing.push(`${best.name} is the best-performing source — ${pct(best.won / best.leads)} close rate.`)
    if (worst && worst.leads > 2 && worst.won === 0) {
      attention.push(`${worst.name} has ${worst.leads} leads with 0 closed — consider reviewing lead quality from this source.`)
      actions.push(`Review ${worst.name} lead quality — if conversion stays at 0% over 2+ months, consider pausing spend on this source.`)
    }
  }

  let revenueNote = totalContracted > 0
    ? `${totalWon} job${totalWon !== 1 ? 's' : ''} contracted at ${fmt$(totalContracted)} total for ${period}.`
    : `No revenue contracted for ${period} yet.`

  if (trend && trend.length >= 3) {
    const recent = trend.slice(-3), older = trend.slice(0, 3)
    const recentAvg = recent.reduce((s, t) => s + t.contracted, 0) / recent.length
    const olderAvg  = older.reduce((s, t) => s + t.contracted, 0) / older.length
    const revTrend  = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0
    revenueNote = revTrend > 10
      ? `Revenue is trending up ${Math.round(revTrend)}% vs the prior 3-month average — positive momentum.`
      : revTrend < -10
      ? `Revenue is down ${Math.round(Math.abs(revTrend))}% vs the prior 3-month average — watch this trend closely.`
      : `Revenue is relatively flat vs the prior 3 months — focus on incremental improvements to push the trend up.`
  }

  return {
    summary: buildSummary(totalLeads, totalWon, totalContracted, closeRate, period),
    performing_well: performing.slice(0, 4),
    needs_attention: attention.slice(0, 4),
    action_items: actions.slice(0, 4),
    revenue_note: revenueNote,
  }
}

function buildSummary(leads: number, won: number, contracted: number, cr: number, period: string) {
  if (leads === 0) return `No leads recorded for ${period} yet. Add leads to start seeing performance insights.`
  if (won === 0 && leads > 0) return `${leads} lead${leads !== 1 ? 's' : ''} came in for ${period} with no closed jobs yet. Focus on converting existing pipeline before the period ends.`
  return `${leads} leads came in for ${period}, resulting in ${won} closed job${won !== 1 ? 's' : ''} at a ${pct(cr)} close rate and ${fmt$(contracted)} in contracted revenue.`
}

function pct(n: number) { return Math.round(n * 100) + '%' }
function fmt$(n: number) {
  if (n >= 1000) return '$' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return '$' + Math.round(n).toLocaleString()
}

// ── Component ──────────────────────────────────────────────────────────────
interface KpiInsightsProps { data: InsightData; label?: string }

export default function KpiInsights({ data, label = 'Performance Insights' }: KpiInsightsProps) {
  const [visible, setVisible]     = useState(true)
  const [open, setOpen]           = useState(false)
  const [generated, setGenerated] = useState(false)

  const insights = useMemo(() => analyze(data), [data])

  function generate() { setGenerated(true); setOpen(true) }

  if (!visible) {
    return (
      <div className="flex justify-end no-print">
        <button onClick={() => setVisible(true)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-border transition-colors">
          <Eye className="h-3.5 w-3.5" /> Show Insights
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-purple-300 dark:border-purple-800/40 bg-purple-50 dark:bg-purple-950/10 overflow-hidden no-print">

      {/* Header */}
      <div className="px-5 py-3 border-b border-purple-200 dark:border-purple-800/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">{label}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-gray-800 text-purple-600 dark:text-gray-500 border border-purple-200 dark:border-gray-700">
            Private
          </span>
        </div>
        <div className="flex items-center gap-2">
          {generated && (
            <button onClick={() => { setGenerated(false); setTimeout(() => setGenerated(true), 50) }}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors">
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          )}
          <button onClick={() => setVisible(false)}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors">
            <EyeOff className="h-3.5 w-3.5" /> Hide
          </button>
          <button onClick={() => setOpen(v => !v)} className="text-muted-foreground hover:text-foreground p-1">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="p-5">
          {!generated ? (
            <div className="text-center py-6">
              <Sparkles className="h-8 w-8 text-purple-400 mx-auto mb-3" />
              <p className="text-sm text-foreground mb-1 font-medium">Analyze this period's performance.</p>
              <p className="text-xs text-muted-foreground mb-4">Identifies what's working, what's falling short, and specific action items — based on your actual numbers.</p>
              <button onClick={generate}
                className="flex items-center gap-2 mx-auto px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors">
                <Sparkles className="h-4 w-4" /> Generate Insights
              </button>
            </div>
          ) : (
            <div className="space-y-5">

              {/* Summary */}
              <div className="bg-purple-100 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/30 rounded-lg p-4">
                <p className="text-xs text-purple-700 dark:text-purple-400 font-bold uppercase tracking-wide mb-2">Summary</p>
                <p className="text-sm text-gray-800 dark:text-gray-200 font-medium leading-relaxed">{insights.summary}</p>
                {insights.revenue_note && (
                  <p className="text-xs text-purple-600 dark:text-purple-400/70 mt-2 italic">{insights.revenue_note}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                {/* Performing well */}
                <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30 rounded-lg p-4">
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 font-bold uppercase tracking-wide mb-3">✓ Performing Well</p>
                  {insights.performing_well.length > 0 ? (
                    <ul className="space-y-2">
                      {insights.performing_well.map((item, i) => (
                        <li key={i} className="text-xs text-gray-700 dark:text-gray-300 flex gap-2">
                          <span className="text-emerald-600 shrink-0 mt-0.5 font-bold">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">Not enough data yet to identify positive trends.</p>
                  )}
                </div>

                {/* Needs attention */}
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 rounded-lg p-4">
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-bold uppercase tracking-wide mb-3">⚠ Needs Attention</p>
                  {insights.needs_attention.length > 0 ? (
                    <ul className="space-y-2">
                      {insights.needs_attention.map((item, i) => (
                        <li key={i} className="text-xs text-gray-700 dark:text-gray-300 flex gap-2">
                          <span className="text-amber-600 shrink-0 mt-0.5 font-bold">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">No major issues detected this period.</p>
                  )}
                </div>

                {/* Action items */}
                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/30 rounded-lg p-4">
                  <p className="text-xs text-blue-700 dark:text-blue-400 font-bold uppercase tracking-wide mb-3">→ Action Items</p>
                  {insights.action_items.length > 0 ? (
                    <ul className="space-y-2">
                      {insights.action_items.map((item, i) => (
                        <li key={i} className="text-xs text-gray-700 dark:text-gray-300 flex gap-2">
                          <span className="text-blue-600 shrink-0 font-bold mt-0.5">{i + 1}.</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">No actions needed — keep doing what's working.</p>
                  )}
                </div>

              </div>

              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span>🔒</span>
                Private — click "Hide" before sharing your screen. Analysis is based on your live KPI data.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Collapsed state */}
      {!open && !generated && (
        <div className="px-5 py-3 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Click to analyze this period's performance data.</p>
          <button onClick={generate}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors">
            <Sparkles className="h-3.5 w-3.5" /> Analyze
          </button>
        </div>
      )}

      {!open && generated && (
        <div className="px-5 py-3">
          <p className="text-xs text-muted-foreground truncate">{insights.summary}</p>
        </div>
      )}
    </div>
  )
}
