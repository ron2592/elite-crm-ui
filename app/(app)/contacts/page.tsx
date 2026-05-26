"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Lead } from "@/types";
import LeadDetailDialog from "@/components/leads/LeadDetailDialog";
import {
  Search, RefreshCw, Upload, Download, X,
  ChevronLeft, ChevronRight, Trash2, CalendarDays,
  ArrowRightCircle, Loader2,
} from "lucide-react";

// ── Status maps ───────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  new:                   "New Lead",
  new_lead:              "New Lead",
  open:                  "New Lead",
  contacted:             "Qualified",
  appointment_set:       "Appointment Set",
  estimate_sent:         "Estimate Sent",
  closed_won:            "Closed Won",
  won:                   "Closed Won",
  completed:             "Completed",
  cancelled_appointment: "Cancelled Appt",
  no_opportunity:        "No Opportunity",
  lost:                  "Lost",
  not_qualified:         "Not Qualified",
};

const STATUS_COLORS: Record<string, string> = {
  new:                   "bg-blue-100 text-blue-700",
  new_lead:              "bg-blue-100 text-blue-700",
  contacted:             "bg-violet-100 text-violet-700",
  appointment_set:       "bg-amber-100 text-amber-700",
  estimate_sent:         "bg-orange-100 text-orange-700",
  closed_won:            "bg-emerald-100 text-emerald-700",
  won:                   "bg-emerald-100 text-emerald-700",
  completed:             "bg-green-100 text-green-700",
  cancelled_appointment: "bg-yellow-100 text-yellow-700",
  no_opportunity:        "bg-slate-100 text-slate-500",
  lost:                  "bg-red-100 text-red-600",
  not_qualified:         "bg-gray-100 text-gray-500",
};

const LSA_COLORS: Record<string, string> = {
  charged:     "text-emerald-600 font-semibold",
  submitted:   "text-yellow-600 font-semibold",
  credited:    "text-orange-500 font-semibold",
  not_charged: "text-muted-foreground",
  in_review:   "text-blue-600 font-semibold",
};

