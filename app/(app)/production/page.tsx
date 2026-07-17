"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Lead } from "@/types";
import LeadDetailDialog from "@/components/leads/LeadDetailDialog";
import NewJobModal from "@/components/production/NewJobModal";

const CALENDAR_STAGES = ["Scheduled to Start", "Job In Progress", "Rough Inspection", "Final Inspection"];

const stageColors: Record<string, string> = {
  "Pending - Check":          "bg-slate-100 text-slate-600",
  "Pending - Financing":      "bg-slate-100 text-slate-600",
  "Pending - Deposit":        "bg-slate-100 text-slate-600",
  "Deposit Collected":        "bg-blue-100 text-blue-700",
  "Materials Ordered":        "bg-indigo-100 text-indigo-700",
  "Permit Submitted":         "bg-violet-100 text-violet-700",
  "Permit Approved":          "bg-purple-100 text-purple-700",
  "Scheduled to Start":       "bg-amber-100 text-amber-700",
  "Job In Progress":          "bg-orange-100 text-orange-700",
  "Rough Inspection":         "bg-cyan-100 text-cyan-700",
  "Final Inspection":         "bg-teal-100 text-teal-700",
  "Inspection Approved":      "bg-emerald-100 text-emerald-700",
  "Completed":                "bg-green-100 text-green-700",
  "Completed with Balance":   "bg-lime-100 text-lime-700",
  "Cancelled Before Start":   "bg-red-100 text-red-700",
  "Cancelled Mid-Job":        "bg-rose-100 text-rose-700",
};

// ── Which production stages map to which lead status ──────────────────────────
const CANCELLED_STAGES = ["Cancelled Before Start", "Cancelled Mid-Job"];
const COMPLETED_STAGES = ["Completed", "Completed with Balance"];

interface JobRow {
  id: string;
  type: "lead" | "change_order";
  leadId: string;
  contactId: string | null;
  clientName: string;
  address: string;
  jobType: string | null;
  description: string | null;
  salesperson: string | null;
  contract: number;
  totalCollected: number;
  totalRefunded: number;
  production_stage: string | null;
  production_stage_updated_at: string | null;
  production_notes: string | null;
  jobStartDate: string | null;
  jobEndDate: string | null;
  orderNumber?: number;
  sourceId: string | null;
  sourceName: string | null;
  leadStatus: string;
  rawLead?: any;
}

// ── Refund modal state ────────────────────────────────────────────────────────
interface RefundDraft {
  leadId: string;
  clientName: string;
  collected: number;
}

