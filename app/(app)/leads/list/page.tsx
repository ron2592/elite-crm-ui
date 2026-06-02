"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  Search, Trash2, Download, CheckSquare, Square,
  Loader2, AlertTriangle, X, RefreshCw, Pencil,
} from "lucide-react";
import LeadDetailDialog from "@/components/leads/LeadDetailDialog";
import { Lead } from "@/types";

type LeadRow = {
  id: string;
  lead_name: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  client_city: string | null;
  client_state: string | null;
  status: string;
  contact_type: string | null;
  lsa_status: string | null;
  bad_lead: boolean;
  initial_contract_value: number;
  created_at: string;
  source_id: string | null;
  metadata: any;
  lead_sources?: { name: string } | null;
};

const STATUS_LABELS: Record<string, string> = {
  new: "New Lead", new_lead: "New Lead",
  open: "New Lead", contacted: "Qualified",
  appointment_set: "Appt Set", estimate_sent: "Estimate Sent",
  closed_won: "Closed Won", won: "Closed Won",
  cancelled_appointment: "Cancelled", lost: "Lost",
  not_qualified: "Not Qualified",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-700",
  new_lead: "bg-blue-100 text-blue-700",
  open: "bg-blue-100 text-blue-700",
  contacted: "bg-purple-100 text-purple-700",
  appointment_set: "bg-yellow-100 text-yellow-700",
  estimate_sent: "bg-orange-100 text-orange-700",
  closed_won: "bg-emerald-100 text-emerald-700",
  won: "bg-emerald-100 text-emerald-700",
  cancelled_appointment: "bg-gray-100 text-gray-500",
  lost: "bg-red-100 text-red-600",
  not_qualified: "bg-gray-100 text-gray-500",
};

const LSA_COLORS: Record<string, string> = {
  charged: "text-blue-600",
  credited: "text-emerald-600",
  not_charged: "text-gray-400",
  in_review: "text-amber-500",
  submitted: "text-yellow-600",
};