// All pipeline stages available for bulk move
const BULK_STAGE_OPTIONS = [
  { value: "new",                   label: "New Lead" },
  { value: "contacted",             label: "Qualified" },
  { value: "appointment_set",       label: "Appointment Set" },
  { value: "estimate_sent",         label: "Estimate Sent" },
  { value: "closed_won",            label: "Closed Won" },
  { value: "completed",             label: "Completed" },
  { value: "cancelled_appointment", label: "Cancelled Appt" },
  { value: "no_opportunity",        label: "No Opportunity" },
  { value: "lost",                  label: "Lost" },
  { value: "not_qualified",         label: "Not Qualified" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizeStatus(raw: string): string {
  const map: Record<string, string> = {
    open:                  "new",
    new:                   "new",
    new_lead:              "new",
    won:                   "closed_won",
    lost:                  "lost",
    contacted:             "contacted",
    appointment_set:       "appointment_set",
    estimate_sent:         "estimate_sent",
    closed_won:            "closed_won",
    completed:             "completed",
    closed_lost:           "cancelled_appointment",
    cancelled_appointment: "cancelled_appointment",
    not_qualified:         "not_qualified",
    no_opportunity:        "no_opportunity",
  };
  return map[raw] ?? raw;
}

function escapeCSV(v: string) {
  return `"${String(v || "").replace(/"/g, '""')}"`;
}

function exportToCSV(rows: any[]) {
  const headers = ["Name","Phone","Email","City","State","Status","Source","LSA Status","Lead Received","Notes"];
  const lines   = rows.map(l => [
    escapeCSV(`${l.first_name || ""} ${l.last_name || ""}`.trim() || l.lead_name || ""),
    escapeCSV(l.phone || ""),
    escapeCSV(l.email || ""),
    escapeCSV(l.client_city || l.city || ""),
    escapeCSV(l.client_state || l.state || ""),
    escapeCSV(STATUS_LABELS[l.status] || l.status || ""),
    escapeCSV((l.lead_sources as any)?.name || ""),
    escapeCSV(l.lsa_status || ""),
    escapeCSV(l.created_at ? new Date(l.created_at).toLocaleDateString("en-US") : ""),
    escapeCSV(l.metadata?.notes || ""),
  ].join(","));
  const csv  = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `contacts_export_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const ITEMS_PER_PAGE = 50;

// ── Component ─────────────────────────────────────────────────────────────────
export default function ContactsPage() {
  const router = useRouter();

  const [leads,        setLeads]        = useState<any[]>([]);
  const [sources,      setSources]      = useState<{ id: string; name: string }[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [dialogOpen,   setDialogOpen]   = useState(false);
  const [page,         setPage]         = useState(1);

  // ── Action states ─────────────────────────────────────────────────────────
  const [deleting,        setDeleting]        = useState(false);
  const [bulkStageTarget, setBulkStageTarget] = useState("");
  const [bulkUpdating,    setBulkUpdating]    = useState(false);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search,       setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");

  // ── Selection ─────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── Data fetching ─────────────────────────────────────────────────────────
  async function fetchLeads() {
    setLoading(true);
    const { data, error } = await supabase
      .from("leads")
      .select("*, lead_sources(id, name)")
      .neq("archived", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Contacts fetchLeads error:", error.message);
      setLoading(false);
      return;
    }

    // Normalize status values from DB to match our UI labels
    const normalized = (data || []).map((l: any) => ({
      ...l,
      status: normalizeStatus(l.status ?? "new"),
    }));

    setLeads(normalized);
    setLoading(false);
  }

  useEffect(() => {
    fetchLeads();
    supabase
      .from("lead_sources")
      .select("id,name")
      .order("name")
      .then(({ data }) => setSources(data || []));
  }, []);

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return leads.filter(l => {
      const name  = `${l.first_name || ""} ${l.last_name || ""} ${l.lead_name || ""}`.toLowerCase();
      const phone = (l.phone || "").toLowerCase();
      const city  = (l.client_city || l.city || "").toLowerCase();
      const email = (l.email || "").toLowerCase();
      if (q && !name.includes(q) && !phone.includes(q) && !city.includes(q) && !email.includes(q)) return false;
      if (filterStatus && l.status !== filterStatus) return false;
      if (filterSource && (l.lead_sources as any)?.id !== filterSource) return false;
      if (dateFrom || dateTo) {
        const d = new Date(l.created_at);
        if (dateFrom && d < new Date(dateFrom + "T00:00:00")) return false;
        if (dateTo   && d > new Date(dateTo   + "T23:59:59")) return false;
      }
      return true;
    });
  }, [leads, search, filterStatus, filterSource, dateFrom, dateTo]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated  = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  useEffect(() => { setPage(1); }, [search, filterStatus, filterSource, dateFrom, dateTo]);

  // ── Selection logic ───────────────────────────────────────────────────────
  const allOnPageSelected = paginated.length > 0 && paginated.every(l => selected.has(l.id));

  const toggleAll = () => {
    if (allOnPageSelected) {
      setSelected(prev => {
        const n = new Set(prev);
        paginated.forEach(l => n.delete(l.id));
        return n;
      });
    } else {
      setSelected(prev => {
        const n = new Set(prev);
        paginated.forEach(l => n.add(l.id));
        return n;
      });
    }
  };

  const toggleOne = (id: string) =>
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  // ── Bulk delete ───────────────────────────────────────────────────────────
  async function handleDeleteSelected() {
    if (!selected.size) return;
    if (!confirm(
      `Permanently delete ${selected.size} lead${selected.size > 1 ? "s" : ""}? This cannot be undone.`
    )) return;

    setDeleting(true);
    const ids = Array.from(selected);

    // Delete related records first, then leads
    await supabase.from("change_order_payments").delete().in("lead_id", ids);
    await supabase.from("change_orders").delete().in("lead_id", ids);
    await supabase.from("payments").delete().in("lead_id", ids);
    await supabase.from("leads").delete().in("id", ids);

    setSelected(new Set());
    setDeleting(false);
    fetchLeads();
  }

  // ── Bulk stage update ─────────────────────────────────────────────────────
  async function handleBulkStageUpdate() {
    if (!bulkStageTarget || !selected.size) return;

    const stageLabel = BULK_STAGE_OPTIONS.find(o => o.value === bulkStageTarget)?.label ?? bulkStageTarget;
    if (!confirm(
      `Move ${selected.size} lead${selected.size > 1 ? "s" : ""} to "${stageLabel}"?`
    )) return;

    setBulkUpdating(true);
    const ids = Array.from(selected);

    const { error } = await supabase
      .from("leads")
      .update({ status: bulkStageTarget })
      .in("id", ids);

    if (error) {
      alert("Bulk update failed: " + error.message);
    } else {
      setSelected(new Set());
      setBulkStageTarget("");
      fetchLeads();
    }

    setBulkUpdating(false);
  }

  // ── Misc ──────────────────────────────────────────────────────────────────
  const clearFilters = () => {
    setSearch(""); setFilterStatus(""); setFilterSource(""); setDateFrom(""); setDateTo("");
  };
  const hasFilters = search || filterStatus || filterSource || dateFrom || dateTo;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Contacts</h1>
          <p className="text-xs text-muted-foreground">All leads and contacts</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={fetchLeads}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            onClick={() => router.push("/leads/import")}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground transition-colors"
          >
            <Upload className="h-3.5 w-3.5" /> Import CSV
          </button>
          <button
            onClick={() =>
              exportToCSV(
                selected.size > 0
                  ? filtered.filter(l => selected.has(l.id))
                  : filtered
              )
            }
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            {selected.size > 0 ? `Export (${selected.size})` : "Export All"}
          </button>
        </div>
      </div>

      {/* ── Filters bar ── */}
      <div className="flex flex-wrap items-start gap-3">

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, phone, city…"
            className="pl-8 pr-3 py-1.5 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 w-52"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Status */}
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none text-muted-foreground"
        >
          <option value="">All Statuses</option>
          {Object.entries(STATUS_LABELS)
            .filter(([k]) => !["open", "new_lead", "won"].includes(k))
            .map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        {/* Source */}
        <select
          value={filterSource}
          onChange={e => setFilterSource(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none text-muted-foreground"
        >
          <option value="">All Sources</option>
          {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        {/* Date range */}
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer min-w-[130px]"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">To</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={e => setDateTo(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer min-w-[130px]"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <X className="h-3 w-3" /> Clear dates
            </button>
          )}
        </div>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground transition-colors"
          >
            <X className="h-3 w-3" /> Clear all
          </button>
        )}

        <span className="ml-auto text-xs text-muted-foreground self-center">
          {filtered.length} shown · {leads.length} total
          {selected.size > 0 && (
            <span className="text-primary font-medium"> · {selected.size} selected</span>
          )}
        </span>
      </div>

      {/* ── Bulk action bar (visible when items are selected) ── */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 flex-wrap rounded-xl border-2 border-primary/20 bg-primary/5 px-4 py-3">
          <span className="text-sm font-semibold text-primary shrink-0">
            {selected.size} lead{selected.size > 1 ? "s" : ""} selected
          </span>

          {/* Bulk stage move */}
          <div className="flex items-center gap-2">
            <ArrowRightCircle className="h-4 w-4 text-muted-foreground shrink-0" />
            <select
              value={bulkStageTarget}
              onChange={e => setBulkStageTarget(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
            >
              <option value="">Move to stage…</option>
              {BULK_STAGE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={handleBulkStageUpdate}
              disabled={!bulkStageTarget || bulkUpdating}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 font-medium whitespace-nowrap"
            >
              {bulkUpdating ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating…</>
              ) : (
                "Move"
              )}
            </button>
          </div>

          {/* Divider */}
          <div className="h-5 w-px bg-border shrink-0" />

          {/* Bulk delete */}
          <button
            onClick={handleDeleteSelected}
            disabled={deleting}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 font-medium whitespace-nowrap"
          >
            {deleting ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Deleting…</>
            ) : (
              <><Trash2 className="h-3.5 w-3.5" /> Delete {selected.size}</>
            )}
          </button>

          {/* Clear selection */}
          <button
            onClick={() => { setSelected(new Set()); setBulkStageTarget(""); }}
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" /> Clear selection
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleAll}
                    className="rounded"
                  />
                </th>
                {["Name","Phone","Location","Status","Source","LSA","Lead Received"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap text-xs">{h}</th>
                ))}
                <th className="px-4 py-3 w-12" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground text-sm">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                    </div>
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground text-sm">
                    {hasFilters ? "No leads match the current filters." : "No leads found."}
                  </td>
                </tr>
              ) : paginated.map((lead, i) => {
                const name     = `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || lead.lead_name || "Unnamed";
                const initials = name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
                const city     = lead.client_city || lead.city || "";
                const state    = lead.client_state || lead.state || "";
                const location = [city, state].filter(Boolean).join(", ") || "—";
                const src      = (lead.lead_sources as any)?.name || "—";
                const received = lead.created_at
                  ? new Date(lead.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                  : "—";
                const isChosen = selected.has(lead.id);

                return (
                  <tr
                    key={lead.id}
                    onClick={() => { setSelectedLead(lead); setDialogOpen(true); }}
                    className={`border-b cursor-pointer hover:bg-muted/20 transition-colors ${
                      isChosen ? "bg-primary/5" : i % 2 !== 0 ? "bg-muted/5" : ""
                    }`}
                  >
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isChosen}
                        onChange={() => toggleOne(lead.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {initials}
                        </div>
                        <div>
                          <p className="font-medium text-sm leading-tight">{name}</p>
                          {lead.email && <p className="text-xs text-muted-foreground">{lead.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{lead.phone || "—"}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{location}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[lead.status] || "bg-gray-100 text-gray-500"}`}>
                        {STATUS_LABELS[lead.status] || lead.status || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{src}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {lead.lsa_status
                        ? <span className={`text-xs ${LSA_COLORS[lead.lsa_status] || "text-muted-foreground"}`}>
                            {lead.lsa_status.replace(/_/g, " ")}
                          </span>
                        : <span className="text-xs text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{received}</td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => { setSelectedLead(lead); setDialogOpen(true); }}
                        className="text-xs px-2 py-1 rounded border border-border hover:bg-muted transition-colors text-muted-foreground"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Showing {((page - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(page * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs px-2">{page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Lead Detail Dialog ── */}
      {/* NOTE: onStageChange cast as `any` to match the extended status values
          the DB uses (no_opportunity, completed, etc.) vs the narrow LeadStatus type */}
      <LeadDetailDialog
        lead={selectedLead as Lead | null}
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) fetchLeads();
        }}
        onStageChange={
          (async (leadId: string, newStatus: string) => {
            await supabase
              .from("leads")
              .update({ status: newStatus })
              .eq("id", leadId);
            fetchLeads();
          }) as any
        }
        onLeadUpdated={
          ((_leadId: string) => {
            fetchLeads();
          }) as any
        }
        onLeadDeleted={() => {
          setDialogOpen(false);
          fetchLeads();
        }}
      />
    </div>
  );
}