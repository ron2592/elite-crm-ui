"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const PRODUCTION_STAGES = [
  "Pending - Check", "Pending - Financing", "Pending - Deposit",
  "Deposit Collected", "Materials Ordered", "Permit Submitted", "Permit Approved",
  "Scheduled to Start", "Job In Progress", "Rough Inspection", "Final Inspection",
  "Inspection Approved", "Completed", "Completed with Balance",
  "Cancelled Before Start", "Cancelled Mid-Job",
];

const stageColors: Record<string, string> = {
  "Pending - Check": "bg-slate-100 text-slate-600",
  "Pending - Financing": "bg-slate-100 text-slate-600",
  "Pending - Deposit": "bg-slate-100 text-slate-600",
  "Deposit Collected": "bg-blue-100 text-blue-700",
  "Materials Ordered": "bg-indigo-100 text-indigo-700",
  "Permit Submitted": "bg-violet-100 text-violet-700",
  "Permit Approved": "bg-purple-100 text-purple-700",
  "Scheduled to Start": "bg-amber-100 text-amber-700",
  "Job In Progress": "bg-orange-100 text-orange-700",
  "Rough Inspection": "bg-cyan-100 text-cyan-700",
  "Final Inspection": "bg-teal-100 text-teal-700",
  "Inspection Approved": "bg-emerald-100 text-emerald-700",
  "Completed": "bg-green-100 text-green-700",
  "Completed with Balance": "bg-lime-100 text-lime-700",
  "Cancelled Before Start": "bg-red-100 text-red-700",
  "Cancelled Mid-Job": "bg-rose-100 text-rose-700",
};

interface JobRow {
  id: string;
  type: "lead" | "change_order";
  leadId: string;
  clientName: string;
  address: string;
  jobType: string | null;
  description: string | null;
  salesperson: string | null;
  contract: number;
  totalCollected: number;
  production_stage: string | null;
  production_stage_updated_at: string | null;
  production_notes: string | null;
  orderNumber?: number;
}

