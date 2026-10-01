"use client";

// Management Summary — the owner's page (Sprint 2).
// Every number comes from ONE database call (management_summary) built on the same views the KPI
// pages use, so this page can never disagree with them. Every number is clickable and opens the
// records behind it (management_summary_records).
//
// Two lenses, never mixed:
//   • Company health = sales by the date they were SIGNED, cash by the date it was RECEIVED.
//   • Marketing      = leads RECEIVED in the period, followed to today (a lead won next month still
//                      credits this period's ad spend). This is how cost per job is measured.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import LeadDetailDialog from "@/components/leads/LeadDetailDialog";
import NeedsAttentionStrip from "@/components/dashboard/NeedsAttentionStrip";
import PipelineSummary from "@/components/dashboard/PipelineSummary";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronDown, ChevronRight, X, Wallet, Clock,
  Hammer, Banknote, Megaphone, HeartPulse, Users, Loader2,
} from "lucide-react";

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
type Alert = {
  check_key: string; severity: string; title: string; offender_count: number; previous_count: number | null;
  trend: string | null; why_it_matters: string; solution: string;
  sample: { ref_id: string; label: string; detail: string }[] | null;
};
type Summary = {
  period: { from: string; to: string; prev_from: string; prev_to: string; timezone: string; generated_at: string };
  current: Metrics; previous: Metrics;
  funnel: { leads: number; appointments: number; estimates: number; won: number; won_value: number; lost: number; still_open: number };
  marketing: { cohort_is_mature: boolean; sources: Source[] };
  company_health: { group: string; jobs: number; gross: number; net: number }[];
  right_now: {
    owed_now: number; held_for_callback: number; not_yet_due: number; deposits_pending: number;
    deposits_pending_value: number; open_leads: number; open_estimates: number; open_estimates_value: number;
    followups_overdue: number; followups_overdue_30d: number; followups_due_today: number;
    new_uncontacted_24h: number; open_no_salesperson: number;
  };
  alerts: Alert[];
  tasks_by_owner: { owner: string; open: number; overdue: number; overdue_7d: number }[];
};
type RecordRow = { lead_id: string | null; lead_name: string | null; detail: string | null; amount: number | null; event_date: string | null };
type Drill = { title: string; metrics: string[]; sourceId?: string; usePeriod: boolean };

