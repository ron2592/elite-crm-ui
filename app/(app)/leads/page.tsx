"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Lead, LeadStatus } from "@/types";
import KanbanColumn from "@/components/leads/KanbanColumn";
import LeadDetailDialog from "@/components/leads/LeadDetailDialog";
import { ChevronLeft, ChevronRight, Upload, Plus, Save, X, Loader2, Info } from "lucide-react";

const MONTH_NAMES = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

// ── Stages passed to KanbanColumn (known types only) ─────────────────────────
const SALES_STAGES: LeadStatus[] = ["new","contacted","appointment_set","estimate_sent","closed_won"];
const DEAD_STAGES:  LeadStatus[] = ["cancelled_appointment","lost","not_qualified"];

// ── Stage descriptions ────────────────────────────────────────────────────────
const STAGE_DESCRIPTIONS: Record<string, string> = {
  completed:             "Job is done. Lead also appears in Production tracker.",
  no_opportunity:        "Had appointment or quote — not motivated to move forward. Worth following up later.",
  lost:                  "We quoted but never won the job. Price, timing, or competitor.",
  not_qualified:         "Services we don't offer, wrong number, spam, or just looking for a job.",
  cancelled_appointment: "Appointment was set but cancelled — client may reschedule.",
};

// ── ALL pipeline stages for +New Lead form ────────────────────────────────────
const PIPELINE_STAGE_OPTIONS = [
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

const SALESPERSONS = ["Ron","Ray","Other (Phone)"];

function normalizeStatus(raw: string): string {
  const map: Record<string, string> = {
    open: "new", new: "new", new_lead: "new",
    won: "closed_won", lost: "lost",
    contacted: "contacted", appointment_set: "appointment_set",
    estimate_sent: "estimate_sent", closed_won: "closed_won",
    completed: "completed",
    closed_lost: "cancelled_appointment", cancelled_appointment: "cancelled_appointment",
    not_qualified: "not_qualified", no_opportunity: "no_opportunity",
  };
  return map[raw] ?? "new";
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0,3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
}

// ── SimpleStageColumn — renders new/custom stages with full DnD support ───────
// Used for "completed" and "no_opportunity" which aren't in KanbanColumn's LeadStatus type
function SimpleStageColumn({
  stageLabel, stageValue, dotColor, leads, onLeadClick, changeOrderTotals, onDropLead,
}: {
  stageLabel:        string;
  stageValue:        string;          // ✅ the actual status value saved to DB
  dotColor:          string;
  leads:             Lead[];
  onLeadClick:       (lead: Lead) => void;
  changeOrderTotals: Record<string, number>;
  onDropLead:        (leadId: string, newStatus: string) => void;  // ✅ DnD callback
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const totalValue = leads.reduce((sum, l: any) =>
    sum + Number(l.estimated_amount || l.initial_contract_value || 0) + (changeOrderTotals[l.id] || 0), 0);

  // ── Column drop handlers ──────────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const leadId = e.dataTransfer.getData("leadId");
    if (leadId) onDropLead(leadId, stageValue);
  };

  return (
    <div
      className={`w-72 shrink-0 flex flex-col transition-colors rounded-xl ${isDragOver ? "bg-primary/5 ring-2 ring-primary/30" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
          <span className="text-sm font-semibold">{stageLabel}</span>
          <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{leads.length}</span>
        </div>
      </div>
      {totalValue > 0 && (
        <p className="text-xs text-muted-foreground mb-2 px-1">Total: ${totalValue.toLocaleString()}</p>
      )}

      {/* Drop zone when empty */}
      {leads.length === 0 ? (
        <div className={`rounded-xl border-2 border-dashed p-4 text-center text-xs text-muted-foreground min-h-[80px] flex items-center justify-center transition-colors ${isDragOver ? "border-primary/50 bg-primary/5 text-primary" : "border-border"}`}>
          {isDragOver ? `Move to ${stageLabel}` : "No leads"}
        </div>
      ) : (
        <div className="space-y-2 overflow-y-auto max-h-[600px]">
          {leads.map(lead => {
            const l = lead as any;
            const name = l.lead_name || `${l.first_name || ""} ${l.last_name || ""}`.trim() || "Unnamed";
            const initials = name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
            const src = l.lead_sources?.name || "";
            const date = l.created_at
              ? new Date(l.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : "";
            const val = Number(l.initial_contract_value || l.estimated_amount || 0) + (changeOrderTotals[l.id] || 0);

            return (
              <div
                key={l.id}
                draggable                                                  // ✅ make card draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("leadId", l.id);                  // ✅ store leadId for drop
                  e.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => onLeadClick(lead)}
                className="rounded-xl border border-border bg-card p-3 cursor-grab active:cursor-grabbing hover:shadow-md hover:border-primary/30 transition-all"
              >
                <div className="flex items-start gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate leading-tight">{name}</p>
                    {l.phone && <p className="text-xs text-muted-foreground">{l.phone}</p>}
                    {src   && <p className="text-xs text-muted-foreground mt-0.5">{src}</p>}
                    <div className="flex items-center justify-between mt-1">
                      {val > 0 && <span className="text-xs text-emerald-600 font-semibold">${val.toLocaleString()}</span>}
                      {date  && <span className="text-xs text-muted-foreground">{date}</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function LeadsPage() {
  const now    = new Date();
  const router = useRouter();

  const [allLeads,          setAllLeads]          = useState<Lead[]>([]);
  const [changeOrderTotals, setChangeOrderTotals] = useState<Record<string, number>>({});
  const [selectedLead,      setSelectedLead]      = useState<Lead | null>(null);
  const [dialogOpen,        setDialogOpen]        = useState(false);
  const [selectedMonth,     setSelectedMonth]     = useState(now.getMonth());
  const [selectedYear,      setSelectedYear]      = useState(now.getFullYear());
  const [viewAll,           setViewAll]           = useState(false);
  const [filterSourceId,    setFilterSourceId]    = useState("");
  const [leadSources,       setLeadSources]       = useState<{ id: string; name: string }[]>([]);
  const [showNewLead,       setShowNewLead]       = useState(false);
  const [newLeadForm,       setNewLeadForm]       = useState({
    first_name: "", last_name: "", phone: "", email: "",
    source_id: "", salesperson: "", notes: "", status: "new",
  });
  const [savingNewLead, setSavingNewLead] = useState(false);
  const [dupWarning,    setDupWarning]    = useState<{ name: string; status: string } | null>(null);

  const isCurrentMonth = selectedMonth === now.getMonth() && selectedYear === now.getFullYear();

  function goToPrevMonth() {
    if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1); }
    else setSelectedMonth(m => m - 1);
  }
  function goToNextMonth() {
    const nm = selectedMonth === 11 ? 0 : selectedMonth + 1;
    const ny = selectedMonth === 11 ? selectedYear + 1 : selectedYear;
    if (ny > now.getFullYear() || (ny === now.getFullYear() && nm > now.getMonth())) return;
    setSelectedMonth(nm); setSelectedYear(ny);
  }

  async function fetchLeads() {
    const { data, error } = await supabase
      .from("leads")
      .select("*, lead_sources(name, id)")
      .neq("archived", true)
      .order("created_at", { ascending: false });

    if (error) { console.error("fetchLeads error:", error.message); return; }

    const normalized = (data || []).map((l: any) => ({
      ...l, status: normalizeStatus(l.status ?? "new"),
    }));
    setAllLeads(normalized as Lead[]);

    const wIds = normalized.filter((l: any) => ["closed_won","completed"].includes(l.status)).map((l: any) => l.id);
    if (wIds.length > 0) {
      const { data: cos } = await supabase.from("change_orders")
        .select("lead_id, amount").eq("status","won").in("lead_id", wIds);
      const totals: Record<string, number> = {};
      (cos || []).forEach((co: any) => { totals[co.lead_id] = (totals[co.lead_id] || 0) + Number(co.amount); });
      setChangeOrderTotals(totals);
    }
  }

  async function fetchLeadSources() {
    const { data } = await supabase.from("lead_sources").select("id, name").order("name");
    setLeadSources(data || []);
  }

  async function fetchSingleLead(leadId: string) {
    const { data } = await supabase.from("leads").select("*, lead_sources(name, id)").eq("id", leadId).single();
    if (data) {
      const n = { ...data, status: normalizeStatus(data.status ?? "new") };
      setSelectedLead(n as Lead);
      setAllLeads(prev => prev.map(l => (l as any).id === leadId ? n as Lead : l));
    }
  }

  async function handleCreateNewLead(force = false) {
    if (!newLeadForm.phone && !newLeadForm.first_name) return;
    setSavingNewLead(true);
    setDupWarning(null);

    if (newLeadForm.phone && !force) {
      const digits     = newLeadForm.phone.replace(/\D/g, "");
      const normalized = digits.length === 10
        ? `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
        : newLeadForm.phone;
      const { data: existing } = await supabase
        .from("leads").select("id, lead_name, status")
        .or(`phone.eq.${normalized},phone.eq.${newLeadForm.phone}`)
        .neq("archived", true).limit(1).maybeSingle();
      if (existing) {
        setDupWarning({ name: existing.lead_name || "Unnamed", status: existing.status });
        setSavingNewLead(false);
        return;
      }
    }

    const fullName = `${newLeadForm.first_name} ${newLeadForm.last_name}`.trim();
    const { error } = await supabase.from("leads").insert({
      lead_name:              fullName || newLeadForm.phone || "New Lead",
      phone:                  newLeadForm.phone     || null,
      email:                  newLeadForm.email     || null,
      source_id:              newLeadForm.source_id || null,
      status:                 newLeadForm.status    || "new",
      archived: false, bad_lead: false, initial_contract_value: 0,
      metadata: { salesperson: newLeadForm.salesperson || null, notes: newLeadForm.notes || null },
    });

    setSavingNewLead(false);
    if (!error) {
      setShowNewLead(false); setDupWarning(null);
      setNewLeadForm({ first_name:"", last_name:"", phone:"", email:"", source_id:"", salesperson:"", notes:"", status:"new" });
      fetchLeads();
    } else {
      alert("Error creating lead: " + error.message);
    }
  }

  useEffect(() => {
    fetchLeads(); fetchLeadSources();
    const ch = supabase.channel("leads-realtime")
      .on("postgres_changes", { event:"*", schema:"public", table:"leads" }, () => fetchLeads())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const monthStart = new Date(selectedYear, selectedMonth, 1);
  const monthEnd   = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);

  const leads = allLeads.filter((lead: any) => {
    if (!viewAll) {
      const r = new Date(lead.created_at);
      if (r < monthStart || r > monthEnd) return false;
    }
    if (filterSourceId && (lead as any).source_id !== filterSourceId) return false;
    return true;
  });

  const handleLeadClick = (lead: Lead) => { setSelectedLead(lead); setDialogOpen(true); };

  // ✅ handleStageChange works for ALL stages (string, not just LeadStatus)
  const handleStageChange = async (leadId: string, newStatus: string) => {
    setAllLeads(prev => prev.map(l => (l as any).id === leadId ? { ...l, status: newStatus } : l));
    await supabase.from("leads").update({ status: newStatus }).eq("id", leadId);
  };

  const ALL_STAGE_KEYS = [...SALES_STAGES, "completed", ...DEAD_STAGES, "no_opportunity"];
  const leadsByStage: Record<string, Lead[]> = {};
  ALL_STAGE_KEYS.forEach(s => { leadsByStage[s] = leads.filter(l => l.status === s); });

  const pipelineValue = leads
    .filter(l => ["new","contacted","appointment_set","estimate_sent","closed_won","completed"].includes(l.status as string))
    .reduce((sum, l: any) =>
      sum + Number(l.estimated_amount || l.initial_contract_value || 0) + (changeOrderTotals[l.id] || 0), 0);

  const hiddenCount = allLeads.length - leads.length;

  const StageInfo = ({ stage }: { stage: string }) => {
    const desc = STAGE_DESCRIPTIONS[stage];
    if (!desc) return null;
    return (
      <span className="relative group ml-1">
        <Info className="h-3 w-3 text-muted-foreground/50 inline cursor-help" />
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-56 rounded-md bg-foreground text-background text-xs p-2 hidden group-hover:block z-50 shadow-lg leading-relaxed">
          {desc}
        </span>
      </span>
    );
  };

  return (
    <>
      {/* ── Header ── */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        {!viewAll ? (
          <div className="flex items-center gap-3">
            <button onClick={goToPrevMonth} className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-center min-w-[150px]">
              <p className="font-semibold text-sm">{MONTH_NAMES[selectedMonth]} {selectedYear}</p>
              {isCurrentMonth && <p className="text-xs text-muted-foreground">Current month</p>}
            </div>
            <button onClick={goToNextMonth} disabled={isCurrentMonth}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronRight className="h-4 w-4" />
            </button>
            {!isCurrentMonth && (
              <button onClick={() => { setSelectedMonth(now.getMonth()); setSelectedYear(now.getFullYear()); }}
                className="text-xs px-2.5 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium">
                Back to current
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">All Leads</span>
            <span className="text-xs text-muted-foreground">— all time</span>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <select value={filterSourceId} onChange={e => setFilterSourceId(e.target.value)}
            className="text-xs rounded-md border border-border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/40 text-muted-foreground">
            <option value="">All Sources</option>
            {leadSources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <span className="text-sm text-muted-foreground">
            {leads.length} lead{leads.length !== 1 ? "s" : ""}
            {!viewAll && hiddenCount > 0 && (
              <span className="text-amber-500 font-medium"> · {hiddenCount} outside this month</span>
            )}
          </span>
          <span className="text-sm text-muted-foreground">·</span>
          <span className="text-sm font-medium text-emerald-600">${pipelineValue.toLocaleString()} pipeline value</span>
          <button onClick={() => router.push("/leads/import")}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground transition-colors font-medium">
            <Upload className="h-3.5 w-3.5" /> Import CSV
          </button>
          <button onClick={() => setViewAll(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-md border font-medium transition-colors ${viewAll ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted text-muted-foreground"}`}>
            {viewAll ? "Viewing all" : "View all leads"}
          </button>
          <button onClick={() => setShowNewLead(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium">
            <Plus className="h-3.5 w-3.5" /> New Lead
          </button>
        </div>
      </div>

      {/* ── New Lead Quick-Add ── */}
      {showNewLead && (
        <div className="mb-4 rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-primary">Add New Lead</p>
            <button onClick={() => { setShowNewLead(false); setDupWarning(null); }} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          {dupWarning && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-start gap-2">
              <span className="text-amber-600 text-xs font-semibold shrink-0">⚠ Duplicate</span>
              <p className="text-xs text-amber-800 flex-1">
                <span className="font-bold">{dupWarning.name}</span> already exists — stage: <span className="font-bold">{dupWarning.status}</span>
              </p>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => handleCreateNewLead(true)}
                  className="text-xs px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-700">Add Anyway</button>
                <button onClick={() => setDupWarning(null)}
                  className="text-xs px-2 py-1 rounded border border-border hover:bg-muted">Cancel</button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">First Name</label>
              <input value={newLeadForm.first_name} onChange={e => setNewLeadForm({ ...newLeadForm, first_name: e.target.value })}
                placeholder="John" className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Last Name</label>
              <input value={newLeadForm.last_name} onChange={e => setNewLeadForm({ ...newLeadForm, last_name: e.target.value })}
                placeholder="Smith" className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Phone *</label>
              <input value={newLeadForm.phone}
                onChange={e => { setDupWarning(null); setNewLeadForm({ ...newLeadForm, phone: formatPhone(e.target.value) }); }}
                placeholder="(201) 555-0000"
                className={`w-full rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 ${dupWarning ? "border-amber-400" : "border-border"}`} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Source</label>
              <select value={newLeadForm.source_id} onChange={e => setNewLeadForm({ ...newLeadForm, source_id: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                <option value="">— Select —</option>
                {leadSources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Stage</label>
              <select value={newLeadForm.status} onChange={e => setNewLeadForm({ ...newLeadForm, status: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                {PIPELINE_STAGE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Salesperson</label>
              <select value={newLeadForm.salesperson} onChange={e => setNewLeadForm({ ...newLeadForm, salesperson: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                <option value="">— Assign —</option>
                {SALESPERSONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button onClick={() => handleCreateNewLead(false)}
                disabled={savingNewLead || (!newLeadForm.phone && !newLeadForm.first_name)}
                className="w-full flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors">
                {savingNewLead ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {savingNewLead ? "Checking..." : "Save Lead"}
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">* Phone or name required · Duplicate check on save</p>
        </div>
      )}

      {/* ── Sales Pipeline (KanbanColumn — known LeadStatus types) ── */}
      <div className="mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Sales Pipeline</p>
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {SALES_STAGES.map(stage => (
              <KanbanColumn key={stage} status={stage}
                leads={leadsByStage[stage] || []}
                onLeadClick={handleLeadClick}
                onDropLead={handleStageChange as any}
                changeOrderTotals={changeOrderTotals}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ✅ Completed Jobs — SimpleStageColumn with DnD */}
      <div className="mb-2">
        <div className="flex items-center gap-2 mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Completed Jobs</p>
          <StageInfo stage="completed" />
          <span className="text-xs text-muted-foreground">— also visible in Production</span>
        </div>
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            <SimpleStageColumn
              stageLabel="Completed"
              stageValue="completed"
              dotColor="bg-green-500"
              leads={leadsByStage["completed"] || []}
              onLeadClick={handleLeadClick}
              changeOrderTotals={changeOrderTotals}
              onDropLead={handleStageChange}
            />
          </div>
        </div>
      </div>

      {/* ── Dead Leads ── */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Dead Leads</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mb-3">
          {(["cancelled_appointment","no_opportunity","lost","not_qualified"] as const).map(stage => {
            const desc = STAGE_DESCRIPTIONS[stage];
            if (!desc) return null;
            const labels: Record<string, string> = {
              cancelled_appointment: "Cancelled Appt", no_opportunity: "No Opportunity",
              lost: "Lost", not_qualified: "Not Qualified",
            };
            return (
              <div key={stage} className="flex items-start gap-1.5">
                <Info className="h-3 w-3 text-muted-foreground/50 mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{labels[stage]}:</span> {desc}
                </p>
              </div>
            );
          })}
        </div>

        <div className="overflow-x-auto pb-6">
          <div className="flex gap-4 min-w-max">
            {/* Known dead stages → KanbanColumn */}
            {DEAD_STAGES.map(stage => (
              <KanbanColumn key={stage} status={stage}
                leads={leadsByStage[stage] || []}
                onLeadClick={handleLeadClick}
                onDropLead={handleStageChange as any}
                changeOrderTotals={changeOrderTotals}
              />
            ))}
            {/* ✅ No Opportunity → SimpleStageColumn with DnD */}
            <SimpleStageColumn
              stageLabel="No Opportunity"
              stageValue="no_opportunity"
              dotColor="bg-slate-400"
              leads={leadsByStage["no_opportunity"] || []}
              onLeadClick={handleLeadClick}
              changeOrderTotals={changeOrderTotals}
              onDropLead={handleStageChange}
            />
          </div>
        </div>
      </div>

      <LeadDetailDialog
        lead={selectedLead}
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) fetchLeads(); }}
        onStageChange={handleStageChange as any}
        onLeadUpdated={(leadId) => fetchSingleLead(leadId)}
        onLeadDeleted={() => { setDialogOpen(false); fetchLeads(); }}
      />
    </>
  );
}