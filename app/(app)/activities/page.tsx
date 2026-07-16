"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { matchesSearch } from "@/lib/utils";
import {
  Phone, RefreshCw, Plus, X, Save, Loader2,
  CalendarDays, ChevronDown, ChevronUp,
  Link2, FileText, CheckCircle2, Users,
  Target, TrendingUp, Search,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Activity {
  id: string;
  user_name: string;
  activity_type: string;
  title: string;
  description: string | null;
  lead_id: string | null;
  lead_name: string | null;
  goals_set: Record<string, number> | null;
  goals_achieved: Record<string, number> | null;
  activity_date: string;
  created_at: string;
}

interface LeadOption { id: string; lead_name: string; phone: string | null }

// ── Constants ─────────────────────────────────────────────────────────────────
const USERS = ["Ron", "Ray", "Nelly"];

const ACTIVITY_TYPES = [
  { value: "call",           label: "📞 Call",           color: "bg-blue-100 text-blue-700" },
  { value: "appointment",    label: "🏠 Appointment",    color: "bg-emerald-100 text-emerald-700" },
  { value: "estimate_sent",  label: "📄 Estimate Sent",  color: "bg-orange-100 text-orange-700" },
  { value: "follow_up",      label: "🔄 Follow-up",      color: "bg-amber-100 text-amber-700" },
  { value: "closed_won",     label: "🏆 Closed Won",     color: "bg-green-100 text-green-700" },
  { value: "note",           label: "📝 Note",           color: "bg-slate-100 text-slate-600" },
  { value: "eod_report",     label: "📊 EOD Report",     color: "bg-violet-100 text-violet-700" },
  { value: "goal_set",       label: "🎯 Goal Set",       color: "bg-pink-100 text-pink-700" },
  { value: "task_completed", label: "✅ Task Completed", color: "bg-teal-100 text-teal-700" },
];

const TYPE_MAP = Object.fromEntries(ACTIVITY_TYPES.map(t => [t.value, t]));

// EOD goal fields
const GOAL_FIELDS = [
  { key: "calls",       label: "Calls" },
  { key: "appts",       label: "Appointments" },
  { key: "estimates",   label: "Estimates" },
  { key: "follow_ups",  label: "Follow-ups" },
];

function todayStr() { return new Date().toISOString().split("T")[0]; }

function formatDate(d: string) {
  const date = new Date(d);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d === todayStr()) return "Today";
  if (d === yesterday.toISOString().split("T")[0]) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ActivitiesPage() {
  const [activities,  setActivities]  = useState<Activity[]>([]);
  const [leads,       setLeads]       = useState<LeadOption[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [activeTab,   setActiveTab]   = useState<"log" | "eod">("log");

  // ── Filters ────────────────────────────────────────────────────────────────
  const [filterUser,   setFilterUser]   = useState("");
  const [filterType,   setFilterType]   = useState("");
  const [filterDate,   setFilterDate]   = useState("");
  const [search,       setSearch]       = useState("");

  // ── Log form ───────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    user_name:     "",
    activity_type: "call",
    title:         "",
    description:   "",
    lead_id:       "",
    activity_date: todayStr(),
  });

  // ── EOD form ───────────────────────────────────────────────────────────────
  const [eodForm, setEodForm] = useState({
    user_name:    "",
    activity_date: todayStr(),
    goals_set:     { calls: 0, appts: 0, estimates: 0, follow_ups: 0 },
    goals_achieved:{ calls: 0, appts: 0, estimates: 0, follow_ups: 0 },
    notes:         "",
  });

  const [leadSearch,    setLeadSearch]    = useState("");
  const [showLeadDrop,  setShowLeadDrop]  = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  async function fetchActivities() {
    setLoading(true);
    const { data } = await supabase
      .from("activities")
      .select("*")
      .order("activity_date", { ascending: false })
      .order("created_at",    { ascending: false });
    setActivities((data as Activity[]) || []);
    setLoading(false);
  }

  async function fetchLeads() {
    const { data } = await supabase
      .from("leads")
      .select("id, lead_name, phone")
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(300);
    setLeads((data as LeadOption[]) || []);
  }

  useEffect(() => {
    fetchActivities();
    fetchLeads();
    const ch = supabase
      .channel("activities-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, fetchActivities)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ── Log activity ───────────────────────────────────────────────────────────
  async function handleLogActivity() {
    if (!form.title.trim() || !form.user_name) return;
    setSaving(true);
    const selectedLead = leads.find(l => l.id === form.lead_id);

    // Auto-generate title if empty
    const typeLabel = TYPE_MAP[form.activity_type]?.label.replace(/^.\s/, "") ?? form.activity_type;
    const title = form.title.trim() ||
      `${typeLabel}${selectedLead ? ` — ${selectedLead.lead_name}` : ""}`;

    const { error } = await supabase.from("activities").insert({
      user_name:     form.user_name,
      activity_type: form.activity_type,
      title,
      description:   form.description.trim() || null,
      lead_id:       form.lead_id || null,
      lead_name:     selectedLead?.lead_name || null,
      activity_date: form.activity_date,
    });

    setSaving(false);
    if (!error) {
      setForm({ user_name: form.user_name, activity_type: "call", title: "", description: "", lead_id: "", activity_date: todayStr() });
      setLeadSearch(""); setShowForm(false); fetchActivities();
    } else {
      alert("Error: " + error.message);
    }
  }

  // ── Log EOD report ─────────────────────────────────────────────────────────
  async function handleEODSubmit() {
    if (!eodForm.user_name) return;
    setSaving(true);
    const { error } = await supabase.from("activities").insert({
      user_name:      eodForm.user_name,
      activity_type:  "eod_report",
      title:          `EOD Report — ${eodForm.user_name} — ${eodForm.activity_date}`,
      description:    eodForm.notes || null,
      activity_date:  eodForm.activity_date,
      goals_set:      eodForm.goals_set,
      goals_achieved: eodForm.goals_achieved,
    });
    setSaving(false);
    if (!error) {
      setEodForm({ user_name: eodForm.user_name, activity_date: todayStr(), goals_set: { calls:0, appts:0, estimates:0, follow_ups:0 }, goals_achieved: { calls:0, appts:0, estimates:0, follow_ups:0 }, notes: "" });
      fetchActivities();
    } else {
      alert("Error: " + error.message);
    }
  }

  // ── Filtering + grouping ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return activities.filter(a => {
      if (filterUser && a.user_name      !== filterUser) return false;
      if (filterType && a.activity_type  !== filterType) return false;
      if (filterDate && a.activity_date  !== filterDate) return false;
      if (q && !a.title.toLowerCase().includes(q) &&
               !(a.lead_name   || "").toLowerCase().includes(q) &&
               !(a.description || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [activities, filterUser, filterType, filterDate, search]);

  // Group by date
  const grouped = useMemo(() => {
    const map: Record<string, Activity[]> = {};
    filtered.forEach(a => {
      if (!map[a.activity_date]) map[a.activity_date] = [];
      map[a.activity_date].push(a);
    });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  // ── Summary stats (today) ──────────────────────────────────────────────────
  const todayActivities = activities.filter(a => a.activity_date === todayStr());
  const todayByUser = USERS.map(u => ({
    user: u,
    count: todayActivities.filter(a => a.user_name === u).length,
    types: ACTIVITY_TYPES.map(t => ({
      ...t,
      count: todayActivities.filter(a => a.user_name === u && a.activity_type === t.value).length,
    })).filter(t => t.count > 0),
  }));

  const filteredLeads = leads.filter(l =>
    matchesSearch(l.lead_name || "", leadSearch) ||
    (l.phone || "").includes(leadSearch)
  ).slice(0, 20);

  // ── EOD section component ──────────────────────────────────────────────────
  const EODSection = ({ activity }: { activity: Activity }) => {
    const [open, setOpen] = useState(false);
    const gs = activity.goals_set     as Record<string, number> | null;
    const ga = activity.goals_achieved as Record<string, number> | null;
    if (!gs && !ga) return null;

    return (
      <div className="mt-2 border-t border-border/40 pt-2">
        <button onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {open ? "Hide" : "View"} goals
        </button>
        {open && (
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {GOAL_FIELDS.map(f => {
              const set      = gs?.[f.key] ?? 0;
              const achieved = ga?.[f.key] ?? 0;
              const pct      = set > 0 ? Math.min(100, Math.round((achieved / set) * 100)) : 0;
              return (
                <div key={f.key} className="rounded-lg bg-muted/30 p-2 text-center">
                  <p className="text-xs text-muted-foreground mb-1">{f.label}</p>
                  <p className="text-sm font-bold">{achieved}<span className="text-muted-foreground font-normal"> / {set}</span></p>
                  <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-red-400"}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                  <p className={`text-xs mt-0.5 font-medium ${pct >= 100 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-red-500"}`}>
                    {pct}%
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Activities</h1>
          <p className="text-xs text-muted-foreground">Daily log · EOD reports · Goal tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchActivities}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground transition-colors">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          {/* Tabs */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button onClick={() => { setActiveTab("log"); setShowForm(true); }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors">
              <Plus className="h-3.5 w-3.5" /> Log Activity
            </button>
            <button onClick={() => { setActiveTab("eod"); setShowForm(true); }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 border-l border-border hover:bg-muted text-muted-foreground transition-colors font-medium">
              <Target className="h-3.5 w-3.5" /> EOD Report
            </button>
          </div>
        </div>
      </div>

      {/* ── Today's summary ── */}
      {todayActivities.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {todayByUser.filter(u => u.count > 0).map(u => (
            <div key={u.user} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-6 w-6 rounded-full bg-primary/10 text-xs font-bold text-primary flex items-center justify-center">
                  {u.user[0]}
                </div>
                <span className="text-sm font-semibold">{u.user}</span>
                <span className="ml-auto text-xs text-muted-foreground">{u.count} activities</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {u.types.map(t => (
                  <span key={t.value} className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.color}`}>
                    {t.count}× {t.label.replace(/^.\s/, "")}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Log Activity Form ── */}
      {showForm && activeTab === "log" && (
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-primary">Log Activity</p>
            <button onClick={() => setShowForm(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Who */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Who *</label>
              <select value={form.user_name} onChange={e => setForm({ ...form, user_name: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                <option value="">— Select —</option>
                {USERS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>

            {/* Type */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Type</label>
              <select value={form.activity_type} onChange={e => setForm({ ...form, activity_type: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                {ACTIVITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Date</label>
              <input type="date" value={form.activity_date}
                onChange={e => setForm({ ...form, activity_date: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>

            {/* Lead */}
            <div className="relative">
              <label className="text-xs text-muted-foreground block mb-1">Link to lead</label>
              <input
                value={leadSearch || (leads.find(l => l.id === form.lead_id)?.lead_name ?? "")}
                onChange={e => { setLeadSearch(e.target.value); setShowLeadDrop(true); setForm({ ...form, lead_id: "" }); }}
                onFocus={() => setShowLeadDrop(true)}
                placeholder="Search lead…"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {showLeadDrop && filteredLeads.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-background shadow-lg z-30">
                  <button onClick={() => { setForm({ ...form, lead_id: "" }); setLeadSearch(""); setShowLeadDrop(false); }}
                    className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-muted">
                    — No lead —
                  </button>
                  {filteredLeads.map(l => (
                    <button key={l.id}
                      onClick={() => { setForm({ ...form, lead_id: l.id }); setLeadSearch(""); setShowLeadDrop(false); }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors">
                      <span className="font-medium">{l.lead_name}</span>
                      {l.phone && <span className="text-muted-foreground ml-2">{l.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Title */}
          <input autoFocus value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            onKeyDown={e => e.key === "Enter" && handleLogActivity()}
            placeholder="Activity title (e.g. Called back John, left voicemail)"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />

          {/* Notes */}
          <textarea value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="Notes (optional)"
            rows={2}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />

          <div className="flex gap-2">
            <button onClick={handleLogActivity} disabled={saving || !form.title.trim() || !form.user_name}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving…" : "Save Activity"}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── EOD Report Form ── */}
      {showForm && activeTab === "eod" && (
        <div className="rounded-xl border-2 border-violet-300/50 bg-violet-50/30 dark:bg-violet-950/10 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-violet-700 dark:text-violet-400">End of Day Report</p>
              <p className="text-xs text-muted-foreground">Log daily goals vs actual performance</p>
            </div>
            <button onClick={() => setShowForm(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Salesperson *</label>
              <select value={eodForm.user_name} onChange={e => setEodForm({ ...eodForm, user_name: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                <option value="">— Select —</option>
                {USERS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Date</label>
              <input type="date" value={eodForm.activity_date}
                onChange={e => setEodForm({ ...eodForm, activity_date: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
          </div>

          {/* Goals table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Metric</th>
                  <th className="text-center px-4 py-2 text-xs font-semibold text-muted-foreground">Goal (Set)</th>
                  <th className="text-center px-4 py-2 text-xs font-semibold text-muted-foreground">Actual (Achieved)</th>
                  <th className="text-center px-4 py-2 text-xs font-semibold text-muted-foreground">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {GOAL_FIELDS.map(f => {
                  const set      = eodForm.goals_set[f.key as keyof typeof eodForm.goals_set] || 0;
                  const achieved = eodForm.goals_achieved[f.key as keyof typeof eodForm.goals_achieved] || 0;
                  const pct      = set > 0 ? Math.min(100, Math.round((achieved / set) * 100)) : 0;
                  return (
                    <tr key={f.key} className="hover:bg-muted/10">
                      <td className="px-4 py-2 font-medium text-sm">{f.label}</td>
                      <td className="px-4 py-2 text-center">
                        <input type="number" min={0} value={set || ""}
                          onChange={e => setEodForm({ ...eodForm, goals_set: { ...eodForm.goals_set, [f.key]: Number(e.target.value) } })}
                          className="w-16 text-center rounded-md border border-border bg-background px-1 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input type="number" min={0} value={achieved || ""}
                          onChange={e => setEodForm({ ...eodForm, goals_achieved: { ...eodForm.goals_achieved, [f.key]: Number(e.target.value) } })}
                          className="w-16 text-center rounded-md border border-border bg-background px-1 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className={`text-xs font-semibold ${pct >= 100 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : set > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                          {set > 0 ? pct + "%" : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Notes */}
          <textarea value={eodForm.notes}
            onChange={e => setEodForm({ ...eodForm, notes: e.target.value })}
            placeholder="EOD notes — wins, challenges, follow-ups for tomorrow…"
            rows={3}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />

          <div className="flex gap-2">
            <button onClick={handleEODSubmit} disabled={saving || !eodForm.user_name}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-40 transition-colors">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving…" : "Submit EOD Report"}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search activities…"
            className="pl-8 pr-3 py-1.5 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 w-44" />
        </div>
        <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none text-muted-foreground">
          <option value="">All users</option>
          {USERS.map(u => <option key={u}>{u}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none text-muted-foreground">
          <option value="">All types</option>
          {ACTIVITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none text-muted-foreground" />
        {(filterUser || filterType || filterDate || search) && (
          <button onClick={() => { setFilterUser(""); setFilterType(""); setFilterDate(""); setSearch(""); }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} activities</span>
      </div>

      {/* ── Activity feed ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border py-16 text-center">
          <TrendingUp className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No activities yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Log a call, appointment, or EOD report to get started.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([date, dayActivities]) => (
            <div key={date}>
              {/* Date header */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {formatDate(date)}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                    {dayActivities.length}
                  </span>
                </div>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Activity cards */}
              <div className="space-y-2">
                {dayActivities.map(activity => {
                  const typeInfo = TYPE_MAP[activity.activity_type];
                  return (
                    <div key={activity.id}
                      className="rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/20 hover:shadow-sm transition-all">
                      <div className="flex items-start gap-3">
                        {/* Type badge */}
                        <span className={`shrink-0 text-xs px-2 py-1 rounded-md font-medium ${typeInfo?.color ?? "bg-muted text-muted-foreground"}`}>
                          {typeInfo?.label ?? activity.activity_type}
                        </span>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm leading-snug">{activity.title}</p>
                          {activity.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{activity.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                              <Users className="h-3 w-3" /> {activity.user_name}
                            </span>
                            {activity.lead_name && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Link2 className="h-3 w-3" /> {activity.lead_name}
                              </span>
                            )}
                          </div>
                          {/* EOD goals preview */}
                          {activity.activity_type === "eod_report" && (
                            <EODSection activity={activity} />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