function toLocalDateValue(iso: string | null): string {
  if (!iso) return "";
  const d   = new Date(iso);
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function ProductionPage() {
  const [jobs,           setJobs]           = useState<JobRow[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [updating,       setUpdating]       = useState<string | null>(null);
  const [editingNotes,   setEditingNotes]   = useState<string | null>(null);
  const [noteDraft,      setNoteDraft]      = useState("");
  const [editingDate,    setEditingDate]    = useState<string | null>(null);
  const [dateDraft,      setDateDraft]      = useState("");
  const [savingDate,     setSavingDate]     = useState(false);
  const [filter,         setFilter]         = useState("active");
  const [filterSourceId, setFilterSourceId] = useState("");
  const [sources,        setSources]        = useState<{ id: string; name: string }[]>([]);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());

  // — Schedule (job start/end date) inline edit —
  const [editingSchedule, setEditingSchedule] = useState<string | null>(null);
  const [scheduleDraft,   setScheduleDraft]   = useState({ start: "", end: "" });
  const [savingSchedule,  setSavingSchedule]  = useState(false);

  // — Quick "+ New Job" modal --  logic now lives in components/production/NewJobModal.tsx
  const [showNewJobModal,    setShowNewJobModal]    = useState(false);

  // ── Refund modal ──────────────────────────────────────────────────────────
  const [refundDraft,    setRefundDraft]    = useState<RefundDraft | null>(null);
  const [refundAmount,   setRefundAmount]   = useState("");
  const [savingRefund,   setSavingRefund]   = useState(false);

  // ── Lead detail dialog ────────────────────────────────────────────────────
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [dialogOpen,   setDialogOpen]   = useState(false);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  async function fetchJobs() {
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, contact_id, lead_name, initial_contract_value, closed_amount, estimated_amount, production_stage, production_stage_updated_at, production_notes, address_line_1, city, state, metadata, source_id, lead_sources(id, name), status, phone, email, client_address, client_city, client_state, client_zip, lsa_status, contact_type, created_at, archived, job_start_date, job_end_date")
      // ✅ Include job_cancelled so cancelled jobs still appear in Production
      .in("status", ["closed_won", "completed", "job_cancelled"])
      .order("created_at", { ascending: false });

    if (error) { console.error("Error fetching jobs:", error.message); return; }

    const leadIds = (leads || []).map((j: any) => j.id);

    let paymentsMap:  Record<string, number> = {};
    let refundsMap:   Record<string, number> = {};

    if (leadIds.length > 0) {
      const { data: payments } = await supabase
        .from("payments")
        .select("lead_id, amount, payment_type")
        .in("lead_id", leadIds);

      (payments || []).forEach((p: any) => {
        const amt = Number(p.amount || 0);
        if (amt < 0 || p.payment_type === "refund") {
          // Negative amounts = refunds
          refundsMap[p.lead_id] = (refundsMap[p.lead_id] || 0) + Math.abs(amt);
        } else {
          paymentsMap[p.lead_id] = (paymentsMap[p.lead_id] || 0) + amt;
        }
      });
    }

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

    const leadNameMap: Record<string, any> = {};
    (leads || []).forEach((l: any) => { leadNameMap[l.id] = l; });

    const leadRows: JobRow[] = (leads || []).map((job: any) => ({
      id:                          job.id,
      type:                        "lead",
      leadId:                      job.id,
      contactId:                   job.contact_id || null,
      clientName:                  job.lead_name || "Unnamed",
      address:                     job.client_address
                                     ? `${job.client_address}${job.client_city ? ", " + job.client_city : ""}`
                                     : job.client_city || "No address",
      jobType:                     job.metadata?.job_type || null,
      description:                 job.metadata?.initial_contract_description || null,
      salesperson:                 job.metadata?.salesperson || null,
      contract:                    Number(job.initial_contract_value) || Number(job.estimated_amount) || 0,
      totalCollected:              paymentsMap[job.id] || Number(job.closed_amount) || 0,
      totalRefunded:               refundsMap[job.id] || 0,
      production_stage:            job.production_stage || null,
      production_stage_updated_at: job.production_stage_updated_at || null,
      production_notes:            job.production_notes || null,
      jobStartDate:                job.job_start_date || null,
      jobEndDate:                  job.job_end_date || null,
      sourceId:                    job.source_id || null,
      sourceName:                  (job.lead_sources as any)?.name || null,
      leadStatus:                  job.status,
      rawLead:                     job,
    }));

    const coRows: JobRow[] = changeOrders.map((co: any) => {
      const parentLead = leadNameMap[co.lead_id];
      return {
        id:                          co.id,
        type:                        "change_order",
        leadId:                      co.lead_id,
        contactId:                   parentLead?.contact_id || null,
        clientName:                  parentLead?.lead_name || "Unnamed",
        address:                     parentLead?.client_address
                                       ? `${parentLead.client_address}${parentLead.client_city ? ", " + parentLead.client_city : ""}`
                                       : parentLead?.client_city || "No address",
        jobType:                     co.job_type || null,
        description:                 co.description || null,
        salesperson:                 parentLead?.metadata?.salesperson || null,
        contract:                    Number(co.amount) || 0,
        totalCollected:              coPaymentsMap[co.id] || 0,
        totalRefunded:               0,
        production_stage:            co.production_stage || null,
        production_stage_updated_at: co.production_stage_updated_at || null,
        production_notes:            co.production_notes || null,
        jobStartDate:                co.job_start_date || null,
        jobEndDate:                  co.job_end_date || null,
        orderNumber:                 co.order_number,
        sourceId:                    parentLead?.source_id || null,
        sourceName:                  parentLead?.lead_sources?.name || null,
        leadStatus:                  parentLead?.status || "",
        rawLead:                     parentLead,
      };
    });

    setJobs([...leadRows, ...coRows]);
  }

  async function fetchSingleLead(leadId: string) {
    const { data } = await supabase
      .from("leads")
      .select("*, lead_sources(name, id)")
      .eq("id", leadId)
      .single();
    if (data) {
      setSelectedLead(data as Lead);
      fetchJobs();
    }
  }

  async function fetchSources() {
    const { data } = await supabase.from("lead_sources").select("id, name").order("name");
    setSources(data || []);
  }

  useEffect(() => {
    Promise.all([fetchJobs(), fetchSources()]).finally(() => setLoading(false));
  }, []);

  // ── Stage update — auto-syncs lead status on cancel/complete ──────────────
  const handleStageUpdate = async (row: JobRow, newStage: string) => {
    const key = `${row.type}-${row.id}`;
    setUpdating(key);
    const now = new Date().toISOString();

    if (row.type === "lead") {
      const updates: Record<string, any> = {
        production_stage:            newStage,
        production_stage_updated_at: now,
      };

      // ✅ Auto-sync lead status based on production stage
      if (CANCELLED_STAGES.includes(newStage)) {
        updates.status = "job_cancelled";
      } else if (COMPLETED_STAGES.includes(newStage)) {
        updates.status = "completed";
      } else if (row.leadStatus === "job_cancelled" || row.leadStatus === "completed") {
        // Moving back out of cancelled/completed → restore to closed_won
        updates.status = "closed_won";
      }

      await supabase.from("leads").update(updates).eq("id", row.id);

      // ✅ Log stage change in lead_stage_history
      if (updates.status && updates.status !== row.leadStatus) {
        // Close out previous stage
        await supabase
          .from("lead_stage_history")
          .update({ exited_at: now })
          .eq("lead_id", row.id)
          .is("exited_at", null);
        // Open new stage
        await supabase.from("lead_stage_history").insert({
          lead_id:    row.id,
          stage:      updates.status,
          entered_at: now,
        });
      }
    } else {
      await supabase
        .from("change_orders")
        .update({ production_stage: newStage, production_stage_updated_at: now })
        .eq("id", row.id);
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

  const handleSaveDate = async (row: JobRow) => {
    if (!dateDraft) return;
    setSavingDate(true);
    const isoDate = new Date(`${dateDraft}T12:00:00`).toISOString();
    if (row.type === "lead") {
      await supabase.from("leads").update({ production_stage_updated_at: isoDate }).eq("id", row.id);
    } else {
      await supabase.from("change_orders").update({ production_stage_updated_at: isoDate }).eq("id", row.id);
    }
    setSavingDate(false);
    setEditingDate(null);
    await fetchJobs();
  };

  // Job start/end date -- used to schedule the crew, independent of production stage
  const handleSaveSchedule = async (row: JobRow) => {
    setSavingSchedule(true);
    const updates = {
      job_start_date: scheduleDraft.start || null,
      job_end_date:   scheduleDraft.end   || null,
    };
    if (row.type === "lead") {
      await supabase.from("leads").update(updates).eq("id", row.id);
    } else {
      await supabase.from("change_orders").update(updates).eq("id", row.id);
    }
    setSavingSchedule(false);
    setEditingSchedule(null);
    await fetchJobs();
  };

  // ✅ Log a refund as a negative payment
  const handleLogRefund = async () => {
    if (!refundDraft || !refundAmount || Number(refundAmount) <= 0) return;
    setSavingRefund(true);
    await supabase.from("payments").insert({
      lead_id:        refundDraft.leadId,
      amount:         -Math.abs(Number(refundAmount)),
      payment_type:   "refund",
      payment_method: "refund",
      paid_at:        new Date().toISOString(),
    });
    setSavingRefund(false);
    setRefundDraft(null);
    setRefundAmount("");
    fetchJobs();
  };

  const handleEditClient = async (row: JobRow) => {
    const { data } = await supabase
      .from("leads")
      .select("*, lead_sources(name, id)")
      .eq("id", row.leadId)
      .single();
    if (data) {
      setSelectedLead(data as Lead);
      setDialogOpen(true);
    }
  };

  // ── Filter logic ──────────────────────────────────────────────────────────
  const isPending  = (stage: string | null) => stage?.startsWith("Pending") || false;
  const isActive   = (stage: string | null) =>
    !!stage && !isPending(stage) &&
    !["Completed","Completed with Balance","Cancelled Before Start","Cancelled Mid-Job"].includes(stage);

  const stageFiltered =
    filter === "all"       ? jobs
    : filter === "pending"   ? jobs.filter(j => isPending(j.production_stage))
    : filter === "active"    ? jobs.filter(j => isActive(j.production_stage))
    : filter === "completed" ? jobs.filter(j => j.production_stage?.startsWith("Completed"))
    : filter === "cancelled" ? jobs.filter(j => j.leadStatus === "job_cancelled" || j.production_stage?.startsWith("Cancelled"))
    : filter === "no_stage"  ? jobs.filter(j => !j.production_stage)
    : filter === "balance"   ? jobs.filter(j => (j.contract - j.totalCollected) > 0)
    : jobs;

  const filteredJobs = filterSourceId
    ? stageFiltered.filter(j => j.sourceId === filterSourceId)
    : stageFiltered;

  const pendingCount   = jobs.filter(j => isPending(j.production_stage)).length;
  const activeCount    = jobs.filter(j => isActive(j.production_stage)).length;
  const noStageCount   = jobs.filter(j => !j.production_stage).length;
  const cancelledCount = jobs.filter(j => j.leadStatus === "job_cancelled").length;

  const totalContract  = filteredJobs.reduce((s, j) => s + j.contract, 0);
  const totalCollected = filteredJobs.reduce((s, j) => s + j.totalCollected, 0);
  const totalRefunded  = filteredJobs.reduce((s, j) => s + j.totalRefunded, 0);
  const totalBalance   = totalContract - totalCollected;

  // ── Group jobs by CLIENT (contact_id), not by lead ────────────────────────────────────────
  // A repeat client's original job + all their change orders + any brand-new lead they later
  // create at a totally different address (linked via contact_id, matched by phone) all collapse
  // into one row instead of being scattered through the table under separate identities.
  const clientGroups = (() => {
    const map = new Map<string, JobRow[]>();
    filteredJobs.forEach(j => {
      const key = j.contactId || j.leadId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(j);
    });
    return Array.from(map.entries()).map(([groupKey, rows]) => {
      // Group nested rows by their underlying lead (in order of first appearance — a contact can
      // have more than one lead, e.g. a different property address), then within each lead: the
      // lead row itself first, followed by its change orders in order.
      const leadOrder = new Map<string, number>();
      rows.forEach(r => { if (!leadOrder.has(r.leadId)) leadOrder.set(r.leadId, leadOrder.size); });
      const sortedRows = [...rows].sort((a, b) => {
        const orderDiff = leadOrder.get(a.leadId)! - leadOrder.get(b.leadId)!;
        if (orderDiff !== 0) return orderDiff;
        if (a.type !== b.type) return a.type === "lead" ? -1 : 1;
        return (a.orderNumber || 0) - (b.orderNumber || 0);
      });
      const contract   = rows.reduce((s, r) => s + r.contract, 0);
      const collected  = rows.reduce((s, r) => s + r.totalCollected, 0);
      const refunded   = rows.reduce((s, r) => s + r.totalRefunded, 0);
      const activeN    = rows.filter(r => isActive(r.production_stage)).length;
      const pendingN   = rows.filter(r => isPending(r.production_stage)).length;
      const completedN = rows.filter(r => r.production_stage?.startsWith("Completed")).length;
      const cancelledN = rows.filter(r => r.leadStatus === "job_cancelled" || r.production_stage?.startsWith("Cancelled")).length;
      const distinctAddresses = Array.from(new Set(rows.map(r => r.address))).length;
      const latestStageDate = rows.reduce((latest: string | null, r) => {
        if (!r.production_stage_updated_at) return latest;
        if (!latest || new Date(r.production_stage_updated_at) > new Date(latest)) return r.production_stage_updated_at;
        return latest;
      }, null as string | null);
      return {
        groupKey, rows: sortedRows,
        clientName: sortedRows[0].clientName, address: sortedRows[0].address,
        multipleAddresses: distinctAddresses > 1,
        sourceName: sortedRows[0].sourceName, salesperson: sortedRows[0].salesperson,
        contract, collected, refunded, balance: contract - collected,
        activeN, pendingN, completedN, cancelledN, latestStageDate,
      };
    }).sort((a, b) => {
      const aT = a.latestStageDate ? new Date(a.latestStageDate).getTime() : 0;
      const bT = b.latestStageDate ? new Date(b.latestStageDate).getTime() : 0;
      return bT - aT;
    });
  })();

  const toggleClientExpand = (groupKey: string) => {
    setExpandedClients(prev => { const next = new Set(prev); next.has(groupKey) ? next.delete(groupKey) : next.add(groupKey); return next; });
  };

  // ── Single job row (used both standalone and nested inside an expanded client group) ────
  const renderJobRow = (job: JobRow, nested: boolean = false) => {
    const balance           = job.contract - job.totalCollected;
    const netKept           = job.totalCollected - job.totalRefunded;
    const rowKey            = `${job.type}-${job.id}`;
    const isUpdating        = updating === rowKey;
    const isEditingNote     = editingNotes === rowKey;
    const isEditingThisDate = editingDate === rowKey;
    const isCalendarStage   = CALENDAR_STAGES.includes(job.production_stage || "");
    const isCancelled       = job.leadStatus === "job_cancelled";
    const rowBg             = isCancelled
      ? "bg-red-50/30 dark:bg-red-950/10"
      : isPending(job.production_stage)
      ? "bg-slate-50/50 dark:bg-slate-900/20"
      : job.type === "change_order"
      ? "bg-blue-50/30 dark:bg-blue-950/10"
      : "";

    return (
      <tr key={rowKey} className={`border-b hover:bg-muted/30 transition-colors ${rowBg} ${nested ? "bg-muted/10" : ""}`}>

        {/* Job / Client */}
        <td className={`px-4 py-3 ${nested ? "pl-9" : ""}`}>
          <div className="flex items-center gap-2">
            {job.type === "change_order" && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium shrink-0">CO#{job.orderNumber}</span>
            )}
            {isCancelled && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium shrink-0">Cancelled</span>
            )}
            <div>
              <button onClick={() => handleEditClient(job)}
                className="font-medium text-left hover:text-primary hover:underline transition-colors">
                {job.clientName}
              </button>
              <p className="text-xs text-muted-foreground">{job.address}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {job.jobType    && <span className="text-xs text-primary">{job.jobType}</span>}
                {job.description && <span className="text-xs text-muted-foreground">· {job.description}</span>}
              </div>
            </div>
          </div>
        </td>

        {/* Source */}
        <td className="px-4 py-3 whitespace-nowrap">
          {job.sourceName
            ? <span className="text-xs px-2 py-0.5 rounded-full bg-muted font-medium">{job.sourceName}</span>
            : <span className="text-xs text-muted-foreground/40">—</span>}
        </td>

        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{job.salesperson || "—"}</td>

        {/* Contract */}
        <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
          <span className={isCancelled ? "line-through text-muted-foreground" : ""}>
            ${job.contract.toLocaleString()}
          </span>
        </td>

        {/* Collected — shows refund if any */}
        <td className="px-4 py-3 text-right whitespace-nowrap">
          <span className="font-medium text-emerald-600">${job.totalCollected.toLocaleString()}</span>
          {job.totalRefunded > 0 && (
            <div className="text-xs text-red-500">−${job.totalRefunded.toLocaleString()} refund</div>
          )}
          {job.totalRefunded > 0 && (
            <div className="text-xs font-semibold text-emerald-700">Net: ${netKept.toLocaleString()}</div>
          )}
        </td>

        {/* Balance */}
        <td className="px-4 py-3 text-right whitespace-nowrap">
          <span className={`font-bold ${balance > 0 ? "text-red-500" : "text-emerald-600"}`}>
            ${balance.toLocaleString()}
          </span>
        </td>

        {/* Production Stage */}
        <td className="px-4 py-3">
          <select
            value={job.production_stage || ""}
            onChange={e => handleStageUpdate(job, e.target.value)}
            disabled={isUpdating}
            className="text-xs rounded-md border border-border bg-background px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 min-w-[145px]">
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
            <div className="mt-1 flex items-center gap-1">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stageColors[job.production_stage] || "bg-gray-100 text-gray-700"}`}>
                {job.production_stage}
              </span>
              {isCalendarStage && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 font-medium">📅</span>
              )}
            </div>
          )}
        </td>

        {/* Schedule (job start / end date) */}
        <td className="px-3 py-3 min-w-[140px]">
          {editingSchedule === rowKey ? (
            <div className="space-y-1">
              <div>
                <label className="text-[10px] text-muted-foreground block">Start</label>
                <input type="date" value={scheduleDraft.start}
                  onChange={e => setScheduleDraft({ ...scheduleDraft, start: e.target.value })} autoFocus
                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block">End</label>
                <input type="date" value={scheduleDraft.end}
                  onChange={e => setScheduleDraft({ ...scheduleDraft, end: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              <div className="flex gap-1">
                <button onClick={() => handleSaveSchedule(job)} disabled={savingSchedule}
                  className="text-xs px-2 py-0.5 rounded bg-primary text-primary-foreground disabled:opacity-40">
                  {savingSchedule ? "..." : "Save"}
                </button>
                <button onClick={() => setEditingSchedule(null)}
                  className="text-xs px-2 py-0.5 rounded border border-border hover:bg-muted">Cancel</button>
              </div>
            </div>
          ) : (
            <div onClick={() => { setEditingSchedule(rowKey); setScheduleDraft({ start: job.jobStartDate || "", end: job.jobEndDate || "" }); }}
              className="cursor-pointer group">
              {job.jobStartDate || job.jobEndDate ? (
                <p className="text-xs group-hover:text-primary transition-colors">
                  {job.jobStartDate ? new Date(job.jobStartDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "?"}
                  {" - "}
                  {job.jobEndDate ? new Date(job.jobEndDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "?"}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground/50 group-hover:text-primary">+ Set schedule</p>
              )}
            </div>
          )}
        </td>

        {/* Stage Date */}
        <td className="px-3 py-3 min-w-[115px]">
          {isEditingThisDate ? (
            <div className="space-y-1">
              <input type="date" value={dateDraft}
                onChange={e => setDateDraft(e.target.value)} autoFocus
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
              <div className="flex gap-1">
                <button onClick={() => handleSaveDate(job)} disabled={savingDate || !dateDraft}
                  className="text-xs px-2 py-0.5 rounded bg-primary text-primary-foreground disabled:opacity-40">
                  {savingDate ? "..." : "Save"}
                </button>
                <button onClick={() => setEditingDate(null)}
                  className="text-xs px-2 py-0.5 rounded border border-border hover:bg-muted">Cancel</button>
              </div>
            </div>
          ) : (
            <div onClick={() => { setEditingDate(rowKey); setDateDraft(toLocalDateValue(job.production_stage_updated_at)); }}
              className="cursor-pointer group">
              {job.production_stage_updated_at ? (
                <p className="text-xs group-hover:text-primary transition-colors">
                  {new Date(job.production_stage_updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground/50 group-hover:text-primary">+ Set date</p>
              )}
            </div>
          )}
        </td>

        {/* Notes */}
        <td className="px-3 py-3 min-w-[130px]">
          {isEditingNote ? (
            <div className="space-y-1">
              <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)}
                rows={2} autoFocus placeholder="Add a note..."
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
              <div className="flex gap-1">
                <button onClick={() => handleSaveNote(job)}
                  className="text-xs px-2 py-0.5 rounded bg-primary text-primary-foreground">Save</button>
                <button onClick={() => setEditingNotes(null)}
                  className="text-xs px-2 py-0.5 rounded border border-border hover:bg-muted">Cancel</button>
              </div>
            </div>
          ) : (
            <div onClick={() => { setEditingNotes(rowKey); setNoteDraft(job.production_notes || ""); }}
              className="cursor-pointer group">
              {job.production_notes
                ? <p className="text-xs group-hover:text-primary transition-colors">{job.production_notes}</p>
                : <p className="text-xs text-muted-foreground/50 group-hover:text-primary">+ Add note</p>}
            </div>
          )}
        </td>

        {/* Actions */}
        <td className="px-4 py-3">
          <div className="flex flex-col gap-1">
            <button onClick={() => handleEditClient(job)}
              className="text-xs px-2 py-1 rounded border border-border hover:bg-muted transition-colors text-muted-foreground whitespace-nowrap">
              Edit
            </button>
            {isCancelled && job.totalCollected > 0 && (
              <button
                onClick={() => { setRefundDraft({ leadId: job.leadId, clientName: job.clientName, collected: job.totalCollected }); setRefundAmount(""); }}
                className="text-xs px-2 py-1 rounded border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors whitespace-nowrap">
                Refund
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  // ── Collapsed summary row for a client with more than one job ───────────────────────────
  const renderClientGroupRow = (group: (typeof clientGroups)[number]) => {
    const isExpanded = expandedClients.has(group.groupKey);
    const statusChips: { label: string; classes: string }[] = [];
    if (group.activeN)    statusChips.push({ label: `${group.activeN} Active`,    classes: "bg-orange-100 text-orange-700" });
    if (group.completedN) statusChips.push({ label: `${group.completedN} Completed`, classes: "bg-green-100 text-green-700" });
    if (group.pendingN)   statusChips.push({ label: `${group.pendingN} Pending`,   classes: "bg-slate-100 text-slate-600" });
    if (group.cancelledN) statusChips.push({ label: `${group.cancelledN} Cancelled`, classes: "bg-red-100 text-red-700" });

    return (
      <>
        <tr key={group.groupKey} className="border-b hover:bg-muted/30 transition-colors bg-muted/5 cursor-pointer" onClick={() => toggleClientExpand(group.groupKey)}>
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{isExpanded ? "▾" : "▸"}</span>
              <div>
                <p className="font-semibold">{group.clientName} <span className="text-xs font-normal text-muted-foreground">· {group.rows.length} jobs</span></p>
                <p className="text-xs text-muted-foreground">{group.multipleAddresses ? "Multiple addresses — expand for details" : group.address}</p>
              </div>
            </div>
          </td>
          <td className="px-4 py-3 whitespace-nowrap">
            {group.sourceName
              ? <span className="text-xs px-2 py-0.5 rounded-full bg-muted font-medium">{group.sourceName}</span>
              : <span className="text-xs text-muted-foreground/40">—</span>}
          </td>
          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{group.salesperson || "—"}</td>
          <td className="px-4 py-3 text-right font-medium whitespace-nowrap">${group.contract.toLocaleString()}</td>
          <td className="px-4 py-3 text-right whitespace-nowrap">
            <span className="font-medium text-emerald-600">${group.collected.toLocaleString()}</span>
            {group.refunded > 0 && <div className="text-xs text-red-500">−${group.refunded.toLocaleString()} refund</div>}
          </td>
          <td className="px-4 py-3 text-right whitespace-nowrap">
            <span className={`font-bold ${group.balance > 0 ? "text-red-500" : "text-emerald-600"}`}>${group.balance.toLocaleString()}</span>
          </td>
          <td className="px-4 py-3">
            <div className="flex items-center gap-1 flex-wrap">
              {statusChips.map(c => (
                <span key={c.label} className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.classes}`}>{c.label}</span>
              ))}
            </div>
          </td>
          <td className="px-3 py-3 min-w-[140px] text-xs text-muted-foreground">—</td>
          <td className="px-3 py-3 min-w-[115px] text-xs text-muted-foreground">
            {group.latestStageDate ? new Date(group.latestStageDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
          </td>
          <td className="px-3 py-3 min-w-[130px] text-xs text-muted-foreground">—</td>
          <td className="px-4 py-3">
            <button onClick={(e) => { e.stopPropagation(); toggleClientExpand(group.groupKey); }}
              className="text-xs px-2 py-1 rounded border border-border hover:bg-muted transition-colors text-muted-foreground whitespace-nowrap">
              {isExpanded ? "Collapse" : "Expand"}
            </button>
          </td>
        </tr>
        {isExpanded && group.rows.map(row => renderJobRow(row, true))}
      </>
    );
  };

  return (
    <div className="space-y-6 max-w-full">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Production</h1>
        <button onClick={() => setShowNewJobModal(true)}
          className="flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 transition-colors">
          <span className="text-base leading-none">+</span> New Job
        </button>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Jobs</p>
          <p className="text-2xl font-bold mt-1">{filteredJobs.length}</p>
          {pendingCount > 0 && <p className="text-xs text-slate-500 mt-1">{pendingCount} pending</p>}
          {cancelledCount > 0 && <p className="text-xs text-red-500 mt-0.5">{cancelledCount} cancelled</p>}
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Collected</p>
          <p className="text-2xl font-bold mt-1 text-emerald-600">${totalCollected.toLocaleString()}</p>
          {totalRefunded > 0 && (
            <p className="text-xs text-red-500 mt-1">
              −${totalRefunded.toLocaleString()} refunded · Net: ${(totalCollected - totalRefunded).toLocaleString()}
            </p>
          )}
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Balance Due</p>
          <p className={`text-2xl font-bold mt-1 ${totalBalance > 0 ? "text-red-500" : "text-emerald-600"}`}>
            ${totalBalance.toLocaleString()}
          </p>
        </div>
      </div>

      {/* ── Refund Modal ── */}
      {refundDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-xl border border-border shadow-xl p-6 w-80 space-y-4">
            <div>
              <p className="font-semibold">Log Refund</p>
              <p className="text-xs text-muted-foreground mt-0.5">{refundDraft.clientName}</p>
              <p className="text-xs text-muted-foreground">Total collected: ${refundDraft.collected.toLocaleString()}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Refund Amount ($)</label>
              <input
                type="number"
                min={0}
                max={refundDraft.collected}
                value={refundAmount}
                onChange={e => setRefundAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Net kept after refund: ${Math.max(0, refundDraft.collected - Number(refundAmount || 0)).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleLogRefund}
                disabled={savingRefund || !refundAmount || Number(refundAmount) <= 0}
                className="flex-1 rounded-md bg-red-600 text-white px-3 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-40 transition-colors"
              >
                {savingRefund ? "Saving…" : "Log Refund"}
              </button>
              <button
                onClick={() => { setRefundDraft(null); setRefundAmount(""); }}
                className="px-3 py-2 rounded-md border border-border text-sm hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Job Modal ── */}
      <NewJobModal open={showNewJobModal} onOpenChange={setShowNewJobModal} onCreated={fetchJobs} />

      {/* ── Filters ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { key: "active",    label: "Active",     badge: activeCount    },
          { key: "pending",   label: "Pending",    badge: pendingCount   },
          { key: "no_stage",  label: "No Stage",   badge: noStageCount   },
          { key: "completed", label: "Completed",  badge: null           },
          { key: "cancelled", label: "Cancelled",  badge: cancelledCount },
          { key: "balance",   label: "Has Balance",badge: null           },
          { key: "all",       label: "All Jobs",   badge: null           },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f.key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}>
            {f.label}
            {f.badge != null && f.badge > 0 && (
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs text-white ${f.key === "cancelled" ? "bg-red-500" : "bg-slate-600"}`}>
                {f.badge}
              </span>
            )}
          </button>
        ))}

        <select value={filterSourceId} onChange={e => setFilterSourceId(e.target.value)}
          className="ml-2 text-xs rounded-md border border-border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/40 text-muted-foreground">
          <option value="">All Sources</option>
          {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {filterSourceId && (
          <button onClick={() => setFilterSourceId("")} className="text-xs text-muted-foreground hover:text-foreground">× Clear</button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{filteredJobs.length} jobs</span>
      </div>

      {/* ── Table ── */}
      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Job / Client</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Source</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Salesperson</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Contract</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Collected</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Balance</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Production Stage</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Schedule</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Stage Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Notes</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">Loading jobs...</td></tr>
              ) : filteredJobs.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                  {filter === "active" ? "No active jobs. Set a production stage to see jobs here." : "No jobs found."}
                </td></tr>
              ) : clientGroups.map(group =>
                  group.rows.length > 1 ? renderClientGroupRow(group) : renderJobRow(group.rows[0])
                )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Lead Detail Dialog ── */}
      <LeadDetailDialog
        lead={selectedLead}
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) fetchJobs(); }}
        onStageChange={async (leadId, newStatus) => {
          await supabase.from("leads").update({ status: newStatus }).eq("id", leadId);
          fetchJobs();
        }}
        onLeadUpdated={(leadId) => fetchSingleLead(leadId)}
        onLeadDeleted={() => { setDialogOpen(false); fetchJobs(); }}
      />
    </div>
  );
}
