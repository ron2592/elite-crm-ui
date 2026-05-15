"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Lead, LeadStatus } from "@/types";
import KanbanColumn from "@/components/leads/KanbanColumn";
import LeadDetailDialog from "@/components/leads/LeadDetailDialog";
import { ChevronLeft, ChevronRight, Upload, Plus, Save, X, Loader2, Info } from "lucide-react";

const MONTH_NAMES = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

// ── Stage definitions ──────────────────────────────────────────────────────────
const SALES_STAGES    = ["new","contacted","appointment_set","estimate_sent","closed_won"] as const;
const COMPLETED_STAGES = ["completed"] as const;          // ✅ NEW — shows in Production
const DEAD_STAGES     = ["cancelled_appointment","no_opportunity","lost","not_qualified"] as const;
const ALL_STAGES      = [...SALES_STAGES, ...COMPLETED_STAGES, ...DEAD_STAGES] as const;

// ✅ Stage descriptions shown as tooltips on column headers
const STAGE_DESCRIPTIONS: Record<string, string> = {
  completed:        "Job is done. Lead also appears in Production tracker.",
  no_opportunity:   "Had appointment or quote — not motivated to move forward. Worth following up later.",
  lost:             "We quoted but never won the job. Price, timing, or competitor.",
  not_qualified:    "Services we don't offer, wrong number, spam, or just looking for a job.",
  cancelled_appointment: "Appointment was set but cancelled — client may reschedule.",
};

// ✅ Pipeline stage options for the New Lead quick-add form
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

const SALESPERSONS = ["Ron", "Ray", "Other (Phone)"];

