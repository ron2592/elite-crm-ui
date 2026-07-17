"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowLeft, Printer, Sunrise, Moon, Loader2, CheckCircle2,
  CalendarClock, Users, AlertTriangle, Trophy, RefreshCw, ClipboardList,
} from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  call: "📞 Call", appointment: "🏠 Appointment", estimate_sent: "📄 Estimate Sent",
  follow_up: "🔄 Follow-up", closed_won: "🏆 Closed Won", note: "📝 Note",
  eod_report: "📊 EOD Report", goal_set: "🎯 Goal Set", task_completed: "✅ Task Completed",
};

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-red-500", medium: "bg-amber-400", low: "bg-slate-400",
};

interface ActivityRow {
  id: string; user_name: string; activity_type: string; title: string;
  description: string | null; lead_name: string | null; activity_date: string;
  auto_generated: boolean; goals_set: Record<string, number> | null; goals_achieved: Record<string, number> | null;
}
interface TaskRow {
  id: string; title: string; assigned_to: string | null; priority: string;
  due_date: string | null; lead_name: string | null; status: string;
}
interface ApptRow {
  id: string; lead_name: string; appointment_at: string; appointment_notes: string | null;
  metadata: any; phone: string | null;
}

function toDateStr(d: Date) { return d.toISOString().split("T")[0]; }
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function fmtLongDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
function isOverdue(t: TaskRow, today: string) { return !!t.due_date && t.due_date < today; }

