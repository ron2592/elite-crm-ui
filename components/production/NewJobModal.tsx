"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { matchesSearch } from "@/lib/utils";

const STANDARD_JOB_TYPES = [
  "Roof Replacement", "Roof Repair", "Deck", "Siding",
  "Windows", "Painting", "Masonry", "Stucco", "Chimney",
];

// A "job" in Production is always tied to a lead that has already won -- either the lead
// itself (initial contract) or a change_order riding on it. Letting this picker show leads
// still mid-pipeline (e.g. Estimate Sent) creates jobs that silently never appear anywhere,
// since Production's own query only pulls change_orders whose parent lead is already in one
// of these statuses. Restricting the search here keeps what you create matching what you'll see.
const WON_STATUSES = ["closed_won", "completed", "job_cancelled"];
const WON_STATUS_LABELS: Record<string, string> = {
  closed_won: "Closed Won", completed: "Completed", job_cancelled: "Cancelled",
};

interface NewJobModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export default function NewJobModal({ open, onOpenChange, onCreated }: NewJobModalProps) {
  const [search,        setSearch]        = useState("");
  const [leadOptions,   setLeadOptions]   = useState<any[]>([]);
  const [loadingLeads,  setLoadingLeads]  = useState(false);
  const [selectedLead,  setSelectedLead]  = useState<any | null>(null);
  const [form, setForm] = useState({
    job_type: "", amount: "", status: "won" as "pending" | "won" | "lost",
    record_type: "change_order" as "change_order" | "repeat_job",
    date_added: new Date().toISOString().slice(0, 10), description: "",
    job_start_date: "", job_end_date: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedLead(null);
    setSearch("");
    setForm({
      job_type: "", amount: "", status: "won", record_type: "change_order",
      date_added: new Date().toISOString().slice(0, 10), description: "",
      job_start_date: "", job_end_date: "",
    });
    (async () => {
      setLoadingLeads(true);
      const { data } = await supabase
        .from("leads")
        .select("id, lead_name, phone, client_address, client_city, status")
        .eq("archived", false)
        .in("status", WON_STATUSES)
        .order("lead_name");
      setLeadOptions(data || []);
      setLoadingLeads(false);
    })();
  }, [open]);

  if (!open) return null;

  const filtered = (search.trim()
    ? leadOptions.filter(l => matchesSearch(`${l.lead_name || ""} ${l.phone || ""} ${l.client_address || ""} ${l.client_city || ""}`, search))
    : leadOptions
  ).slice(0, 25);

  const close = () => onOpenChange(false);

  const handleCreate = async () => {
    if (!selectedLead || !form.amount || Number(form.amount) <= 0) return;
    setSaving(true);
    const { count } = await supabase
      .from("change_orders")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", selectedLead.id);
    const dateAdded = form.date_added || new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from("change_orders").insert({
      lead_id:      selectedLead.id,
      order_number: (count || 0) + 1,
      description:  form.description || null,
      job_type:     form.job_type || null,
      amount:       Number(form.amount),
      status:       form.status,
      record_type:  form.record_type,
      date_added:   dateAdded,
      signed_at:    form.status === "won" ? new Date(dateAdded + "T12:00:00").toISOString() : null,
      job_start_date: form.job_start_date || null,
      job_end_date:   form.job_end_date || null,
    });
    setSaving(false);
    if (!error) {
      close();
      if (onCreated) onCreated();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl border border-border shadow-xl p-6 w-full max-w-md space-y-4 max-h-[85vh] overflow-y-auto">
        {!selectedLead ? (
          <>
            <div>
              <p className="font-semibold">New Job</p>
              <p className="text-xs text-muted-foreground mt-0.5">Search for the existing won client this job belongs to.</p>
            </div>
            <input
              type="text" autoFocus placeholder="Search by name, phone, or address..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            <div className="border border-border rounded-md divide-y divide-border max-h-72 overflow-y-auto">
              {loadingLeads ? (
                <p className="px-3 py-4 text-xs text-muted-foreground text-center">Loading clients...</p>
              ) : filtered.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                  {search.trim() ? "No matching clients." : "No won clients found yet."}
                </p>
              ) : filtered.map(l => (
                <button key={l.id} onClick={() => setSelectedLead(l)}
                  className="w-full text-left px-3 py-2 hover:bg-muted transition-colors">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{l.lead_name || "Unnamed"}</p>
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium shrink-0">
                      {WON_STATUS_LABELS[l.status] || l.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {[l.phone, l.client_address || l.client_city].filter(Boolean).join(" · ") || "No contact info"}
                  </p>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground/70">
              Client not showing up? Only leads already marked Closed Won, Completed, or Cancelled appear here --
              a job needs a won client to attach to. Move their lead to Closed Won first, then add the job.
            </p>
            <button onClick={close}
              className="w-full px-3 py-2 rounded-md border border-border text-sm hover:bg-muted transition-colors">
              Cancel
            </button>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">New Job</p>
                <p className="text-xs text-muted-foreground mt-0.5">for {selectedLead.lead_name || "Unnamed"}</p>
              </div>
              <button onClick={() => setSelectedLead(null)} className="text-xs text-primary hover:underline">Change client</button>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Is this a scope change to an active job, or a separate job the client is coming back for?</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setForm({ ...form, record_type: "change_order" })}
                  className={`flex-1 text-xs px-3 py-2 rounded-md border font-medium transition-colors ${form.record_type === "change_order" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted text-muted-foreground"}`}>
                  Change Order <span className="opacity-70">(active job)</span>
                </button>
                <button type="button" onClick={() => setForm({ ...form, record_type: "repeat_job" })}
                  className={`flex-1 text-xs px-3 py-2 rounded-md border font-medium transition-colors ${form.record_type === "repeat_job" ? "bg-purple-600 text-white border-purple-600" : "border-border hover:bg-muted text-muted-foreground"}`}>
                  Repeat Job <span className="opacity-70">(client's back)</span>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Job Type</label>
                <select value={form.job_type} onChange={e => setForm({ ...form, job_type: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                  <option value="">— Select type —</option>
                  {STANDARD_JOB_TYPES.map(t => <option key={t}>{t}</option>)}
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Amount</label>
                <input type="number" placeholder="0" value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Date Added</label>
                <input type="date" value={form.date_added}
                  onChange={e => setForm({ ...form, date_added: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                  <option value="pending">Pending</option>
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Job Start Date</label>
                <input type="date" value={form.job_start_date}
                  onChange={e => setForm({ ...form, job_start_date: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Job End Date</label>
                <input type="date" value={form.job_end_date}
                  onChange={e => setForm({ ...form, job_end_date: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Description</label>
              <input type="text" placeholder="e.g. Add deck, replace gutters..." value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={saving || !form.amount}
                className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors">
                {saving ? "Saving..." : "Save Job"}
              </button>
              <button onClick={close}
                className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted transition-colors">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