export default function ProductionPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  async function fetchJobs() {
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, lead_name, initial_contract_value, closed_amount, estimated_amount, production_stage, production_stage_updated_at, production_notes, address_line_1, city, state, metadata")
      .eq("status", "closed_won")
      .order("created_at", { ascending: false });

    if (error) { console.error("Error fetching jobs:", error.message); return; }

    const leadIds = (leads || []).map((j: any) => j.id);

    let paymentsMap: Record<string, number> = {};
    if (leadIds.length > 0) {
      const { data: payments } = await supabase.from("payments").select("lead_id, amount").in("lead_id", leadIds);
      (payments || []).forEach((p: any) => { paymentsMap[p.lead_id] = (paymentsMap[p.lead_id] || 0) + Number(p.amount); });
    }

    let changeOrders: any[] = [];
    if (leadIds.length > 0) {
      const { data: cos } = await supabase.from("change_orders").select("*").eq("status", "won").in("lead_id", leadIds).order("order_number", { ascending: true });
      changeOrders = cos || [];
    }

    const coIds = changeOrders.map((co: any) => co.id);
    let coPaymentsMap: Record<string, number> = {};
    if (coIds.length > 0) {
      const { data: coPayments } = await supabase.from("change_order_payments").select("change_order_id, amount").in("change_order_id", coIds);
      (coPayments || []).forEach((p: any) => { coPaymentsMap[p.change_order_id] = (coPaymentsMap[p.change_order_id] || 0) + Number(p.amount); });
    }

    const leadNameMap: Record<string, any> = {};
    (leads || []).forEach((l: any) => { leadNameMap[l.id] = l; });

    const leadRows: JobRow[] = (leads || []).map((job: any) => ({
      id: job.id, type: "lead", leadId: job.id,
      clientName: job.lead_name || "Unnamed",
      address: job.address_line_1 ? `${job.address_line_1}${job.city ? ", " + job.city : ""}` : job.city || "No address",
      jobType: job.metadata?.job_type || null,
      description: job.metadata?.initial_contract_description || null,
      salesperson: job.metadata?.salesperson || null,
      contract: Number(job.initial_contract_value) || Number(job.estimated_amount) || 0,
      totalCollected: paymentsMap[job.id] || Number(job.closed_amount) || 0,
      production_stage: job.production_stage || null,
      production_stage_updated_at: job.production_stage_updated_at || null,
      production_notes: job.production_notes || null,
    }));

    const coRows: JobRow[] = changeOrders.map((co: any) => {
      const parentLead = leadNameMap[co.lead_id];
      return {
        id: co.id, type: "change_order", leadId: co.lead_id,
        clientName: parentLead?.lead_name || "Unnamed",
        address: parentLead?.address_line_1 ? `${parentLead.address_line_1}${parentLead.city ? ", " + parentLead.city : ""}` : parentLead?.city || "No address",
        jobType: co.job_type || null,
        description: co.description || null,
        salesperson: parentLead?.metadata?.salesperson || null,
        contract: Number(co.amount) || 0,
        totalCollected: coPaymentsMap[co.id] || 0,
        production_stage: co.production_stage || null,
        production_stage_updated_at: co.production_stage_updated_at || null,
        production_notes: co.production_notes || null,
        orderNumber: co.order_number,
      };
    });

    setJobs([...leadRows, ...coRows]);
  }

  useEffect(() => { fetchJobs().finally(() => setLoading(false)); }, []);

  const handleStageUpdate = async (row: JobRow, newStage: string) => {
    const key = `${row.type}-${row.id}`;
    setUpdating(key);
    const now = new Date().toISOString();
    if (row.type === "lead") {
      await supabase.from("leads").update({ production_stage: newStage, production_stage_updated_at: now }).eq("id", row.id);
    } else {
      await supabase.from("change_orders").update({ production_stage: newStage, production_stage_updated_at: now }).eq("id", row.id);
    }
    await fetchJobs();
    setUpdating(null);
  };

  const handleSaveNote = async (row: JobRow) => {
    if (row.type === "lead") {
      await supabase.from("leads").update({ production_notes: noteDraft }).eq("id", row.id);
    } else {
      await supabase.from("change_orders").update({ production_notes: noteDraft }).eq("id", row.id);
    }
    setEditingNotes(null);
    await fetchJobs();
  };

  const isPending = (stage: string | null) => stage?.startsWith("Pending") || false;

  const filteredJobs = filter === "all" ? jobs
    : filter === "pending" ? jobs.filter(j => isPending(j.production_stage))
    : filter === "active" ? jobs.filter(j => j.production_stage && !isPending(j.production_stage) && !["Completed", "Completed with Balance", "Cancelled Before Start", "Cancelled Mid-Job"].includes(j.production_stage))
    : filter === "completed" ? jobs.filter(j => j.production_stage?.startsWith("Completed"))
    : filter === "cancelled" ? jobs.filter(j => j.production_stage?.startsWith("Cancelled"))
    : filter === "balance" ? jobs.filter(j => (j.contract - j.totalCollected) > 0)
    : jobs;

  const totalContract = jobs.reduce((sum, j) => sum + j.contract, 0);
  const totalCollected = jobs.reduce((sum, j) => sum + j.totalCollected, 0);
  const totalBalance = totalContract - totalCollected;
  const pendingCount = jobs.filter(j => isPending(j.production_stage)).length;

  return (
    <div className="space-y-6 max-w-full">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Jobs</p>
          <p className="text-2xl font-bold mt-1">{jobs.length}</p>
          {pendingCount > 0 && <p className="text-xs text-slate-500 mt-1">{pendingCount} pending</p>}
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Collected</p>
          <p className="text-2xl font-bold mt-1 text-emerald-600">${totalCollected.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Balance Due</p>
          <p className={`text-2xl font-bold mt-1 ${totalBalance > 0 ? "text-red-500" : "text-emerald-600"}`}>${totalBalance.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {[
          { key: "all", label: "All Jobs" },
          { key: "pending", label: "Pending" },
          { key: "active", label: "Active" },
          { key: "completed", label: "Completed" },
          { key: "cancelled", label: "Cancelled" },
          { key: "balance", label: "Has Balance" },
        ].map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === f.key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}>
            {f.label}
            {f.key === "pending" && pendingCount > 0 && (
              <span className="ml-1.5 bg-slate-600 text-white rounded-full px-1.5 py-0.5 text-xs">{pendingCount}</span>
            )}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{filteredJobs.length} jobs</span>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Job / Client</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Salesperson</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Contract</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Collected</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Balance</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Production Stage</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Stage Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Loading jobs...</td></tr>
              ) : filteredJobs.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No jobs found.</td></tr>
              ) : (
                filteredJobs.map((job) => {
                  const balance = job.contract - job.totalCollected;
                  const rowKey = `${job.type}-${job.id}`;
                  const isUpdating = updating === rowKey;
                  const isEditingNote = editingNotes === rowKey;
                  const rowBg = isPending(job.production_stage)
                    ? "bg-slate-50/50 dark:bg-slate-900/20"
                    : job.type === "change_order"
                    ? "bg-blue-50/30 dark:bg-blue-950/10"
                    : "";

                  return (
                    <tr key={rowKey} className={`border-b hover:bg-muted/30 transition-colors ${rowBg}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {job.type === "change_order" && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium shrink-0">CO#{job.orderNumber}</span>
                          )}
                          <div>
                            <p className="font-medium">{job.clientName}</p>
                            <p className="text-xs text-muted-foreground">{job.address}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {job.jobType && <span className="text-xs text-primary">{job.jobType}</span>}
                              {job.description && <span className="text-xs text-muted-foreground">· {job.description}</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{job.salesperson || "—"}</td>
                      <td className="px-4 py-3 text-right font-medium whitespace-nowrap">${job.contract.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-600 whitespace-nowrap">${job.totalCollected.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className={`font-bold ${balance > 0 ? "text-red-500" : "text-emerald-600"}`}>${balance.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={job.production_stage || ""}
                          onChange={(e) => handleStageUpdate(job, e.target.value)}
                          disabled={isUpdating}
                          className="text-xs rounded-md border border-border bg-background px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 min-w-[190px]"
                        >
                          <option value="">— Set Stage —</option>
                          <optgroup label="Pending">
                            <option value="Pending - Check">Pending - Check</option>
                            <option value="Pending - Financing">Pending - Financing</option>
                            <option value="Pending - Deposit">Pending - Deposit</option>
                          </optgroup>
                          <optgroup label="Active">
                            <option value="Deposit Collected">Deposit Collected</option>
                            <option value="Materials Ordered">Materials Ordered</option>
                            <option value="Permit Submitted">Permit Submitted</option>
                            <option value="Permit Approved">Permit Approved</option>
                            <option value="Scheduled to Start">Scheduled to Start</option>
                            <option value="Job In Progress">Job In Progress</option>
                            <option value="Rough Inspection">Rough Inspection</option>
                            <option value="Final Inspection">Final Inspection</option>
                            <option value="Inspection Approved">Inspection Approved</option>
                          </optgroup>
                          <optgroup label="Closed">
                            <option value="Completed">Completed</option>
                            <option value="Completed with Balance">Completed with Balance</option>
                            <option value="Cancelled Before Start">Cancelled Before Start</option>
                            <option value="Cancelled Mid-Job">Cancelled Mid-Job</option>
                          </optgroup>
                        </select>
                        {job.production_stage && (
                          <div className="mt-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stageColors[job.production_stage] || "bg-gray-100 text-gray-700"}`}>
                              {job.production_stage}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {job.production_stage_updated_at
                          ? new Date(job.production_stage_updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                          : "—"}
                      </td>
                      <td className="px-4 py-3 min-w-[180px]">
                        {isEditingNote ? (
                          <div className="space-y-1">
                            <textarea
                              value={noteDraft}
                              onChange={(e) => setNoteDraft(e.target.value)}
                              rows={2}
                              autoFocus
                              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                              placeholder="Add a note..."
                            />
                            <div className="flex gap-1">
                              <button onClick={() => handleSaveNote(job)} className="text-xs px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90">Save</button>
                              <button onClick={() => setEditingNotes(null)} className="text-xs px-2 py-0.5 rounded border border-border hover:bg-muted">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div
                            onClick={() => { setEditingNotes(rowKey); setNoteDraft(job.production_notes || ""); }}
                            className="cursor-pointer group"
                          >
                            {job.production_notes ? (
                              <p className="text-xs text-foreground group-hover:text-primary transition-colors">{job.production_notes}</p>
                            ) : (
                              <p className="text-xs text-muted-foreground/50 group-hover:text-primary transition-colors">+ Add note</p>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}