// ---------- date helpers (company calendar days, pure string math — no browser-timezone drift) ----------
type Preset = "this_week" | "last_week" | "mtd" | "last_month" | "ytd" | "custom";
const PRESETS: { key: Preset; label: string }[] = [
  { key: "this_week", label: "This week" }, { key: "last_week", label: "Last week" },
  { key: "mtd", label: "Month to date" }, { key: "last_month", label: "Last month" },
  { key: "ytd", label: "Year to date" }, { key: "custom", label: "Custom" },
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
  const dow = (toD(today).getUTCDay() + 6) % 7;            // Monday = 0
  const monday = addDays(today, -dow);
  switch (p) {
    case "this_week":  return { from: monday, to: today, prevFrom: addDays(monday, -7), prevTo: addDays(today, -7) };
    case "last_week":  return { from: addDays(monday, -7), to: addDays(monday, -1), prevFrom: addDays(monday, -14), prevTo: addDays(monday, -8) };
    case "mtd":        { const f = monthStart(today); return { from: f, to: today, prevFrom: addMonths(f, -1), prevTo: addMonths(today, -1) }; }
    case "last_month": { const f = addMonths(monthStart(today), -1); return { from: f, to: monthEnd(f), prevFrom: addMonths(f, -1), prevTo: monthEnd(addMonths(f, -1)) }; }
    case "ytd":        { const f = today.slice(0, 4) + "-01-01"; return { from: f, to: today, prevFrom: addMonths(f, -12), prevTo: addMonths(today, -12) }; }
    default:           return { from: custom.from, to: custom.to, prevFrom: null as string | null, prevTo: null as string | null };
  }
}
const fmtDay = (s: string) => toD(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const fmtRange = (a: string, b: string) => (a === b ? fmtDay(a) : `${fmtDay(a)} – ${fmtDay(b)}`);

// ---------- number helpers ----------
const money = (n: number | null | undefined) => n == null ? "—" : `$${Math.round(Number(n)).toLocaleString()}`;
const num = (n: number | null | undefined) => n == null ? "—" : Number(n).toLocaleString();
const pct = (n: number | null | undefined) => n == null ? "—" : `${n}%`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GROUP_LABEL: Record<string, string> = { paid: "Paid ads", organic_referral: "Organic & referral", repeat: "Repeat clients", other: "Other" };
const SEV_DOT: Record<string, string> = { critical: "bg-red-600", high: "bg-amber-500", medium: "bg-yellow-400", low: "bg-slate-300" };

function Delta({ cur, prev, goodWhenUp = true, neutral = false }: { cur: number; prev: number; goodWhenUp?: boolean; neutral?: boolean }) {
  if (prev === 0 && cur === 0) return <span className="text-xs text-muted-foreground">no change</span>;
  if (prev === 0) return <span className="text-xs text-muted-foreground">none last period</span>;
  const change = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  if (change === 0) return <span className="text-xs text-muted-foreground">same as last period</span>;
  const up = change > 0;
  const good = neutral ? null : up === goodWhenUp;
  const color = good === null ? "text-muted-foreground" : good ? "text-emerald-600" : "text-red-600";
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${color}`}><Icon className="h-3 w-3" />{Math.abs(change)}%</span>;
}

function Section({ title, icon: Icon, note, children, right }: { title: string; icon: any; note?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-muted/20">
        <div className="min-w-0">
          <h2 className="text-sm font-bold flex items-center gap-2"><Icon className="h-4 w-4 text-muted-foreground" />{title}</h2>
          {note && <p className="text-xs text-muted-foreground mt-0.5">{note}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function ManagementSummaryPage() {
  const router = useRouter();
  const [tz, setTz] = useState("America/New_York");
  const [preset, setPreset] = useState<Preset>("mtd");
  const [custom, setCustom] = useState<{ from: string; to: string }>(() => {
    const t = todayIn("America/New_York"); return { from: monthStart(t), to: t };
  });
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [drill, setDrill] = useState<Drill | null>(null);
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [openAlert, setOpenAlert] = useState<string | null>(null);

  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);

  const today = todayIn(tz);
  const period = useMemo(() => periodFor(preset, today, custom), [preset, today, custom]);
  const customInvalid = preset === "custom" && (!custom.from || !custom.to || custom.to < custom.from);

  useEffect(() => {
    supabase.from("companies").select("timezone").limit(1).then(({ data }) => {
      const z = (data as any[])?.[0]?.timezone; if (z) setTz(z);
    });
  }, []);

  useEffect(() => {
    if (customInvalid) return;
    let cancelled = false;
    setLoading(true); setError(null);
    supabase.rpc("management_summary", {
      p_from: period.from, p_to: period.to, p_prev_from: period.prevFrom, p_prev_to: period.prevTo,
    }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) { console.error("management_summary", error); setError(error.message); setData(null); }
      else setData(data as Summary);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [period.from, period.to, period.prevFrom, period.prevTo, customInvalid]);

  // Records behind a number
  useEffect(() => {
    if (!drill) return;
    let cancelled = false;
    setRowsLoading(true); setRows([]);
    Promise.all(drill.metrics.map(m => supabase.rpc("management_summary_records", {
      p_metric: m,
      p_from: drill.usePeriod ? period.from : null,
      p_to: drill.usePeriod ? period.to : null,
      p_source_id: drill.sourceId ?? null,
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

  const c = data?.current, p = data?.previous, now = data?.right_now;
  const drillTotal = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const show = (title: string, metrics: string[], usePeriod = true, sourceId?: string) => setDrill({ title, metrics, usePeriod, sourceId });

  // ---------- KPI cards for the period ----------
  const cards = c && p ? [
    { label: "New leads", value: num(c.new_leads), cur: c.new_leads, prev: p.new_leads, sub: c.duplicates ? `${c.duplicates} duplicate inquiries not counted` : "Received in period", m: ["new_leads"] },
    { label: "Appointments", value: num(c.appointments), cur: c.appointments, prev: p.appointments, sub: "Site visits dated in period", m: ["appointments"] },
    { label: "Estimates sent", value: num(c.estimates_sent), cur: c.estimates_sent, prev: p.estimates_sent, sub: `${money(c.estimates_value)} quoted`, m: ["estimates_sent"] },
    { label: "Contracts signed", value: num(c.jobs_signed), cur: c.jobs_signed_value, prev: p.jobs_signed_value, sub: `${money(c.jobs_signed_value)} new jobs`, m: ["jobs_signed"] },
    { label: "Change orders", value: money(c.change_orders_value), cur: c.change_orders_value, prev: p.change_orders_value, sub: `${c.change_orders} signed`, m: ["change_orders"] },
    { label: "Sold (net)", value: money(c.net_sold), cur: c.net_sold, prev: p.net_sold, sub: c.cancelled_value ? `after ${money(c.cancelled_value)} cancelled` : "Contracts + change orders − cancellations", m: ["jobs_signed", "change_orders", "cancelled"] },
    { label: "Cash collected", value: money(c.cash_collected), cur: c.cash_collected, prev: p.cash_collected, sub: c.refunds ? `after ${money(c.refunds)} refunded` : "Payments received in period", m: ["cash_collected"] },
    { label: "Ad spend", value: money(c.ad_spend), cur: c.ad_spend, prev: p.ad_spend, sub: "Prorated to these dates", m: [] as string[], neutral: true },
  ] : [];

  const funnelSteps = data ? [
    { label: "Leads received", n: data.funnel.leads, m: "funnel_leads" },
    { label: "Got an appointment", n: data.funnel.appointments, m: "funnel_appointments" },
    { label: "Got an estimate", n: data.funnel.estimates, m: "funnel_estimates" },
    { label: "Won", n: data.funnel.won, m: "funnel_won" },
  ] : [];

  return (
    <div className="space-y-6 max-w-7xl">
      <NeedsAttentionStrip />

      {/* Period picker */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-lg font-bold">Management Summary</h1>
          <p className="text-xs text-muted-foreground">
            {customInvalid ? "Pick a valid date range" : <>{fmtRange(period.from, period.to)}
              {data && <> · compared with {fmtRange(data.period.prev_from, data.period.prev_to)}</>}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map(x => (
            <button key={x.key} onClick={() => setPreset(x.key)}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${preset === x.key ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
              {x.label}
            </button>
          ))}
          {preset === "custom" && (
            <div className="flex items-center gap-1.5 ml-1">
              <input type="date" value={custom.from} max={today} onChange={e => setCustom(v => ({ ...v, from: e.target.value }))}
                className="text-xs rounded-md border border-border bg-background px-2 py-1" />
              <span className="text-xs text-muted-foreground">to</span>
              <input type="date" value={custom.to} max={today} onChange={e => setCustom(v => ({ ...v, to: e.target.value }))}
                className="text-xs rounded-md border border-border bg-background px-2 py-1" />
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load the summary: {error}
        </div>
      )}

      {/* Money right now */}
      <Section title="Money right now" icon={Wallet} note="Current position, not tied to the dates above">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border">
          {[
            { label: "Owed now", value: money(now?.owed_now), sub: "Finished work, not yet paid", m: "owed_now", tone: "text-red-600" },
            { label: "Deposits pending", value: now ? `${now.deposits_pending}` : "…", sub: now ? `${money(now.deposits_pending_value)} signed, no deposit yet` : "", m: "deposits_pending", tone: "text-amber-600" },
            { label: "Held for callbacks", value: money(now?.held_for_callback), sub: "Customer holding until a fix is done", m: "held_for_callback", tone: "" },
            { label: "Signed, not yet due", value: money(now?.not_yet_due), sub: "Work not started or in progress", m: "not_yet_due", tone: "" },
          ].map(t => (
            <button key={t.m} onClick={() => show(t.label, [t.m], false)} className="text-left px-5 py-4 hover:bg-muted/40 transition-colors">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.label}</p>
              <p className={`text-xl font-bold mt-1 ${t.tone}`}>{loading && !now ? "…" : t.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t.sub}</p>
            </button>
          ))}
        </div>
      </Section>

      {/* Period KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(cards.length ? cards : Array.from({ length: 8 }).map((_, i) => ({ label: "", value: "…", cur: 0, prev: 0, sub: "", m: [], i }))).map((k: any, i: number) => (
          <button key={k.label || i} disabled={!k.m.length} onClick={() => show(k.label, k.m)}
            className="text-left rounded-xl border border-border bg-card p-4 shadow-sm hover:border-primary/40 hover:shadow-md transition-all disabled:hover:border-border disabled:hover:shadow-sm disabled:cursor-default">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{k.label || " "}</p>
              {cards.length > 0 && <Delta cur={k.cur} prev={k.prev} neutral={k.neutral} />}
            </div>
            <p className={`mt-1.5 text-2xl font-bold tracking-tight ${loading ? "opacity-50" : ""}`}>{k.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{k.sub}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Funnel */}
        <div className="lg:col-span-2">
          <Section title="What happened to these leads" icon={Users}
            note="Leads received in the period, followed to today">
            <div className="px-5 py-4 space-y-3">
              {funnelSteps.map((s, i) => {
                const top = funnelSteps[0]?.n || 0;
                const prevN = i === 0 ? s.n : funnelSteps[i - 1].n;
                const w = top ? Math.max(4, Math.round((s.n / top) * 100)) : 0;
                return (
                  <button key={s.m} onClick={() => show(s.label, [s.m])} className="w-full text-left group">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium group-hover:text-primary">{s.label}</span>
                      <span className="text-muted-foreground">
                        <span className="font-bold text-foreground">{s.n}</span>
                        {i > 0 && prevN > 0 && <> · {Math.round((s.n / prevN) * 100)}% of previous step</>}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary/80" style={{ width: `${w}%` }} />
                    </div>
                  </button>
                );
              })}
              {data && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-xs text-muted-foreground border-t border-border">
                  <span>Won value <b className="text-foreground">{money(data.funnel.won_value)}</b></span>
                  <button className="hover:text-primary" onClick={() => show("Still open", ["funnel_open"])}>Still open <b className="text-foreground">{data.funnel.still_open}</b></button>
                  <span>Lost / not a fit <b className="text-foreground">{data.funnel.lost}</b></span>
                </div>
              )}
            </div>
          </Section>
        </div>

        {/* Alerts */}
        <div className="lg:col-span-3">
          <Section title="Needs your attention" icon={AlertTriangle}
            note={data?.alerts?.length ? "From the daily system check — click to see who and what to do" : "From the daily system check"}>
            <div className="divide-y divide-border">
              {data && data.alerts.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Nothing flagged. All owner checks are passing.</p>}
              {(data?.alerts || []).map(a => {
                const isOpen = openAlert === a.check_key;
                const sample = a.sample || [];
                return (
                  <div key={a.check_key}>
                    <button onClick={() => setOpenAlert(isOpen ? null : a.check_key)}
                      className="w-full flex items-center gap-3 px-5 py-2.5 text-left hover:bg-muted/40 transition-colors">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${SEV_DOT[a.severity] || "bg-slate-300"}`} />
                      <span className="text-sm flex-1 min-w-0 truncate">{a.title}</span>
                      {a.previous_count != null && a.previous_count !== a.offender_count && (
                        <span className={`text-xs ${a.offender_count > a.previous_count ? "text-red-600" : "text-emerald-600"}`}>
                          {a.offender_count > a.previous_count ? "▲" : "▼"} from {a.previous_count}
                        </span>
                      )}
                      <span className="text-sm font-bold w-10 text-right">{a.offender_count}</span>
                      {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-4 pt-1 bg-muted/20 space-y-2">
                        <p className="text-xs text-muted-foreground"><b className="text-foreground">Why it matters:</b> {a.why_it_matters}</p>
                        <p className="text-xs text-muted-foreground"><b className="text-foreground">What to do:</b> {a.solution}</p>
                        <div className="rounded-lg border border-border bg-card divide-y divide-border max-h-64 overflow-y-auto">
                          {sample.map((s, i) => {
                            const isLead = UUID_RE.test(s.ref_id || "");
                            return (
                              <button key={i} disabled={!isLead && a.check_key !== "acc_tasks_overdue_by_owner"}
                                onClick={() => isLead ? openLead(s.ref_id) : router.push("/tasks")}
                                className="w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left text-xs hover:bg-muted/40 disabled:hover:bg-transparent">
                                <span className="font-medium truncate">{s.label}</span>
                                <span className="text-muted-foreground shrink-0">{s.detail}</span>
                              </button>
                            );
                          })}
                        </div>
                        {a.offender_count > sample.length && (
                          <p className="text-xs text-muted-foreground">Showing {sample.length} of {a.offender_count}.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        </div>
      </div>

      {/* Marketing — lead-month lens */}
      <Section title="Marketing: what this period's leads turned into" icon={Megaphone}
        note="Leads received in these dates, followed to today. A lead won later still counts here — this is how cost per job is measured."
        right={data && !data.marketing.cohort_is_mature
          ? <span className="text-xs px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 shrink-0">Still maturing — jobs from these leads can still close</span>
          : undefined}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                {["Source", "Leads", "Appts", "Estimates", "Won", "Sold", "Spend", "Cost / lead", "Cost / job", "Conversion", "Return"].map(h => (
                  <th key={h} className={`px-4 py-2 font-semibold ${h === "Source" ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(data?.marketing.sources || []).map(s => (
                <tr key={s.source_id} className="hover:bg-muted/30">
                  <td className="px-4 py-2">
                    <span className="font-medium">{s.source}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{GROUP_LABEL[s.group] || s.group}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button className="hover:text-primary hover:underline" onClick={() => show(`${s.source} — leads`, ["funnel_leads"], true, s.source_id)}>{s.leads}</button>
                    {s.charged_leads > 0 && s.charged_leads !== s.leads && <span className="text-xs text-muted-foreground"> ({s.charged_leads} charged)</span>}
                  </td>
                  <td className="px-4 py-2 text-right">{s.appointments}</td>
                  <td className="px-4 py-2 text-right">{s.estimates}</td>
                  <td className="px-4 py-2 text-right">
                    {s.jobs_won > 0
                      ? <button className="font-semibold hover:text-primary hover:underline" onClick={() => show(`${s.source} — won`, ["funnel_won"], true, s.source_id)}>{s.jobs_won}</button>
                      : 0}
                  </td>
                  <td className="px-4 py-2 text-right">{s.sold_value ? money(s.sold_value) : "—"}</td>
                  <td className="px-4 py-2 text-right">{s.spend ? money(s.spend) : <span className="text-muted-foreground">no spend</span>}</td>
                  <td className="px-4 py-2 text-right">{s.cost_per_lead != null ? money(s.cost_per_lead) : "—"}</td>
                  <td className="px-4 py-2 text-right font-semibold">{s.cost_per_job != null ? money(s.cost_per_job) : s.spend ? <span className="text-red-600 font-normal">no jobs yet</span> : "—"}</td>
                  <td className="px-4 py-2 text-right" title={s.conversion_basis === "charged" ? "Won ÷ charged leads" : "Won ÷ all leads (no charged leads marked)"}>
                    {pct(s.conversion_pct)}{s.conversion_basis === "all" && s.conversion_pct != null && <span className="text-muted-foreground">*</span>}
                  </td>
                  <td className="px-4 py-2 text-right">{s.roi_x != null ? `${s.roi_x}x` : "—"}</td>
                </tr>
              ))}
              {data && data.marketing.sources.length === 0 && (
                <tr><td colSpan={11} className="px-4 py-6 text-center text-sm text-muted-foreground">No leads or spend in these dates.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-xs text-muted-foreground border-t border-border">
          Conversion = jobs won ÷ charged leads. * = no leads marked charged yet, so all leads are used. Return = sold ÷ spend.
        </p>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Company health — signed-date lens */}
        <Section title="Company health: sales signed in these dates" icon={HeartPulse}
          note="By the date the contract or change order was signed — regardless of when the lead came in"
          right={<button onClick={() => router.push("/kpi/health")} className="text-xs text-primary font-medium shrink-0">Full report →</button>}>
          <div className="divide-y divide-border">
            {(data?.company_health || []).map(g => (
              <div key={g.group} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span>{GROUP_LABEL[g.group] || g.group}</span>
                <span className="text-muted-foreground text-xs">{g.jobs} new {g.jobs === 1 ? "job" : "jobs"}</span>
                <span className="font-semibold w-28 text-right">{money(g.net)}</span>
              </div>
            ))}
            {data && data.company_health.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">Nothing signed in these dates.</p>}
            {c && (
              <div className="flex items-center justify-between px-5 py-2.5 text-sm bg-muted/20">
                <span className="font-semibold">Total sold (net)</span>
                <span className="font-bold">{money(c.net_sold)}</span>
              </div>
            )}
          </div>
        </Section>

        {/* Accountability */}
        <Section title="Follow-up & accountability" icon={Clock} note="Right now, all open leads and tasks">
          <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
            {[
              { label: "Follow-ups overdue", v: now?.followups_overdue, sub: now ? `${now.followups_overdue_30d} over 30 days` : "", m: "followups_overdue" },
              { label: "New, not contacted", v: now?.new_uncontacted_24h, sub: "Waiting over 24 hours", m: "new_uncontacted_24h" },
              { label: "No salesperson", v: now?.open_no_salesperson, sub: now ? `of ${now.open_leads} open leads` : "", m: "open_no_salesperson" },
            ].map(t => (
              <button key={t.m} onClick={() => show(t.label, [t.m], false)} className="text-left px-4 py-3 hover:bg-muted/40">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.label}</p>
                <p className={`text-xl font-bold mt-0.5 ${t.v ? "text-red-600" : ""}`}>{t.v ?? "…"}</p>
                <p className="text-xs text-muted-foreground">{t.sub}</p>
              </button>
            ))}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="px-5 py-2 text-left font-semibold">Tasks by owner</th>
                <th className="px-3 py-2 text-right font-semibold">Open</th>
                <th className="px-3 py-2 text-right font-semibold">Overdue</th>
                <th className="px-5 py-2 text-right font-semibold">7+ days late</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(data?.tasks_by_owner || []).map(t => (
                <tr key={t.owner} className="hover:bg-muted/30 cursor-pointer" onClick={() => router.push("/tasks")}>
                  <td className="px-5 py-2 font-medium">{t.owner}</td>
                  <td className="px-3 py-2 text-right">{t.open}</td>
                  <td className="px-3 py-2 text-right">{t.overdue}</td>
                  <td className={`px-5 py-2 text-right font-semibold ${t.overdue_7d ? "text-red-600" : ""}`}>{t.overdue_7d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>

      {/* Open pipeline by stage (current) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1"><PipelineSummary /></div>
        <button onClick={() => show("Open estimates", ["open_estimates"], false)}
          className="lg:col-span-2 text-left rounded-xl border border-border bg-card p-5 hover:border-primary/40 transition-colors">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><Hammer className="h-3.5 w-3.5" />Open estimates waiting on a decision</p>
          <p className="text-2xl font-bold mt-1">{money(now?.open_estimates_value)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{now ? `${now.open_estimates} estimates — click to see who to follow up with` : ""}</p>
        </button>
      </div>

      {data && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Banknote className="h-3.5 w-3.5" />
          Dates are {data.period.timezone.replace("_", " ")} calendar days. Updated {new Date(data.period.generated_at).toLocaleTimeString()}.
        </p>
      )}

      {/* Records panel */}
      {drill && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setDrill(null)} />
          <aside className="fixed right-0 top-0 z-40 h-full w-full max-w-lg bg-background border-l border-border shadow-xl flex flex-col">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
              <div>
                <h3 className="font-bold">{drill.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {drill.usePeriod ? fmtRange(period.from, period.to) : "Right now"} · {rowsLoading ? "loading…" : `${rows.length} records`}
                  {!rowsLoading && drillTotal !== 0 && <> · {money(drillTotal)}</>}
                </p>
              </div>
              <button onClick={() => setDrill(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-border">
              {rowsLoading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
              {!rowsLoading && rows.length === 0 && <p className="px-5 py-8 text-sm text-muted-foreground">No records.</p>}
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

      <LeadDetailDialog
        lead={selectedLead}
        open={leadOpen}
        onOpenChange={setLeadOpen}
        onLeadUpdated={(id) => openLead(id)}
        onLeadDeleted={() => setLeadOpen(false)}
      />
    </div>
  );
}