function normalizeStatus(raw: string): string {
  const map: Record<string, string> = {
    open:                    "new",
    new:                     "new",
    new_lead:                "new",
    won:                     "closed_won",
    lost:                    "lost",
    contacted:               "contacted",
    appointment_set:         "appointment_set",
    estimate_sent:           "estimate_sent",
    closed_won:              "closed_won",
    completed:               "completed",           // ✅ NEW
    closed_lost:             "cancelled_appointment",
    cancelled_appointment:   "cancelled_appointment",
    not_qualified:           "not_qualified",
    no_opportunity:          "no_opportunity",      // ✅ NEW
  };
  return map[raw] ?? "new";
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
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

  // ✅ Source filter (applies in both month and view-all modes)
  const [filterSourceId,    setFilterSourceId]    = useState("");
  const [leadSources,       setLeadSources]       = useState<{ id: string; name: string }[]>([]);

  // ── New Lead quick-add ──
  const [showNewLead,   setShowNewLead]   = useState(false);
  const [newLeadForm,   setNewLeadForm]   = useState({
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

    if (error) { console.error("Error fetching leads:", error.message); return; }

    const normalized = (data || []).map((l: any) => ({
      ...l, status: normalizeStatus(l.status ?? "new"),
    }));
    setAllLeads(normalized as Lead[]);

    const closedIds = normalized
      .filter((l: any) => ["closed_won","completed"].includes(l.status))
      .map((l: any) => l.id);

    if (closedIds.length > 0) {
      const { data: cos } = await supabase
        .from("change_orders").select("lead_id, amount")
        .eq("status", "won").in("lead_id", closedIds);
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

    // ✅ Dedup check before inline save
    if (newLeadForm.phone && !force) {
      const digits = newLeadForm.phone.replace(/\D/g, "");
      const { data: existing } = await supabase
        .from("leads").select("id, lead_name, status")
        .or(`phone.ilike.%${digits}%,phone.ilike.%${newLeadForm.phone}%`)
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
      archived:               false,
      bad_lead:               false,
      initial_contract_value: 0,
      metadata: {
        salesperson: newLeadForm.salesperson || null,
        notes:       newLeadForm.notes       || null,
      },
    });

    setSavingNewLead(false);
    if (!error) {
      setShowNewLead(false);
      setDupWarning(null);
      setNewLeadForm({ first_name: "", last_name: "", phone: "", email: "", source_id: "", salesperson: "", notes: "", status: "new" });
      fetchLeads();
    } else {
      alert("Error creating lead: " + error.message);
    }
  }

  useEffect(() => {
    fetchLeads();
    fetchLeadSources();
    const channel = supabase
      .channel("leads-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchLeads())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Filter leads ──────────────────────────────────────────────────────────────
  const monthStart = new Date(selectedYear, selectedMonth, 1);
  const monthEnd   = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);

  const leads = allLeads
    .filter((lead: any) => {
      if (!viewAll) {
        const received = new Date(lead.created_at);
        if (received < monthStart || received > monthEnd) return false;
      }
      if (filterSourceId && (lead as any).source_id !== filterSourceId) return false;
      return true;
    });

  const handleLeadClick   = (lead: Lead) => { setSelectedLead(lead); setDialogOpen(true); };
  const handleStageChange = async (leadId: string, newStatus: string) => {
    setAllLeads(prev => prev.map(l => (l as any).id === leadId ? { ...l, status: newStatus } : l));
    await supabase.from("leads").update({ status: newStatus }).eq("id", leadId);
  };

  const leadsByStage = ALL_STAGES.reduce<Record<string, Lead[]>>(
    (acc, stage) => { acc[stage] = leads.filter(l => l.status === stage); return acc; },
    {} as Record<string, Lead[]>
  );

  const pipelineValue = leads
    .filter(l => [...SALES_STAGES, ...COMPLETED_STAGES].includes(l.status as any))
    .reduce((sum, l: any) => {
      return sum + Number(l.estimated_amount || l.initial_contract_value || 0) + (changeOrderTotals[(l as any).id] || 0);
    }, 0);

  const hiddenCount = allLeads.length - leads.length;

  // ── Stage description tooltip ─────────────────────────────────────────────────
  const StageInfo = ({ stage }: { stage: string }) => {
    const desc = STAGE_DESCRIPTIONS[stage];
    if (!desc) return null;
    return (
      <span className="relative group ml-1">
        <Info className="h-3 w-3 text-muted-foreground/50 inline cursor-help" />
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-56 rounded-md bg-foreground text-background text-xs p-2 hidden group-hover:block z-50 shadow-lg">
          {desc}
        </span>
      </span>
    );
  };

  return (
    <>
      {/* ── Header ── */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        {/* Left: month selector or "All Leads" */}
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

        {/* Right: source filter + stats + actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* ✅ Source filter — always visible */}
          <select
            value={filterSourceId}
            onChange={e => setFilterSourceId(e.target.value)}
            className="text-xs rounded-md border border-border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/40 text-muted-foreground"
          >
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
            className={`text-xs px-3 py-1.5 rounded-md border font-medium transition-colors ${
              viewAll ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted text-muted-foreground"
            }`}>
            {viewAll ? "Viewing all" : "View all leads"}
          </button>

          <button onClick={() => setShowNewLead(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium">
            <Plus className="h-3.5 w-3.5" /> New Lead
          </button>
        </div>
      </div>

      {/* ── New Lead Quick-Add Form ── */}
      {showNewLead && (
        <div className="mb-4 rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-primary">Add New Lead</p>
            <button onClick={() => { setShowNewLead(false); setDupWarning(null); }} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* ✅ Duplicate warning */}
          {dupWarning && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-start gap-2">
              <span className="text-amber-600 text-xs font-semibold shrink-0">⚠ Duplicate</span>
              <div className="flex-1">
                <p className="text-xs text-amber-800">
                  Lead <span className="font-bold">{dupWarning.name}</span> already exists with status <span className="font-bold">{dupWarning.status}</span>.
                </p>
              </div>
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
            {/* ✅ Pipeline stage selector */}
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
          <p className="text-xs text-muted-foreground">* Phone or name required · Duplicate check runs on save</p>
        </div>
      )}

      {/* ── Sales Pipeline ── */}
      <div className="mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Sales Pipeline</p>
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {SALES_STAGES.map(stage => (
              <KanbanColumn key={stage} status={stage as LeadStatus}
                leads={leadsByStage[stage] || []}
                onLeadClick={handleLeadClick}
                onDropLead={handleStageChange as any}
                changeOrderTotals={changeOrderTotals}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ✅ Completed Jobs — new section */}
      <div className="mb-2">
        <div className="flex items-center gap-2 mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Completed Jobs</p>
          <StageInfo stage="completed" />
          <span className="text-xs text-muted-foreground">— also visible in Production</span>
        </div>
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {COMPLETED_STAGES.map(stage => (
              <KanbanColumn key={stage} status={stage as LeadStatus}
                leads={leadsByStage[stage] || []}
                onLeadClick={handleLeadClick}
                onDropLead={handleStageChange as any}
                changeOrderTotals={changeOrderTotals}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Dead Leads ── */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Dead Leads</p>

        {/* Stage legend */}
        <div className="flex flex-wrap gap-4 mb-3">
          {(["cancelled_appointment","no_opportunity","lost","not_qualified"] as const).map(stage => {
            const desc = STAGE_DESCRIPTIONS[stage];
            if (!desc) return null;
            return (
              <div key={stage} className="flex items-start gap-1.5">
                <Info className="h-3 w-3 text-muted-foreground/50 mt-0.5 shrink-0" />
                <div>
                  <span className="text-xs font-semibold text-foreground capitalize">
                    {stage === "cancelled_appointment" ? "Cancelled Appt"
                     : stage === "no_opportunity" ? "No Opportunity"
                     : stage.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}:
                  </span>
                  <span className="text-xs text-muted-foreground ml-1">{desc}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="overflow-x-auto pb-6">
          <div className="flex gap-4 min-w-max">
            {DEAD_STAGES.map(stage => (
              <KanbanColumn key={stage} status={stage as LeadStatus}
                leads={leadsByStage[stage] || []}
                onLeadClick={handleLeadClick}
                onDropLead={handleStageChange as any}
                changeOrderTotals={changeOrderTotals}
              />
            ))}
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