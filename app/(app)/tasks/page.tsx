"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Plus, X, Save, Loader2, CheckSquare, Square,
  AlertCircle, Clock, ChevronDown, Search,
  Zap, Link2, CalendarDays, Trash2, RefreshCw,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Task {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  created_by: string | null;
  priority: "high" | "medium" | "low";
  status: "open" | "in_progress" | "done";
  lead_id: string | null;
  lead_name: string | null;
  due_date: string | null;
  completed_at: string | null;
  auto_generated: boolean;
  trigger_stage: string | null;
  created_at: string;
}

interface LeadOption { id: string; lead_name: string; phone: string | null }

// ── Constants ─────────────────────────────────────────────────────────────────
const ASSIGNEES = ["Ron", "Ray", "Nelly", "Other"];

const PRIORITY_STYLES: Record<string, string> = {
  high:   "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low:    "bg-slate-100 text-slate-500 border-slate-200",
};

const PRIORITY_DOT: Record<string, string> = {
  high:   "bg-red-500",
  medium: "bg-amber-400",
  low:    "bg-slate-400",
};

const STATUS_STYLES: Record<string, string> = {
  open:        "bg-blue-100 text-blue-700",
  in_progress: "bg-violet-100 text-violet-700",
  done:        "bg-emerald-100 text-emerald-700",
};

const STATUS_LABELS: Record<string, string> = {
  open:        "Open",
  in_progress: "In Progress",
  done:        "Done",
};

function todayStr() { return new Date().toISOString().split("T")[0]; }

function isOverdue(task: Task) {
  if (!task.due_date || task.status === "done") return false;
  return task.due_date < todayStr();
}

function isDueToday(task: Task) {
  if (!task.due_date || task.status === "done") return false;
  return task.due_date === todayStr();
}

