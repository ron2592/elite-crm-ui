"use client";

// Management Summary — the owner's 30-second page.
// Answers four questions, in this order, in plain words:
//   1. Money: what did we sell, what did we collect, who owes us?
//   2. Leads: how many came in and what happened to them?
//   3. What needs action today?
//   4. Which sources are worth the money?
// Every number is clickable and shows the people behind it.
// All numbers come from management_summary() in the database, the same source as the KPI pages.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import LeadDetailDialog from "@/components/leads/LeadDetailDialog";
import { ChevronDown, ChevronRight, X, Loader2, ArrowRight } from "lucide-react";

// ---------- types ----------
type Metrics = {
  new_leads: number; duplicates: number; appointments: number; estimates_sent: number; estimates_value: number;
  jobs_signed: number; jobs_signed_value: number; change_orders: number; change_orders_value: number;
  cancelled_value: number; net_sold: number; cash_collected: number; refunds: number; ad_spend: number;
};
type Source = {
  source_id: string; source: string; group: string; leads: number; charged_leads: number; appointments: number;
  estimates: number; jobs_won: number; still_open: number; sold_value: number; spend: number;
  cost_per_lead: number | null; cost_per_job: number | null; conversion_pct: number | null;
  conversion_basis: "charged" | "all"; roi_x: number | null;
};
type SampleRow = { ref_id: string; label: string; detail: string };
type Alert = {
  check_key: string; severity: string; title: string; offender_count: number; previous_count: number | null;
  why_it_matters: string; solution: string; sample: SampleRow[] | null;
};
type Summary = {
  period: { from: string; to: string; prev_from: string; prev_to: string; timezone: string; generated_at: string };
  current: Metrics; previous: Metrics;
  funnel: { leads: number; appointments: number; estimates: number; won: number; won_value: number; lost: number; still_open: number };
  marketing: { cohort_is_mature: boolean; sources: Source[] };
  right_now: {
    owed_now: number; held_for_callback: number; not_yet_due: number; deposits_pending: number;
    deposits_pending_value: number; open_leads: number; open_estimates: number; open_estimates_value: number;
    followups_overdue: number; followups_overdue_30d: number; new_uncontacted_24h: number; open_no_salesperson: number;
  };
  alerts: Alert[];
};
type RecordRow = { lead_id: string | null; lead_name: string | null; detail: string | null; amount: number | null; event_date: string | null };
type Drill = { title: string; metrics?: string[]; usePeriod?: boolean; sourceId?: string; staticRows?: RecordRow[] };

