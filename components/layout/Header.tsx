"use client";

import { usePathname, useRouter } from "next/navigation";
import { Bell, Search, X, Loader2, Plus, CheckSquare, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddLeadModal from "@/components/leads/AddLeadModal";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { COMPANY } from "@/lib/config";

// ── Page titles ───────────────────────────────────────────────────────────────
const pageTitles: Record<string, { title: string; description: string }> = {
  "/dashboard":      { title: "Dashboard",      description: `Welcome to ${COMPANY.name} ${COMPANY.appName}` },
  "/leads":          { title: "Leads Pipeline", description: "Manage and track your sales pipeline" },
  "/leads/list":     { title: "Contacts",       description: "All leads and contacts" },
  "/contacts":       { title: "Contacts",       description: "All leads and contacts" },
  "/leads/archived": { title: "Archived Leads", description: "View and restore archived leads" },
  "/production":     { title: "Production",     description: "Track jobs in progress" },
  "/kpi":            { title: "KPI Dashboard",  description: "Performance metrics and insights" },
  "/calendar":       { title: "Calendar",       description: "View your upcoming appointments" },
  "/tasks":          { title: "Tasks",          description: "Stay on top of your to-dos" },
  "/activities":     { title: "Activities",     description: "Daily log and EOD reports" },
  "/settings":       { title: "Settings",       description: "Configure your workspace" },
  "/estimates":      { title: "Estimates",      description: "Manage estimates and proposals" },
};

const statusLabels: Record<string, string> = {
  new: "New", open: "New", new_lead: "New", contacted: "Qualified",
  appointment_set: "Appt Set", estimate_sent: "Estimate Sent",
  closed_won: "Won", won: "Won",
  cancelled_appointment: "Cancelled", lost: "Lost", not_qualified: "Not Qualified",
};

const statusColors: Record<string, string> = {
  new: "bg-gray-100 text-gray-600", open: "bg-gray-100 text-gray-600",
  new_lead: "bg-gray-100 text-gray-600",
  contacted: "bg-blue-100 text-blue-700",
  appointment_set: "bg-purple-100 text-purple-700",
  estimate_sent: "bg-yellow-100 text-yellow-700",
  closed_won: "bg-emerald-100 text-emerald-700", won: "bg-emerald-100 text-emerald-700",
  cancelled_appointment: "bg-orange-100 text-orange-700",
  lost: "bg-red-100 text-red-600", not_qualified: "bg-gray-100 text-gray-500",
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface SearchResult {
  id: string; lead_name: string; first_name: string;
  phone: string; status: string; source: string; metadata: any;
}

interface NotifTask {
  id: string; title: string; priority: string;
  due_date: string | null; assigned_to: string | null;
  lead_name: string | null; status: string;
}

function todayStr() { return new Date().toISOString().split("T")[0]; }

function isOverdue(t: NotifTask) {
  return !!t.due_date && t.due_date < todayStr() && t.status !== "done";
}
function isDueToday(t: NotifTask) {
  return t.due_date === todayStr() && t.status !== "done";
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Header() {
  const pathname = usePathname();
  const router   = useRouter();

  // Match exact path or prefix (e.g. /leads/import → /leads)
  const pageInfo = pageTitles[pathname]
    ?? Object.entries(pageTitles)
        .filter(([k]) => k !== "/")
        .find(([k]) => pathname.startsWith(k))?.[1]
    ?? { title: COMPANY.appName, description: "" };

  // ── Search ────────────────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [query,      setQuery]      = useState("");
  const [results,    setResults]    = useState<SearchResult[]>([]);
  const [searching,  setSearching]  = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  // ── Quick add ─────────────────────────────────────────────────────────────
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [addLeadOpen,  setAddLeadOpen]  = useState(false);
  const quickAddRef = useRef<HTMLDivElement>(null);

  // ── Notifications ─────────────────────────────────────────────────────────
  const [notifOpen,  setNotifOpen]  = useState(false);
  const [notifTasks, setNotifTasks] = useState<NotifTask[]>([]);
  const [notifCount, setNotifCount] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);

  // ── Outside click handler ─────────────────────────────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current   && !searchRef.current.contains(e.target as Node))   { setSearchOpen(false); setQuery(""); setResults([]); }
      if (quickAddRef.current && !quickAddRef.current.contains(e.target as Node)) { setQuickAddOpen(false); }
      if (notifRef.current    && !notifRef.current.contains(e.target as Node))    { setNotifOpen(false); }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (searchOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [searchOpen]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSearchOpen(false); setQuery(""); setResults([]);
        setQuickAddOpen(false); setNotifOpen(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  // ── Fetch notification tasks ──────────────────────────────────────────────
  const fetchNotifs = useCallback(async () => {
    const { data } = await supabase
      .from("tasks")
      .select("id,title,priority,due_date,assigned_to,lead_name,status")
      .neq("status", "done")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(20);

    const tasks = (data as NotifTask[]) || [];

    // Show: overdue first, then due today, then open tasks due soon
    const prioritized = [
      ...tasks.filter(t => isOverdue(t)),
      ...tasks.filter(t => isDueToday(t)),
      ...tasks.filter(t => !isOverdue(t) && !isDueToday(t)),
    ].slice(0, 10);

    setNotifTasks(prioritized);
    setNotifCount(tasks.filter(t => isOverdue(t) || isDueToday(t)).length);
  }, []);

  useEffect(() => {
    fetchNotifs();
    // Re-fetch every 5 minutes
    const interval = setInterval(fetchNotifs, 5 * 60 * 1000);
    // Real-time updates
    const ch = supabase
      .channel("notif-tasks")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, fetchNotifs)
      .subscribe();
    return () => { clearInterval(interval); supabase.removeChannel(ch); };
  }, [fetchNotifs]);

  // ── Search ────────────────────────────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from("leads")
      .select("id, lead_name, first_name, phone, status, metadata, lead_sources(name)")
      .eq("archived", false)
      .or(`lead_name.ilike.%${q}%,phone.ilike.%${q}%,client_city.ilike.%${q}%`)
      .limit(8);
    setResults((data || []).map((l: any) => ({
      id:         l.id,
      lead_name:  l.lead_name || l.first_name || "Unnamed",
      first_name: l.first_name || "",
      phone:      l.phone || "",
      status:     l.status || "new",
      source:     l.lead_sources?.name || "",
      metadata:   l.metadata,
    })));
    setSearching(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  const handleResultClick = (leadId: string) => {
    setSearchOpen(false); setQuery(""); setResults([]);
    router.push(`/leads?open=${leadId}`);
  };

  // ── Priority color ────────────────────────────────────────────────────────
  const priorityDot: Record<string, string> = {
    high:   "bg-red-500",
    medium: "bg-amber-400",
    low:    "bg-slate-400",
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6 shrink-0">
      <div>
        <h1 className="font-display text-lg font-semibold leading-tight">{pageInfo.title}</h1>
        <p className="text-xs text-muted-foreground">{pageInfo.description}</p>
      </div>

      <div className="flex items-center gap-2">

        {/* ── Global Search ── */}
        <div ref={searchRef} className="relative hidden md:flex items-center">
          {!searchOpen ? (
            <button
              onClick={() => setSearchOpen(true)}
              className="relative flex items-center h-8 w-56 rounded-lg border bg-secondary/50 px-3 text-sm text-muted-foreground hover:bg-secondary transition-colors"
            >
              <Search className="h-3.5 w-3.5 mr-2 shrink-0" />
              Search leads...
              <span className="ml-auto text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground/60">⌘K</span>
            </button>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input ref={inputRef} value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by name, phone, city..."
                className="h-8 w-72 rounded-lg border border-primary/40 bg-background pl-9 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
              />
              {query && (
                <button onClick={() => { setQuery(""); setResults([]); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {query.length > 0 && (
                <div className="absolute top-10 left-0 w-80 rounded-lg border border-border bg-background shadow-lg z-50 overflow-hidden">
                  {searching ? (
                    <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching...
                    </div>
                  ) : results.length === 0 ? (
                    <div className="py-4 text-center text-xs text-muted-foreground">
                      No leads found for &quot;{query}&quot;
                    </div>
                  ) : (
                    <div>
                      <p className="px-3 py-2 text-xs text-muted-foreground border-b border-border font-medium">
                        {results.length} result{results.length !== 1 ? "s" : ""}
                      </p>
                      {results.map(lead => (
                        <button key={lead.id} onClick={() => handleResultClick(lead.id)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left border-b border-border/50 last:border-0">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {lead.lead_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{lead.lead_name}</p>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${statusColors[lead.status] || "bg-gray-100 text-gray-600"}`}>
                                {statusLabels[lead.status] || lead.status}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {lead.phone}{lead.source ? ` · ${lead.source}` : ""}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Notification Bell ── */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => { setNotifOpen(v => !v); if (!notifOpen) fetchNotifs(); }}
            className="relative flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors"
          >
            <Bell className="h-4 w-4" />
            {notifCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
                {notifCount > 9 ? "9+" : notifCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-10 w-80 rounded-xl border border-border bg-background shadow-xl z-50 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
                <p className="text-sm font-semibold">Notifications</p>
                {notifCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                    {notifCount} need attention
                  </span>
                )}
              </div>

              {/* Task list */}
              <div className="max-h-80 overflow-y-auto divide-y divide-border/50">
                {notifTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
                    <CheckSquare className="h-6 w-6 text-emerald-400" />
                    <p className="text-sm font-medium text-muted-foreground">All caught up!</p>
                    <p className="text-xs text-muted-foreground/60">No overdue or urgent tasks.</p>
                  </div>
                ) : (
                  notifTasks.map(task => {
                    const overdue = isOverdue(task);
                    const today   = isDueToday(task);
                    return (
                      <button
                        key={task.id}
                        onClick={() => { setNotifOpen(false); router.push("/tasks"); }}
                        className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors ${
                          overdue ? "bg-red-50/50 dark:bg-red-950/10" :
                          today   ? "bg-amber-50/50 dark:bg-amber-950/10" : ""
                        }`}
                      >
                        {/* Priority dot */}
                        <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${priorityDot[task.priority] ?? "bg-slate-400"}`} />

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-snug truncate">{task.title}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {overdue && (
                              <span className="flex items-center gap-0.5 text-xs text-red-600 font-medium">
                                <AlertCircle className="h-3 w-3" />
                                Overdue
                              </span>
                            )}
                            {today && !overdue && (
                              <span className="flex items-center gap-0.5 text-xs text-amber-600 font-medium">
                                <Clock className="h-3 w-3" />
                                Due today
                              </span>
                            )}
                            {task.assigned_to && (
                              <span className="text-xs text-muted-foreground">→ {task.assigned_to}</span>
                            )}
                            {task.lead_name && (
                              <span className="text-xs text-muted-foreground truncate">· {task.lead_name}</span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-border px-4 py-2.5 bg-muted/10">
                <button
                  onClick={() => { setNotifOpen(false); router.push("/tasks"); }}
                  className="w-full text-xs text-center text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  View all tasks →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Plus Quick Add ── */}
        <div ref={quickAddRef} className="relative">
          <button
            onClick={() => setQuickAddOpen(v => !v)}
            className="flex items-center gap-1 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> New
          </button>
          {quickAddOpen && (
            <div className="absolute right-0 top-10 w-44 rounded-lg border border-border bg-background shadow-lg z-50 overflow-hidden">
              <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">Quick Add</p>
              <button
                onClick={() => { setQuickAddOpen(false); setAddLeadOpen(true); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors text-left"
              >
                <Plus className="h-3.5 w-3.5 text-muted-foreground" /> Add Lead
              </button>
              <button
                onClick={() => { setQuickAddOpen(false); router.push("/tasks"); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors text-left"
              >
                <CheckSquare className="h-3.5 w-3.5 text-muted-foreground" /> Add Task
              </button>
            </div>
          )}
        </div>

        <AddLeadModal open={addLeadOpen} onOpenChange={setAddLeadOpen} />
      </div>
    </header>
  );
}
