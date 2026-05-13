"use client";

import { usePathname, useRouter } from "next/navigation";
import { Bell, Search, X, Loader2, Plus, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddLeadModal from "@/components/leads/AddLeadModal";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

const pageTitles: Record<string, { title: string; description: string }> = {
  "/dashboard":      { title: "Dashboard",      description: "Welcome back, Jamie 👋" },
  "/leads":          { title: "Leads Pipeline", description: "Manage and track your sales pipeline" },
  "/leads/list":     { title: "Contacts",       description: "All leads and contacts" },
  "/leads/archived": { title: "Archived Leads", description: "View and restore archived leads" },
  "/production":     { title: "Production",     description: "Track jobs in progress" },
  "/kpi":            { title: "KPI Dashboard",  description: "Performance metrics and insights" },
  "/calendar":       { title: "Calendar",       description: "View your upcoming appointments" },
  "/tasks":          { title: "Tasks",          description: "Stay on top of your to-dos" },
  "/activities":     { title: "Activities",     description: "Review all lead interactions" },
  "/settings":       { title: "Settings",       description: "Configure your workspace" },
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
  contacted: "bg-blue-100 text-blue-700", appointment_set: "bg-purple-100 text-purple-700",
  estimate_sent: "bg-yellow-100 text-yellow-700",
  closed_won: "bg-emerald-100 text-emerald-700", won: "bg-emerald-100 text-emerald-700",
  cancelled_appointment: "bg-orange-100 text-orange-700",
  lost: "bg-red-100 text-red-600", not_qualified: "bg-gray-100 text-gray-500",
};

interface SearchResult {
  id: string;
  lead_name: string;
  first_name: string;
  phone: string;
  status: string;
  source: string;
  metadata: any;
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const pageInfo = pageTitles[pathname] ?? { title: "FlowCRM", description: "" };

  // ── Search state ──────────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery]           = useState("");
  const [results, setResults]       = useState<SearchResult[]>([]);
  const [searching, setSearching]   = useState(false);
  const searchRef                   = useRef<HTMLDivElement>(null);
  const inputRef                    = useRef<HTMLInputElement>(null);

  // ── Quick add state ───────────────────────────────────────────────────────
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const quickAddRef                     = useRef<HTMLDivElement>(null);

  // ✅ FIX: AddLead modal state lives HERE, outside the dropdown conditional
  // This prevents the modal from unmounting when the dropdown closes
  const [addLeadOpen, setAddLeadOpen] = useState(false);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false); setQuery(""); setResults([]);
      }
      if (quickAddRef.current && !quickAddRef.current.contains(e.target as Node)) {
        setQuickAddOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Focus input when search opens
  useEffect(() => {
    if (searchOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [searchOpen]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSearchOpen(false); setQuery(""); setResults([]);
        setQuickAddOpen(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  // ── Search function ───────────────────────────────────────────────────────
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
      id:        l.id,
      lead_name: l.lead_name || l.first_name || "Unnamed",
      first_name: l.first_name || "",
      phone:     l.phone || "",
      status:    l.status || "new",
      source:    l.lead_sources?.name || "",
      metadata:  l.metadata,
    })));
    setSearching(false);
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  const handleResultClick = (leadId: string) => {
    setSearchOpen(false); setQuery(""); setResults([]);
    router.push(`/leads?open=${leadId}`);
  };

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
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by name, phone, city..."
                className="h-8 w-72 rounded-lg border border-primary/40 bg-background pl-9 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
              />
              {query && (
                <button onClick={() => { setQuery(""); setResults([]); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
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
                        <button
                          key={lead.id}
                          onClick={() => handleResultClick(lead.id)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left border-b border-border/50 last:border-0"
                        >
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

        {/* ── Notifications ── */}
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
        </Button>

        {/* ── Plus Quick Add ── */}
        <div ref={quickAddRef} className="relative">
          <button
            onClick={() => setQuickAddOpen(v => !v)}
            className="flex items-center gap-1 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </button>
          {quickAddOpen && (
            <div className="absolute right-0 top-10 w-44 rounded-lg border border-border bg-background shadow-lg z-50 overflow-hidden">
              <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">Quick Add</p>
              {/* ✅ FIX: Button closes dropdown AND opens modal — modal is mounted OUTSIDE this block */}
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

        {/* ✅ FIX: AddLeadModal lives OUTSIDE {quickAddOpen && ...} so it never unmounts prematurely */}
        <AddLeadModal open={addLeadOpen} onOpenChange={setAddLeadOpen} />

      </div>
    </header>
  );
}