// ---------- dates (company calendar days, string math only) ----------
type Preset = "this_week" | "last_week" | "this_month" | "last_month" | "this_year" | "custom";
const PRESETS: { key: Preset; label: string; prevWord: string }[] = [
  { key: "this_week", label: "This week", prevWord: "same days last week" },
  { key: "last_week", label: "Last week", prevWord: "the week before" },
  { key: "this_month", label: "This month", prevWord: "same days last month" },
  { key: "last_month", label: "Last month", prevWord: "the month before" },
  { key: "this_year", label: "This year", prevWord: "same days last year" },
  { key: "custom", label: "Custom", prevWord: "the period before" },
];
const toD = (s: string) => new Date(s + "T00:00:00Z");
const fromD = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = toD(s); d.setUTCDate(d.getUTCDate() + n); return fromD(d); };
const monthStart = (s: string) => s.slice(0, 8) + "01";
const monthEnd = (s: string) => { const d = toD(monthStart(s)); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return fromD(d); };
const addMonths = (s: string, n: number) => {
  const d = toD(s); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const last = toD(monthEnd(fromD(d))).getUTCDate(); d.setUTCDate(Math.min(day, last)); return fromD(d);
};
const todayIn = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function periodFor(p: Preset, today: string, custom: { from: string; to: string }) {
  const monday = addDays(today, -((toD(today).getUTCDay() + 6) % 7));
  switch (p) {
    case "this_week":  return { from: monday, to: today, prevFrom: addDays(monday, -7), prevTo: addDays(today, -7) };
    case "last_week":  return { from: addDays(monday, -7), to: addDays(monday, -1), prevFrom: addDays(monday, -14), prevTo: addDays(monday, -8) };
    case "this_month": { const f = monthStart(today); return { from: f, to: today, prevFrom: addMonths(f, -1), prevTo: addMonths(today, -1) }; }
    case "last_month": { const f = addMonths(monthStart(today), -1); return { from: f, to: monthEnd(f), prevFrom: addMonths(f, -1), prevTo: monthEnd(addMonths(f, -1)) }; }
    case "this_year":  { const f = today.slice(0, 4) + "-01-01"; return { from: f, to: today, prevFrom: addMonths(f, -12), prevTo: addMonths(today, -12) }; }
    default:           return { from: custom.from, to: custom.to, prevFrom: null as string | null, prevTo: null as string | null };
  }
}
// Early in a month "this month" is nearly empty, so open on last month until the 8th.
const defaultPreset = (today: string): Preset => (Number(today.slice(8, 10)) <= 7 ? "last_month" : "this_month");
const fmtDay = (s: string) => toD(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const fmtRange = (a: string, b: string) => (a === b ? fmtDay(a) : `${fmtDay(a)} – ${fmtDay(b)}`);

const money = (n: number | null | undefined) => n == null ? "—" : `$${Math.round(Number(n)).toLocaleString()}`;
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Checks already shown as an action line, so they are not repeated under "Other checks".
const COVERED = new Set(["dq_uncontacted_new_lead_24h", "acc_followup_overdue_7d", "dq_appointment_without_outcome",
  "rev_receivable_over_60d", "rev_signed_no_payment_7d"]);

export default function ManagementSummaryPage() {
  const router = useRouter();
  const [tz, setTz] = useState("America/New_York");
  const [preset, setPreset] = useState<Preset>(() => defaultPreset(todayIn("America/New_York")));
  const [custom, setCustom] = useState(() => { const t = todayIn("America/New_York"); return { from: monthStart(t), to: t }; });
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [showOther, setShowOther] = useState(false);
  const [openAlert, setOpenAlert] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);

  const today = todayIn(tz);
  const period = useMemo(() => periodFor(preset, today, custom), [preset, today, custom]);
  const customInvalid = preset === "custom" && (!custom.from || !custom.to || custom.to < custom.from);
  const presetInfo = PRESETS.find(p => p.key === preset)!;

  useEffect(() => {
    supabase.from("companies").select("timezone").limit(1).then(({ data }) => {
      const z = (data as any[])?.[0]?.timezone; if (z) setTz(z);
    });
  }, []);

  useEffect(() => {
    if (customInvalid) return;
    let cancelled = false;
    setLoading(true); setError(null);
    supabase.rpc("management_summary", { p_from: period.from, p_to: period.to, p_prev_from: period.prevFrom, p_prev_to: period.prevTo })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error("management_summary", error); setError(error.message); }
        else setData(data as Summary);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [period.from, period.to, period.prevFrom, period.prevTo, customInvalid]);

  useEffect(() => {
    if (!drill) return;
    if (drill.staticRows) { setRows(drill.staticRows); setRowsLoading(false); return; }
    let cancelled = false;
    setRowsLoading(true); setRows([]);
    Promise.all((drill.metrics || []).map(m => supabase.rpc("management_summary_records", {
      p_metric: m, p_from: drill.usePeriod ? period.from : null, p_to: drill.usePeriod ? period.to : null, p_source_id: drill.sourceId ?? null,
    }))).then(results => {
      if (cancelled) return;
      const all: RecordRow[] = [];
      results.forEach(r => { if (r.error) console.error("management_summary_records", r.error); else all.push(...((r.data as RecordRow[]) || [])); });
      setRows(all); setRowsLoading(false);
    });
    return () => { cancelled = true; };
  }, [drill, period.from, period.to]);

  async function openLead(id: string) {
    const { data } = await supabase.from("leads").select("*, lead_sources(name)").eq("id", id).single();
    if (data) { setSelectedLead(data); setLeadOpen(true); }
  }

  const c = data?.current, prev = data?.previous, now = data?.right_now, f = data?.funnel;
  const alertBy = (k: string) => data?.alerts.find(a => a.check_key === k);
  const sampleRows = (a?: Alert): RecordRow[] => (a?.sample || []).map(s => ({
    lead_id: UUID_RE.test(s.ref_id || "") ? s.ref_id : null, lead_name: s.label, detail: s.detail, amount: null, event_date: null,
  }));
  const drillTotal = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  // Marketing headline: paid sources only (organic has no spend to divide).
  const paid = (data?.marketing.sources || []).filter(s => s.group === "paid");
  const paidSpend = paid.reduce((s, x) => s + Number(x.spend || 0), 0);
  const paidWon = paid.reduce((s, x) => s + x.jobs_won, 0);
  const costPerJob = paidWon > 0 && paidSpend > 0 ? paidSpend / paidWon : null;

  const apptNoResult = alertBy("dq_appointment_without_outcome");
  const otherAlerts = (data?.alerts || []).filter(a => !COVERED.has(a.check_key));

  const actions = now ? [
    { show: true, n: String(now.new_uncontacted_24h), urgent: now.new_uncontacted_24h > 0,
      title: "New leads nobody has called yet", sub: "Waiting more than 24 hours. Every hour lowers the chance of booking.",
      onClick: () => setDrill({ title: "New leads nobody has called", metrics: ["new_uncontacted_24h"] }) },
    { show: true, n: String(apptNoResult?.offender_count ?? 0), urgent: (apptNoResult?.offender_count ?? 0) > 0,
      title: "Site visits with no result recorded", sub: "Did they want an estimate? Without this, the pipeline is guesswork.",
      onClick: () => setDrill({ title: "Site visits with no result", staticRows: sampleRows(apptNoResult) }) },
    { show: true, n: money(now.owed_now), urgent: now.owed_now > 0,
      title: "Owed for finished work", sub: "Work is done. Call to collect.",
      onClick: () => setDrill({ title: "Owed for finished work", metrics: ["owed_now"] }) },
    { show: true, n: String(now.deposits_pending), urgent: now.deposits_pending > 0,
      title: "Signed jobs with no deposit yet", sub: `${money(now.deposits_pending_value)} signed. No deposit, no schedule.`,
      onClick: () => setDrill({ title: "Signed, waiting on deposit", metrics: ["deposits_pending"] }) },
    { show: true, n: String(now.open_estimates), urgent: false,
      title: "Estimates waiting on a decision", sub: `${money(now.open_estimates_value)} quoted. Follow up before they go cold.`,
      onClick: () => setDrill({ title: "Estimates waiting on a decision", metrics: ["open_estimates"] }) },
    { show: true, n: String(now.followups_overdue), urgent: now.followups_overdue > 0,
      title: "Follow-ups overdue",
      sub: now.followups_overdue_30d > 0 ? `${now.followups_overdue_30d} are over 30 days late. Most are likely dead and should be closed.` : "Past their follow-up date.",
      onClick: () => setDrill({ title: "Follow-ups overdue", metrics: ["followups_overdue"] }) },
  ] : [];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Period */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-bold">How the business is doing</h1>
          <p className="text-sm text-muted-foreground">{customInvalid ? "Pick a valid date range" : fmtRange(period.from, period.to)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map(x => (
            <button key={x.key} onClick={() => setPreset(x.key)}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${preset === x.key ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted"}`}>
              {x.label}
            </button>
          ))}
          {preset === "custom" && (
            <div className="flex items-center gap-1.5 ml-1">
              <input type="date" value={custom.from} max={today} onChange={e => setCustom(v => ({ ...v, from: e.target.value }))} className="text-xs rounded-md border border-border bg-background px-2 py-1" />
              <span className="text-xs text-muted-foreground">to</span>
              <input type="date" value={custom.to} max={today} onChange={e => setCustom(v => ({ ...v, to: e.target.value }))} className="text-xs rounded-md border border-border bg-background px-2 py-1" />
            </div>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Could not load: {error}</div>}

      {/* 1. Money */}
      <div className={`grid gap-3 md:grid-cols-3 ${loading ? "opacity-60" : ""}`}>
        <button onClick={() => setDrill({ title: "Sold", metrics: ["jobs_signed", "change_orders", "cancelled"], usePeriod: true })}
          className="text-left rounded-xl border border-border bg-card p-5 hover:border-foreground/30 transition-colors">
          <p className="text-sm text-muted-foreground">We sold</p>
          <p className="text-3xl font-bold mt-1">{money(c?.net_sold)}</p>
          <p className="text-xs text-muted-foreground mt-2">
            {c ? `${plural(c.jobs_signed, "new job")}${c.change_orders ? ` + ${plural(c.change_orders, "change order")}` : ""}${c.cancelled_value ? `, minus ${money(c.cancelled_value)} cancelled` : ""}` : "…"}
          </p>
          {prev && <p className="text-xs text-muted-foreground">{presetInfo.prevWord}: {money(prev.net_sold)}</p>}
        </button>
        <button onClick={() => setDrill({ title: "Collected", metrics: ["cash_collected"], usePeriod: true })}
          className="text-left rounded-xl border border-border bg-card p-5 hover:border-foreground/30 transition-colors">
          <p className="text-sm text-muted-foreground">We collected</p>
          <p className="text-3xl font-bold mt-1 text-emerald-700">{money(c?.cash_collected)}</p>
          <p className="text-xs text-muted-foreground mt-2">Payments received{c?.refunds ? `, after ${money(c.refunds)} refunded` : ""}</p>
          {prev && <p className="text-xs text-muted-foreground">{presetInfo.prevWord}: {money(prev.cash_collected)}</p>}
        </button>
        <button onClick={() => setDrill({ title: "Owed for finished work", metrics: ["owed_now"] })}
          className="text-left rounded-xl border border-border bg-card p-5 hover:border-foreground/30 transition-colors">
          <p className="text-sm text-muted-foreground">Customers owe us now</p>
          <p className={`text-3xl font-bold mt-1 ${now?.owed_now ? "text-red-600" : ""}`}>{money(now?.owed_now)}</p>
          <p className="text-xs text-muted-foreground mt-2">For finished work only</p>
          {now && <p className="text-xs text-muted-foreground">Plus {money(now.not_yet_due)} on jobs not finished yet</p>}
        </button>
      </div>

      {/* 2. Leads */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Leads that came in</h2>
          <p className="text-xs text-muted-foreground">
            {data && !data.marketing.cohort_is_mature ? "Followed to today. Some can still turn into jobs." : "Followed to today."}
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Leads", n: f?.leads, m: "funnel_leads" },
            { label: "Site visits", n: f?.appointments, m: "funnel_appointments" },
            { label: "Estimates", n: f?.estimates, m: "funnel_estimates" },
            { label: "Jobs won", n: f?.won, m: "funnel_won" },
          ].map((s, i) => (
            <button key={s.m} onClick={() => setDrill({ title: s.label, metrics: [s.m], usePeriod: true })}
              className="relative text-left rounded-lg bg-muted/40 px-4 py-3 hover:bg-muted transition-colors">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-bold">{s.n ?? "…"}</p>
              {i > 0 && f && f.leads > 0 && <p className="text-xs text-muted-foreground">{Math.round(((s.n || 0) / f.leads) * 100)}% of leads</p>}
              {i < 3 && <ArrowRight className="hidden sm:block absolute -right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 z-10" />}
            </button>
          ))}
        </div>
        {data && (
          <p className="mt-4 text-sm">
            Ad spend <b>{money(paidSpend)}</b>
            {costPerJob != null
              ? <> · cost per job won <b>{money(costPerJob)}</b> · those jobs are worth <b>{money(f?.won_value)}</b></>
              : paidSpend > 0 ? <> · <span className="text-red-600">no paid jobs won yet from these leads</span></> : null}
          </p>
        )}
      </section>

      {/* 3. Action */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 pt-5 pb-2">
          <h2 className="font-semibold">Needs action</h2>
          <p className="text-xs text-muted-foreground">Right now, whatever dates are picked above. Click a line to see who.</p>
        </div>
        <div className="divide-y divide-border">
          {actions.map(a => (
            <button key={a.title} onClick={a.onClick} className="w-full flex items-center gap-4 px-5 py-3 text-left hover:bg-muted/40 transition-colors">
              <span className={`w-20 shrink-0 text-right text-xl font-bold ${a.urgent ? "text-red-600" : ""}`}>{a.n}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{a.title}</span>
                <span className="block text-xs text-muted-foreground">{a.sub}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ))}
          {otherAlerts.length > 0 && (
            <div>
              <button onClick={() => setShowOther(v => !v)} className="w-full flex items-center gap-2 px-5 py-2.5 text-xs text-muted-foreground hover:bg-muted/40">
                {showOther ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {plural(otherAlerts.length, "other check")} flagged (data and admin)
              </button>
              {showOther && otherAlerts.map(a => {
                const open = openAlert === a.check_key;
                return (
                  <div key={a.check_key} className="border-t border-border bg-muted/10">
                    <button onClick={() => setOpenAlert(open ? null : a.check_key)} className="w-full flex items-center gap-3 px-5 py-2 text-left text-sm hover:bg-muted/40">
                      <span className="w-20 shrink-0 text-right font-semibold">{a.offender_count}</span>
                      <span className="flex-1">{a.title}</span>
                      {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </button>
                    {open && (
                      <div className="px-5 pb-3 pl-28 space-y-1.5">
                        <p className="text-xs text-muted-foreground"><b className="text-foreground">What to do:</b> {a.solution}</p>
                        <button onClick={() => a.check_key === "acc_tasks_overdue_by_owner" ? router.push("/tasks") : setDrill({ title: a.title, staticRows: sampleRows(a) })}
                          className="text-xs font-medium text-primary hover:underline">See who →</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 4. Sources */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 pt-5 pb-2 flex items-baseline justify-between gap-2">
          <h2 className="font-semibold">Where the leads came from</h2>
          <button onClick={() => router.push("/kpi")} className="text-xs text-primary font-medium">Full KPI report →</button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border">
              <th className="px-5 py-2 text-left font-medium">Source</th>
              <th className="px-3 py-2 text-right font-medium">Leads</th>
              <th className="px-3 py-2 text-right font-medium">Jobs won</th>
              <th className="px-3 py-2 text-right font-medium">Ad spend</th>
              <th className="px-5 py-2 text-right font-medium">Cost per job</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(data?.marketing.sources || []).map(s => (
              <tr key={s.source_id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setDrill({ title: `${s.source} leads`, metrics: ["funnel_leads"], usePeriod: true, sourceId: s.source_id })}>
                <td className="px-5 py-2 font-medium">{s.source}</td>
                <td className="px-3 py-2 text-right">{s.leads}</td>
                <td className="px-3 py-2 text-right">{s.jobs_won || <span className="text-muted-foreground">0</span>}</td>
                <td className="px-3 py-2 text-right">{s.spend ? money(s.spend) : <span className="text-muted-foreground">free</span>}</td>
                <td className="px-5 py-2 text-right font-semibold">
                  {s.cost_per_job != null ? money(s.cost_per_job) : s.spend ? <span className="font-normal text-muted-foreground">no job yet</span> : "—"}
                </td>
              </tr>
            ))}
            {data && data.marketing.sources.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-6 text-center text-muted-foreground">No leads in these dates.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Records panel */}
      {drill && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setDrill(null)} />
          <aside className="fixed right-0 top-0 z-40 h-full w-full max-w-md bg-background border-l border-border shadow-xl flex flex-col">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
              <div>
                <h3 className="font-bold">{drill.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {drill.usePeriod ? fmtRange(period.from, period.to) : "Right now"} · {rowsLoading ? "loading…" : plural(rows.length, "record")}
                  {!rowsLoading && drillTotal !== 0 && <> · {money(drillTotal)}</>}
                </p>
              </div>
              <button onClick={() => setDrill(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-border">
              {rowsLoading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
              {!rowsLoading && rows.length === 0 && <p className="px-5 py-8 text-sm text-muted-foreground">Nobody here.</p>}
              {rows.map((r, i) => (
                <button key={`${r.lead_id}-${i}`} disabled={!r.lead_id} onClick={() => r.lead_id && openLead(r.lead_id)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-2.5 text-left hover:bg-muted/40 disabled:hover:bg-transparent">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.lead_name || "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.detail}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {r.amount != null && Number(r.amount) !== 0 && <p className={`text-sm font-semibold ${Number(r.amount) < 0 ? "text-red-600" : ""}`}>{money(r.amount)}</p>}
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
  );
}
