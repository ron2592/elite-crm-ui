"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Lead } from "@/types";
import LeadDetailDialog from "@/components/leads/LeadDetailDialog";
import { Archive, ArchiveRestore, Search, Loader2 } from "lucide-react";

const statusLabels: Record<string, string> = {
  new: "New Lead", open: "New Lead", contacted: "Qualified",
  appointment_set: "Appointment Set", estimate_sent: "Estimate Sent",
  closed_won: "Closed Won", won: "Closed Won",
  cancelled_appointment: "Cancelled Appt", closed_lost: "Cancelled Appt",
  lost: "Lost", not_qualified: "Not Qualified",
};

const statusColors: Record<string, string> = {
  new: "bg-gray-100 text-gray-600",
  open: "bg-gray-100 text-gray-600",
  contacted: "bg-blue-100 text-blue-700",
  appointment_set: "bg-purple-100 text-purple-700",
  estimate_sent: "bg-yellow-100 text-yellow-700",
  closed_won: "bg-emerald-100 text-emerald-700",
  won: "bg-emerald-100 text-emerald-700",
  cancelled_appointment: "bg-orange-100 text-orange-700",
  closed_lost: "bg-orange-100 text-orange-700",
  lost: "bg-red-100 text-red-600",
  not_qualified: "bg-gray-100 text-gray-500",
};

export default function ArchivedLeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [unarchiving, setUnarchiving] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function fetchArchivedLeads() {
    setLoading(true);
    const { data, error } = await supabase
      .from("leads")
      .select("*, lead_sources(name)")
      .eq("archived", true)
      .order("created_at", { ascending: false });

    if (error) { console.error("Error fetching archived leads:", error.message); }
    setLeads(data || []);
    setLoading(false);
  }

  useEffect(() => { fetchArchivedLeads(); }, []);

  async function handleUnarchive(leadId: string) {
    setUnarchiving(leadId);
    const { error } = await supabase
      .from("leads")
      .update({ archived: false })
      .eq("id", leadId);

    if (error) {
      console.error("Failed to unarchive:", error.message);
    } else {
      setLeads(prev => prev.filter(l => l.id !== leadId));
    }
    setUnarchiving(null);
  }

  const filtered = leads.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = (l.lead_name || l.first_name || "").toLowerCase();
    const phone = (l.phone || "").toLowerCase();
    const source = (l.lead_sources?.name || "").toLowerCase();
    return name.includes(q) || phone.includes(q) || source.includes(q);
  });

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <Archive className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-lg font-semibold">Archived Leads</h1>
            <p className="text-xs text-muted-foreground">
              {loading ? "Loading..." : `${leads.length} archived lead${leads.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, phone, source..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-4 py-2 rounded-md border border-border bg-background text-sm w-72 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading archived leads...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Archive className="h-10 w-10 opacity-20" />
          <p className="text-sm font-medium">
            {search ? "No leads match your search" : "No archived leads"}
          </p>
          {search && (
            <button onClick={() => setSearch("")}
              className="text-xs text-primary hover:underline">
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Name</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Phone</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Source</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Stage</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Salesperson</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Archived On</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead, i) => {
                const name = lead.lead_name || lead.first_name || "Unnamed Lead";
                const source = lead.lead_sources?.name || "Unknown";
                const salesperson = lead.metadata?.salesperson || "—";
                const archivedDate = new Date(lead.updated_at || lead.created_at)
                  .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                const statusKey = lead.status || "new";

                return (
                  <tr
                    key={lead.id}
                    className={`border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors ${
                      i % 2 === 0 ? "" : "bg-muted/10"
                    }`}
                  >
                    {/* Name — clickable to open dialog */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => { setSelectedLead(lead as Lead); setDialogOpen(true); }}
                        className="font-medium hover:text-primary hover:underline transition-colors text-left"
                      >
                        {name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.phone || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{source}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[statusKey] || "bg-gray-100 text-gray-600"}`}>
                        {statusLabels[statusKey] || statusKey}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{salesperson}</td>
                    <td className="px-4 py-3 text-muted-foreground">{archivedDate}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleUnarchive(lead.id)}
                        disabled={unarchiving === lead.id}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition-colors disabled:opacity-40 font-medium"
                      >
                        {unarchiving === lead.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <ArchiveRestore className="h-3 w-3" />
                        )}
                        {unarchiving === lead.id ? "Restoring..." : "Unarchive"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Lead Detail Dialog */}
      <LeadDetailDialog
        lead={selectedLead}
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) fetchArchivedLeads(); }}
        onLeadUpdated={() => fetchArchivedLeads()}
        onLeadDeleted={() => { setDialogOpen(false); fetchArchivedLeads(); }}
      />
    </>
  );
}