export default function DailyReportPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"sod" | "eod">("sod");
  const [loading, setLoading] = useState(true);

  const today = toDateStr(new Date());
  const yestD = new Date(); yestD.setDate(yestD.getDate() - 1);
  const yesterday = toDateStr(yestD);
  const tomD = new Date(); tomD.setDate(tomD.getDate() + 1);
  const tomorrow = toDateStr(tomD);

  const [yesterdayActivities, setYesterdayActivities] = useState<ActivityRow[]>([]);
  const [todayActivities,     setTodayActivities]     = useState<ActivityRow[]>([]);
  const [todayAppts,          setTodayAppts]          = useState<ApptRow[]>([]);
  const [tomorrowAppts,       setTomorrowAppts]       = useState<ApptRow[]>([]);
  const [dueTasks,            setDueTasks]            = useState<TaskRow[]>([]);
  const [carryTasks,          setCarryTasks]          = useState<TaskRow[]>([]);
  const [eodReportToday,      setEodReportToday]      = useState<ActivityRow | null>(null);

  async function load() {
    setLoading(true);

    const startToday = new Date(today + "T00:00:00").toISOString();
    const endToday    = new Date(today + "T23:59:59").toISOString();
    const startTom    = new Date(tomorrow + "T00:00:00").toISOString();
    const endTom      = new Date(tomorrow + "T23:59:59").toISOString();

    const [yA, tA, tasksRes, eod, apptsToday, apptsTom] = await Promise.all([
      supabase.from("activities").select("*").eq("activity_date", yesterday).order("created_at"),
      supabase.from("activities").select("*").eq("activity_date", today).order("created_at"),
      supabase.from("tasks").select("id, title, assigned_to, priority, due_date, lead_name, status").neq("status", "done").order("due_date", { ascending: true, nullsFirst: false }),
      supabase.from("activities").select("*").eq("activity_type", "eod_report").eq("activity_date", today).maybeSingle(),
      supabase.from("leads").select("id, lead_name, appointment_at, appointment_notes, metadata, phone").eq("archived", false).gte("appointment_at", startToday).lte("appointment_at", endToday).order("appointment_at"),
      supabase.from("leads").select("id, lead_name, appointment_at, appointment_notes, metadata, phone").eq("archived", false).gte("appointment_at", startTom).lte("appointment_at", endTom).order("appointment_at"),
    ]);

    setYesterdayActivities((yA.data as ActivityRow[]) || []);
    setTodayActivities((tA.data as ActivityRow[]) || []);
    setEodReportToday((eod.data as ActivityRow | null) || null);

    const allOpen = (tasksRes.data as TaskRow[]) || [];
    setDueTasks(allOpen.filter(t => !t.due_date || t.due_date <= today));
    setCarryTasks(allOpen.filter(t => !t.due_date || t.due_date <= tomorrow));

    setTodayAppts((apptsToday.data as ApptRow[]) || []);
    setTomorrowAppts((apptsTom.data as ApptRow[]) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const wins = yesterdayActivities.filter(a =>
    ["closed_won", "task_completed", "appointment", "estimate_sent"].includes(a.activity_type)
  );
  const overdueCount = dueTasks.filter(t => isOverdue(t, today)).length;

  const activityCountsToday: Record<string, number> = {};
  todayActivities.forEach(a => { activityCountsToday[a.activity_type] = (activityCountsToday[a.activity_type] || 0) + 1; });

  const Section = ({ icon, title, children, accent }: { icon: React.ReactNode; title: string; children: React.ReactNode; accent?: string }) => (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <p className={`text-sm font-bold ${accent || ""}`}>{title}</p>
      </div>
      {children}
    </div>
  );

  const ApptRowItem = ({ a }: { a: ApptRow }) => (
    <div className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
      <span className="text-xs font-semibold text-primary shrink-0 w-16">{fmtTime(a.appointment_at)}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{a.lead_name || "Unnamed lead"}</p>
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          {a.metadata?.salesperson && <span className="text-xs text-muted-foreground">→ {a.metadata.salesperson}</span>}
          {a.phone && <span className="text-xs text-muted-foreground">{a.phone}</span>}
        </div>
        {a.appointment_notes && <p className="text-xs text-muted-foreground mt-0.5">{a.appointment_notes}</p>}
      </div>
    </div>
  );

  const TaskRowItem = ({ t }: { t: TaskRow }) => (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${PRIORITY_DOT[t.priority] || "bg-slate-400"}`} />
      <span className="text-sm flex-1 min-w-0 truncate">{t.title}</span>
      {t.assigned_to && <span className="text-xs text-muted-foreground shrink-0">→ {t.assigned_to}</span>}
      {isOverdue(t, today) && (
        <span className="text-xs font-semibold text-red-600 shrink-0">Overdue</span>
      )}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          aside, header { display: none !important; }
          body { margin: 0; }
        }
      `}</style>

      {/* Header */}
      <div className="no-print flex items-center justify-between flex-wrap gap-3">
        <button onClick={() => router.push("/activities")}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Activities
        </button>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground transition-colors">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button onClick={() => setMode("sod")}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 font-medium transition-colors ${mode === "sod" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}>
              <Sunrise className="h-3.5 w-3.5" /> Morning Brief
            </button>
            <button onClick={() => setMode("eod")}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 border-l border-border font-medium transition-colors ${mode === "eod" ? "bg-violet-600 text-white" : "hover:bg-muted text-muted-foreground"}`}>
              <Moon className="h-3.5 w-3.5" /> End of Day
            </button>
          </div>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground transition-colors">
            <Printer className="h-3.5 w-3.5" /> Export PDF
          </button>
        </div>
      </div>

      {/* Title */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          {mode === "sod" ? "Morning Brief" : "End of Day Recap"}
        </h1>
        <p className="text-xs text-muted-foreground">{fmtLongDate(today)}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : mode === "sod" ? (
        <div className="space-y-4">
          {/* Yesterday's wins */}
          <Section icon={<Trophy className="h-4 w-4 text-amber-500" />} title={`Yesterday's Wins (${fmtLongDate(yesterday)})`}>
            {wins.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing logged yesterday.</p>
            ) : (
              <div className="space-y-1">
                {wins.map(a => (
                  <div key={a.id} className="flex items-center gap-2 text-sm py-1 border-b border-border/50 last:border-0">
                    <span className="text-xs shrink-0">{TYPE_LABELS[a.activity_type] || a.activity_type}</span>
                    <span className="flex-1 min-w-0 truncate">{a.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{a.user_name}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Today's appointments */}
          <Section icon={<CalendarClock className="h-4 w-4 text-emerald-600" />} title={`Today's Appointments (${todayAppts.length})`}>
            {todayAppts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No appointments scheduled today.</p>
            ) : todayAppts.map(a => <ApptRowItem key={a.id} a={a} />)}
          </Section>

          {/* Today's tasks / overdue */}
          <Section
            icon={<AlertTriangle className={`h-4 w-4 ${overdueCount > 0 ? "text-red-500" : "text-muted-foreground"}`} />}
            title={`Today's Tasks (${dueTasks.length})${overdueCount > 0 ? ` — ${overdueCount} overdue` : ""}`}
            accent={overdueCount > 0 ? "text-red-600" : ""}
          >
            {dueTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing due today. Clean slate.</p>
            ) : dueTasks.map(t => <TaskRowItem key={t.id} t={t} />)}
          </Section>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Today's full activity log */}
          <Section icon={<Users className="h-4 w-4 text-primary" />} title={`Today's Activity (${todayActivities.length})`}>
            {todayActivities.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing logged yet today.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {Object.entries(activityCountsToday).map(([type, count]) => (
                    <span key={type} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                      {count}× {(TYPE_LABELS[type] || type).replace(/^\S+\s/, "")}
                    </span>
                  ))}
                </div>
                <div className="space-y-1">
                  {todayActivities.map(a => (
                    <div key={a.id} className="flex items-center gap-2 text-sm py-1 border-b border-border/50 last:border-0">
                      <span className="text-xs shrink-0">{TYPE_LABELS[a.activity_type] || a.activity_type}</span>
                      <span className="flex-1 min-w-0 truncate">{a.title}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{a.user_name}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Section>

          {/* Goals vs actual */}
          <Section icon={<CheckCircle2 className="h-4 w-4 text-violet-600" />} title="Goals vs Actual">
            {!eodReportToday ? (
              <p className="text-xs text-muted-foreground">
                No EOD report submitted yet today — head to Activities → EOD Report to log it.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.keys(eodReportToday.goals_set || {}).map(key => {
                  const set = eodReportToday.goals_set?.[key] ?? 0;
                  const achieved = eodReportToday.goals_achieved?.[key] ?? 0;
                  const pct = set > 0 ? Math.min(100, Math.round((achieved / set) * 100)) : 0;
                  return (
                    <div key={key} className="rounded-lg bg-muted/30 p-2 text-center">
                      <p className="text-xs text-muted-foreground mb-1 capitalize">{key.replace("_", " ")}</p>
                      <p className="text-sm font-bold">{achieved}<span className="text-muted-foreground font-normal"> / {set}</span></p>
                      <p className={`text-xs mt-0.5 font-medium ${pct >= 100 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-red-500"}`}>{pct}%</p>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Carrying into tomorrow */}
          <Section icon={<CalendarClock className="h-4 w-4 text-amber-600" />} title={`Carrying Into Tomorrow (${fmtLongDate(tomorrow)})`}>
            {tomorrowAppts.length === 0 && carryTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing on the books yet.</p>
            ) : (
              <>
                {tomorrowAppts.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Appointments</p>
                    {tomorrowAppts.map(a => <ApptRowItem key={a.id} a={a} />)}
                  </div>
                )}
                {carryTasks.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Open Tasks</p>
                    {carryTasks.map(t => <TaskRowItem key={t.id} t={t} />)}
                  </div>
                )}
              </>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