function daysUntilDue(task: Task) {
  if (!task.due_date) return null;
  const diff = Math.ceil(
    (new Date(task.due_date).getTime() - new Date(todayStr()).getTime()) / 86400000
  );
  return diff;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TasksPage() {
  const [tasks,       setTasks]       = useState<Task[]>([]);
  const [leads,       setLeads]       = useState<LeadOption[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [deleting,    setDeleting]    = useState<string | null>(null);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [filterStatus,   setFilterStatus]   = useState<string>("open");
  const [filterAssignee, setFilterAssignee] = useState<string>("");
  const [filterPriority, setFilterPriority] = useState<string>("");
  const [search,         setSearch]         = useState("");

  // ── New task form ──────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    title:       "",
    description: "",
    assigned_to: "",
    priority:    "medium" as Task["priority"],
    due_date:    "",
    lead_id:     "",
  });
  const [leadSearch, setLeadSearch] = useState("");
  const [showLeadDrop, setShowLeadDrop] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  async function fetchTasks() {
    setLoading(true);
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });
    setTasks((data as Task[]) || []);
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
    fetchTasks();
    fetchLeads();

    // Real-time: any task change → refresh
    const ch = supabase
      .channel("tasks-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, fetchTasks)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ── Create task ────────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!form.title.trim()) return;
    setSaving(true);

    const selectedLead = leads.find(l => l.id === form.lead_id);

    const { error } = await supabase.from("tasks").insert({
      title:       form.title.trim(),
      description: form.description.trim() || null,
      assigned_to: form.assigned_to || null,
      priority:    form.priority,
      due_date:    form.due_date || null,
      lead_id:     form.lead_id || null,
      lead_name:   selectedLead?.lead_name || null,
      status:      "open",
      created_by:  "Nelly", // TODO: replace with auth user once Settings/users is done
    });

    setSaving(false);
    if (!error) {
      setForm({ title: "", description: "", assigned_to: "", priority: "medium", due_date: "", lead_id: "" });
      setLeadSearch("");
      setShowForm(false);
      fetchTasks();
    } else {
      alert("Error creating task: " + error.message);
    }
  }

  // ── Update status ──────────────────────────────────────────────────────────
  async function handleStatusChange(id: string, newStatus: Task["status"]) {
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === id ? {
      ...t,
      status:       newStatus,
      completed_at: newStatus === "done" ? new Date().toISOString() : null,
    } : t));

    await supabase.from("tasks").update({
      status:       newStatus,
      completed_at: newStatus === "done" ? new Date().toISOString() : null,
    }).eq("id", id);
  }

  // ── Toggle done (checkbox) ─────────────────────────────────────────────────
  async function toggleDone(task: Task) {
    const newStatus = task.status === "done" ? "open" : "done";
    await handleStatusChange(task.id, newStatus);
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!confirm("Delete this task?")) return;
    setDeleting(id);
    await supabase.from("tasks").delete().eq("id", id);
    setDeleting(null);
    fetchTasks();
  }

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tasks.filter(t => {
      if (filterStatus   && t.status      !== filterStatus)   return false;
      if (filterAssignee && t.assigned_to !== filterAssignee) return false;
      if (filterPriority && t.priority    !== filterPriority) return false;
      if (q && !t.title.toLowerCase().includes(q) &&
               !(t.assigned_to || "").toLowerCase().includes(q) &&
               !(t.lead_name   || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, filterStatus, filterAssignee, filterPriority, search]);

  // ── Grouped by status ──────────────────────────────────────────────────────
  const overdue     = filtered.filter(t => isOverdue(t));
  const dueToday    = filtered.filter(t => isDueToday(t));
  const open        = filtered.filter(t => t.status === "open"        && !isOverdue(t) && !isDueToday(t));
  const inProgress  = filtered.filter(t => t.status === "in_progress" && !isOverdue(t) && !isDueToday(t));
  const done        = filtered.filter(t => t.status === "done");

  const counts = {
    open:  tasks.filter(t => t.status === "open").length,
    inProgress: tasks.filter(t => t.status === "in_progress").length,
    done:  tasks.filter(t => t.status === "done").length,
    overdue: tasks.filter(t => isOverdue(t)).length,
  };

  const filteredLeads = leads.filter(l =>
    (l.lead_name || "").toLowerCase().includes(leadSearch.toLowerCase()) ||
    (l.phone     || "").includes(leadSearch)
  ).slice(0, 20);

  // ── Task row ───────────────────────────────────────────────────────────────
  const TaskRow = ({ task }: { task: Task }) => {
    const [statusOpen, setStatusOpen] = useState(false);
    const days = daysUntilDue(task);
    const overdue = isOverdue(task);
    const today   = isDueToday(task);

    return (
      <div className={`group flex items-start gap-3 rounded-xl border px-4 py-3.5 transition-all ${
        task.status === "done"
          ? "border-border/50 bg-muted/20 opacity-60"
          : overdue
          ? "border-red-200 bg-red-50/30 dark:border-red-900/50 dark:bg-red-950/10"
          : today
          ? "border-amber-200 bg-amber-50/30 dark:border-amber-900/50 dark:bg-amber-950/10"
          : "border-border bg-card hover:border-primary/30 hover:shadow-sm"
      }`}>

        {/* Checkbox */}
        <button
          onClick={() => toggleDone(task)}
          className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
        >
          {task.status === "done"
            ? <CheckSquare className="h-4 w-4 text-emerald-500" />
            : <Square className="h-4 w-4" />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <p className={`font-medium text-sm leading-snug ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>
              {task.title}
            </p>

            {/* Auto-generated badge */}
            {task.auto_generated && (
              <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">
                <Zap className="h-2.5 w-2.5" /> Auto
              </span>
            )}
          </div>

          {task.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {/* Priority */}
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${PRIORITY_STYLES[task.priority]}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[task.priority]}`} />
              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
            </span>

            {/* Assignee */}
            {task.assigned_to && (
              <span className="text-xs text-muted-foreground font-medium">
                → {task.assigned_to}
              </span>
            )}

            {/* Lead link */}
            {task.lead_name && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Link2 className="h-3 w-3" /> {task.lead_name}
              </span>
            )}

            {/* Due date */}
            {task.due_date && (
              <span className={`flex items-center gap-1 text-xs font-medium ${
                overdue ? "text-red-600" : today ? "text-amber-600" : "text-muted-foreground"
              }`}>
                <CalendarDays className="h-3 w-3" />
                {overdue
                  ? `${Math.abs(days!)}d overdue`
                  : today
                  ? "Due today"
                  : `Due ${task.due_date}`}
              </span>
            )}
          </div>
        </div>

        {/* Status dropdown */}
        <div className="relative shrink-0">
          <button
            onClick={() => setStatusOpen(v => !v)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md font-medium transition-colors ${STATUS_STYLES[task.status]}`}
          >
            {STATUS_LABELS[task.status]}
            <ChevronDown className="h-3 w-3" />
          </button>
          {statusOpen && (
            <div className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-border bg-background shadow-lg z-20 overflow-hidden">
              {(["open","in_progress","done"] as Task["status"][]).map(s => (
                <button key={s} onClick={() => { handleStatusChange(task.id, s); setStatusOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors flex items-center justify-between ${task.status === s ? "font-semibold" : ""}`}>
                  {STATUS_LABELS[s]}
                  {task.status === s && <span className="text-primary">●</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Delete */}
        <button
          onClick={() => handleDelete(task.id)}
          disabled={deleting === task.id}
          className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-all mt-0.5"
        >
          {deleting === task.id
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    );
  };

  // ── Section component ──────────────────────────────────────────────────────
  const TaskSection = ({
    label, tasks, emptyMsg, headerClass = "",
  }: {
    label: string; tasks: Task[]; emptyMsg?: string; headerClass?: string;
  }) => {
    const [open, setOpen] = useState(true);
    if (tasks.length === 0 && !emptyMsg) return null;
    return (
      <div>
        <button
          onClick={() => setOpen(v => !v)}
          className={`flex items-center gap-2 mb-2 w-full text-left ${headerClass}`}
        >
          <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{tasks.length}</span>
          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground ml-auto transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
        {open && (
          <div className="space-y-2">
            {tasks.length === 0
              ? <p className="text-xs text-muted-foreground px-1">{emptyMsg}</p>
              : tasks.map(t => <TaskRow key={t.id} task={t} />)}
          </div>
        )}
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Tasks</h1>
          <p className="text-xs text-muted-foreground">
            {counts.open} open · {counts.inProgress} in progress · {counts.overdue > 0 && (
              <span className="text-red-500 font-semibold">{counts.overdue} overdue · </span>
            )}{counts.done} done
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchTasks}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground transition-colors">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium transition-colors"
          >
            <Plus className="h-4 w-4" /> New Task
          </button>
        </div>
      </div>

      {/* ── New task form ── */}
      {showForm && (
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-primary">New Task</p>
            <button onClick={() => setShowForm(false)}>
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          </div>

          {/* Title */}
          <input
            autoFocus
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            onKeyDown={e => e.key === "Enter" && handleCreate()}
            placeholder="Task title *"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />

          {/* Description */}
          <textarea
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="Description (optional)"
            rows={2}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Assigned to */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Assign to</label>
              <select
                value={form.assigned_to}
                onChange={e => setForm({ ...form, assigned_to: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">— Anyone —</option>
                {ASSIGNEES.map(a => <option key={a}>{a}</option>)}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={e => setForm({ ...form, priority: e.target.value as Task["priority"] })}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="high">🔴 High</option>
                <option value="medium">🟡 Medium</option>
                <option value="low">⚪ Low</option>
              </select>
            </div>

            {/* Due date */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Due date</label>
              <input
                type="date"
                value={form.due_date}
                min={todayStr()}
                onChange={e => setForm({ ...form, due_date: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Link to lead */}
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
                  <button
                    onClick={() => { setForm({ ...form, lead_id: "" }); setLeadSearch(""); setShowLeadDrop(false); }}
                    className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
                  >
                    — No lead —
                  </button>
                  {filteredLeads.map(l => (
                    <button
                      key={l.id}
                      onClick={() => { setForm({ ...form, lead_id: l.id }); setLeadSearch(""); setShowLeadDrop(false); }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors"
                    >
                      <span className="font-medium">{l.lead_name}</span>
                      {l.phone && <span className="text-muted-foreground ml-2">{l.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleCreate}
              disabled={saving || !form.title.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving…" : "Save Task"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className="pl-8 pr-3 py-1.5 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 w-44"
          />
        </div>

        {/* Status */}
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none text-muted-foreground">
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>

        {/* Assignee */}
        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none text-muted-foreground">
          <option value="">All assignees</option>
          {ASSIGNEES.map(a => <option key={a}>{a}</option>)}
        </select>

        {/* Priority */}
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none text-muted-foreground">
          <option value="">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {(filterStatus || filterAssignee || filterPriority || search) && (
          <button
            onClick={() => { setFilterStatus("open"); setFilterAssignee(""); setFilterPriority(""); setSearch(""); }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} tasks</span>
      </div>

      {/* ── Task list ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading tasks…
        </div>
      ) : (
        <div className="space-y-6">
          {/* Overdue */}
          {overdue.length > 0 && (
            <TaskSection
              label="⚠ Overdue"
              tasks={overdue}
              headerClass="text-red-600"
            />
          )}

          {/* Due today */}
          {dueToday.length > 0 && (
            <TaskSection
              label="📅 Due Today"
              tasks={dueToday}
              headerClass="text-amber-600"
            />
          )}

          {/* Open */}
          {(filterStatus === "" || filterStatus === "open") && (
            <TaskSection
              label="Open"
              tasks={open}
              emptyMsg={filtered.length === 0 ? "No tasks yet — click New Task to add one." : undefined}
            />
          )}

          {/* In Progress */}
          {(filterStatus === "" || filterStatus === "in_progress") && (
            <TaskSection label="In Progress" tasks={inProgress} />
          )}

          {/* Done */}
          {(filterStatus === "" || filterStatus === "done") && (
            <TaskSection label="Done" tasks={done} />
          )}

          {filtered.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-border py-16 text-center">
              <CheckSquare className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No tasks found</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                {tasks.length === 0 ? "Click New Task to create your first task." : "Try adjusting your filters."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
