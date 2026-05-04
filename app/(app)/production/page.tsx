"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const PRODUCTION_STAGES = [
  "Deposit Collected",
  "Materials Ordered",
  "Permit Submitted",
  "Permit Approved",
  "Scheduled to Start",
  "Job In Progress",
  "Rough Inspection",
  "Final Inspection",
  "Inspection Approved",
  "Completed",
  "Completed with Balance",
  "Cancelled Before Start",
  "Cancelled Mid-Job",
];

const stageColors: Record<string, string> = {
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
  orderNumber?: number;
}

export default function ProductionPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");

  async function fetchJobs() {
    // Fetch closed won leads
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, lead_name, initial_contract_value, closed_amount, estimated_amount, production_stage, address_line_1, city, state, metadata")
      .eq("status", "closed_won")
      .order("created_at", { ascending: false });

    if (error) { console.error("Error fetching jobs:", error.message); return; }

    const leadIds = (leads || []).map((j: any) => j.id);

    // Fetch payments for leads
    let paymentsMap: Record<string, number> = {};
    if (leadIds.length > 0) {
      const { data: payments } = await supabase
        .from("payments")
        .select("lead_id, amount")
        .in("lead_id", leadIds);
      (payments || []).forEach((p: any) => {
        paymentsMap[p.lead_id] = (paymentsMap[p.lead_id] || 0) + Number(p.amount);
      });
    }

    // Fetch won change orders for these leads
    let changeOrders: any[] = [];
    if (leadIds.length > 0) {
      const { data: cos } = await supabase
        .from("change_orders")
        .select("*")
        .eq("status", "won")
        .in("lead_id", leadIds)
        .order("order_number", { ascending: true });
      changeOrders = cos || [];
    }

    // Fetch change order payments
    const coIds = changeOrders.map((co: any) => co.id);
    let coPaymentsMap: Record<string, number> = {};
    if (coIds.length > 0) {
      const { data: coPayments } = await supabase
        .from("change_order_payments")
        .select("change_order_id, amount")
        .in("change_order_id", coIds);
      (coPayments || []).forEach((p: any) => {
        coPaymentsMap[p.change_order_id] = (coPaymentsMap[p.change_order_id] || 0) + Number(p.amount);
      });
    }

    // Build lead name map for change order rows
    const leadNameMap: Record<string, any> = {};
    (leads || []).forEach((l: any) => { leadNameMap[l.id] = l; });

    // Build job rows from leads
    const leadRows: JobRow[] = (leads || []).map((job: any) => ({
      id: job.id,
      type: "lead",
      leadId: job.id,
      clientName: job.lead_name || "Unnamed",
      address: job.address_line_1
        ? `${job.address_line_1}${job.city ? ", " + job.city : ""}`
        : job.city || "No address",
      jobType: job.metadata?.job_type || null,
      description: job.metadata?.initial_contract_description || null,
      salesperson: job.metadata?.salesperson || null,
      contract: Number(job.initial_contract_value) || Number(job.estimated_amount) || 0,
      totalCollected: paymentsMap[job.id] || Number(job.closed_amount) || 0,
      production_stage: job.production_stage || null,
    }));

    // Build job rows from won change orders
    const coRows: JobRow[] = changeOrders.map((co: any) => {
      const parentLead = leadNameMap[co.lead_id];
      return {
        id: co.id,
        type: "change_order",
        leadId: co.lead_id,
        clientName: parentLead?.lead_name || "Unnamed",
        address: parentLead?.address_line_1
          ? `${parentLead.address_line_1}${parentLead.city ? ", " + parentLead.city : ""}`
          : parentLead?.city || "No address",
        jobType: co.job_type || null,
        description: co.description || null,
        salesperson: parentLead?.metadata?.salesperson || null,
        contract: Number(co.amount) || 0,
        totalCollected: coPaymentsMap[co.id] || 0,
        production_stage: co.production_stage || null,
        orderNumber: co.order_number,
      };
    });

    setJobs([...leadRows, ...coRows]);
  }

  useEffect(() => {
    fetchJobs().finally(() => setLoading(false));
  }, []);

  const handleStageUpdate = async (row: JobRow, newStage: string) => {
    const key = `${row.type}-${row.id}`;
    setUpdating(key);
    if (row.type === "lead") {
      await supabase.from("leads").update({ production_stage: newStage }).eq("id", row.id);
    } else {
      await supabase.from("change_orders").update({ production_stage: newStage }).eq("id", row.id);
    }
    await fetchJobs();
    setUpdating(null);
  };

  const filteredJobs = filter === "all" ? jobs
    : filter === "active" ? jobs.filter(j => j.production_stage && !["Completed", "Completed with Balance", "Cancelled Before Start", "Cancelled Mid-Job"].includes(j.production_stage))
    : filter === "completed" ? jobs.filter(j => j.production_stage?.startsWith("Completed"))
    : filter === "cancelled" ? jobs.filter(j => j.production_stage?.startsWith("Cancelled"))
    : filter === "balance" ? jobs.filter(j => (j.contract - j.totalCollected) > 0)
    : jobs;

  const totalContract = jobs.reduce((sum, j) => sum + j.contract, 0);
  const totalCollected = jobs.reduce((sum, j) => sum + j.totalCollected, 0);
  const totalBalance = totalContract - totalCollected;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Jobs</p>
          <p className="text-2xl font-bold mt-1">{jobs.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Collected</p>
          <p className="text-2xl font-bold mt-1 text-emerald-600">${totalCollected.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Balance Due</p>
          <p className={`text-2xl font-bold mt-1 ${totalBalance > 0 ? "text-red-500" : "text-emerald-600"}`}>
            ${totalBalance.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {[
          { key: "all", label: "All Jobs" },
          { key: "active", label: "Active" },
          { key: "completed", label: "Completed" },
          { key: "cancelled", label: "Cancelled" },
          { key: "balance", label: "Has Balance" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{filteredJobs.length} jobs</span>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Job / Client</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Salesperson</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Contract</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Collected</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Balance</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Production Stage</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading jobs...</td>
                </tr>
              ) : filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No jobs found. Move leads to Closed Won to see them here.
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job) => {
                  const balance = job.contract - job.totalCollected;
                  const rowKey = `${job.type}-${job.id}`;
                  const isUpdating = updating === rowKey;

                  return (
                    <tr
                      key={rowKey}
                      className={`border-b hover:bg-muted/30 transition-colors ${
                        job.type === "change_order" ? "bg-blue-50/30 dark:bg-blue-950/10" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {job.type === "change_order" && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium shrink-0">
                              CO#{job.orderNumber}
                            </span>
                          )}
                          <div>
                            <p className="font-medium">{job.clientName}</p>
                            <p className="text-xs text-muted-foreground">{job.address}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {job.jobType && (
                                <span className="text-xs text-primary">{job.jobType}</span>
                              )}
                              {job.description && (
                                <span className="text-xs text-muted-foreground">· {job.description}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {job.salesperson || "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        ${job.contract.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-600">
                        ${job.totalCollected.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold ${balance > 0 ? "text-red-500" : "text-emerald-600"}`}>
                          ${balance.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={job.production_stage || ""}
                          onChange={(e) => handleStageUpdate(job, e.target.value)}
                          disabled={isUpdating}
                          className="text-xs rounded-md border border-border bg-background px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 min-w-[180px]"
                        >
                          <option value="">— Set Stage —</option>
                          {PRODUCTION_STAGES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        {job.production_stage && (
                          <div className="mt-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stageColors[job.production_stage] || "bg-gray-100 text-gray-700"}`}>
                              {job.production_stage}
                            </span>
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