export default function ContactsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [filtered, setFiltered] = useState<LeadRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [sources, setSources] = useState<{ id: string; name: string }[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [importDates, setImportDates] = useState<string[]>([]);

  // ── Lead detail dialog ──
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("leads")
      .select("*, lead_sources(name)")
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(2000);
    setLeads(data || []);
    setLoading(false);

    const dates = [...new Set(
      (data || []).map((l: any) => l.created_at?.split("T")[0]).filter(Boolean)
    )].sort().reverse();
    setImportDates(dates as string[]);
  }, []);

  async function fetchSingleLead(leadId: string) {
    const { data } = await supabase
      .from("leads")
      .select("*, lead_sources(name)")
      .eq("id", leadId)
      .single();
    if (data) {
      setSelectedLead(data as Lead);
      setLeads(prev => prev.map(l => l.id === leadId ? data as LeadRow : l));
    }
  }

  useEffect(() => {
    supabase.from("lead_sources").select("id,name").order("name")
      .then(({ data }) => setSources(data || []));
    loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    let f = [...leads];
    if (search.trim()) {
      const q = search.toLowerCase();
      f = f.filter(l =>
        l.lead_name?.toLowerCase().includes(q) ||
        l.phone?.includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.client_city?.toLowerCase().includes(q)
      );
    }
    if (statusFilter) f = f.filter(l => l.status === statusFilter);
    if (sourceFilter) f = f.filter(l => l.source_id === sourceFilter);
    if (dateFilter) f = f.filter(l => l.created_at?.startsWith(dateFilter));
    setFiltered(f);
  }, [leads, search, statusFilter, sourceFilter, dateFilter]);

  const toggleAll = () => {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(l => l.id)));
  };

  const toggleOne = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    const ids = [...selected];
    for (let i = 0; i < ids.length; i += 100) {
      await supabase.from("leads").delete().in("id", ids.slice(i, i + 100));
    }
    setSelected(new Set());
    setShowDeleteConfirm(false);
    setDeleting(false);
    await loadLeads();
  };

  const handleExport = () => {
    const rows = filtered.filter(l => selected.size === 0 || selected.has(l.id));
    const headers = ["Name", "Phone", "Email", "City", "State", "Status", "LSA Status", "Source", "Date"];
    const csv = [
      headers.join(","),
      ...rows.map(l => [
        `"${l.lead_name || ""}"`, `"${l.phone || ""}"`, `"${l.email || ""}"`,
        `"${l.client_city || ""}"`, `"${l.client_state || ""}"`,
        `"${STATUS_LABELS[l.status] || l.status}"`, `"${l.lsa_status || ""}"`,
        `"${(l.lead_sources as any)?.name || ""}"`, `"${l.created_at?.split("T")[0] || ""}"`,
      ].join(","))
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "leads-export.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Open lead detail on row click ──
  const handleRowClick = (lead: LeadRow) => {
    setSelectedLead(lead as unknown as Lead);
    setDialogOpen(true);
  };

  const allSelected = filtered.length > 0 && selected.size === filtered.length;
  const someSelected = selected.size > 0 && selected.size < filtered.length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h1 className="text-lg font-bold">Contacts</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {filtered.length} leads
            {selected.size > 0 && <span className="text-primary font-medium"> · {selected.size} selected</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadLeads}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted transition-colors text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button onClick={() => router.push("/leads/import")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted transition-colors text-muted-foreground">
            Import CSV
          </button>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted transition-colors text-muted-foreground">
            <Download className="h-3.5 w-3.5" />
            {selected.size > 0 ? `Export ${selected.size}` : "Export All"}
          </button>
          {selected.size > 0 && (
            <button onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors font-medium">
              <Trash2 className="h-3.5 w-3.5" /> Delete {selected.size}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-muted/20 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, phone, city..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
            <X className="h-3 w-3 text-muted-foreground" />
          </button>}
        </div>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="text-xs rounded-md border border-border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/40">
          <option value="">All Statuses</option>
          {[...new Set(Object.keys(STATUS_LABELS))].map(k => (
            <option key={k} value={k}>{STATUS_LABELS[k]}</option>
          ))}
        </select>

        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
          className="text-xs rounded-md border border-border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/40">
          <option value="">All Sources</option>
          {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <select value={dateFilter} onChange={e => setDateFilter(e.target.value)}
          className="text-xs rounded-md border border-border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/40">
          <option value="">All Dates</option>
          {importDates.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        {dateFilter && (
          <button onClick={toggleAll} className="text-xs text-primary hover:underline font-medium">
            {allSelected ? "Deselect all" : `Select all ${filtered.length} on ${dateFilter}`}
          </button>
        )}

        {(statusFilter || sourceFilter || dateFilter || search) && (
          <button onClick={() => { setSearch(""); setStatusFilter(""); setSourceFilter(""); setDateFilter(""); }}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <X className="h-3 w-3" /> Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading contacts...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <p className="text-sm">No leads found</p>
            <p className="text-xs mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/30 border-b border-border z-10">
              <tr>
                <th className="w-10 px-3 py-2.5">
                  <button onClick={toggleAll} className="flex items-center">
                    {allSelected
                      ? <CheckSquare className="h-4 w-4 text-primary" />
                      : someSelected
                        ? <div className="h-4 w-4 rounded border-2 border-primary bg-primary/20" />
                        : <Square className="h-4 w-4 text-muted-foreground" />
                    }
                  </button>
                </th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Name</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Phone</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Location</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Status</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Source</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">LSA</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Lead Received</th>
                <th className="w-16 px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtered.map(lead => (
                <tr key={lead.id}
                  onClick={() => handleRowClick(lead)}
                  className={`hover:bg-muted/20 transition-colors cursor-pointer ${selected.has(lead.id) ? "bg-primary/5" : ""}`}>
                  <td className="px-3 py-2.5" onClick={e => { e.stopPropagation(); toggleOne(lead.id); }}>
                    {selected.has(lead.id)
                      ? <CheckSquare className="h-4 w-4 text-primary" />
                      : <Square className="h-4 w-4 text-muted-foreground" />
                    }
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-foreground truncate max-w-[160px]">
                      {lead.lead_name || <span className="text-muted-foreground italic">No name</span>}
                    </div>
                    {lead.email && <div className="text-muted-foreground truncate max-w-[160px]">{lead.email}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground font-mono">
                    {lead.phone || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {[lead.client_city, lead.client_state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[lead.status] || "bg-gray-100 text-gray-600"}`}>
                      {STATUS_LABELS[lead.status] || lead.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[120px]">
                    {(lead.lead_sources as any)?.name || "—"}
                  </td>
                  <td className={`px-3 py-2.5 font-medium ${LSA_COLORS[lead.lsa_status || ""] || "text-muted-foreground"}`}>
                    {lead.lsa_status ? lead.lsa_status.replace(/_/g, " ") : "—"}
                  </td>
                  {/* ✅ CHANGED: "Date" → "Lead Received" */}
                  <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                    {lead.created_at
                      ? new Date(lead.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "—"}
                  </td>
                  {/* ✅ Edit button per row */}
                  <td className="px-3 py-2.5" onClick={e => { e.stopPropagation(); handleRowClick(lead); }}>
                    <button className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border hover:bg-muted hover:text-primary transition-colors text-muted-foreground">
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Summary bar */}
      {filtered.length > 0 && (
        <div className="px-6 py-2.5 border-t border-border bg-muted/10 flex items-center justify-between text-xs text-muted-foreground">
          <span>{filtered.length} leads shown · {leads.length} total</span>
          {selected.size > 0 && <span className="text-primary font-medium">{selected.size} selected</span>}
        </div>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-xl border border-border p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold">Delete {selected.size} leads?</p>
                <p className="text-xs text-muted-foreground mt-0.5">This cannot be undone.</p>
              </div>
            </div>
            {dateFilter && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 mb-4 text-xs text-amber-700">
                You're deleting all leads imported on <strong>{dateFilter}</strong>.
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting}
                className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="px-4 py-2 text-sm rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors font-medium flex items-center gap-2">
                {deleting ? <><Loader2 className="h-4 w-4 animate-spin" /> Deleting...</> : `Delete ${selected.size} leads`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ Lead Detail Dialog — opens on row click */}
      <LeadDetailDialog
        lead={selectedLead}
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) loadLeads(); }}
        onLeadUpdated={(leadId) => fetchSingleLead(leadId)}
        onLeadDeleted={() => { setDialogOpen(false); loadLeads(); }}
      />
    </div>
  );
}
