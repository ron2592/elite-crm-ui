"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Lead, LeadStatus } from "@/types";
import KanbanColumn from "@/components/leads/KanbanColumn";
import LeadDetailDialog from "@/components/leads/LeadDetailDialog";
import { ChevronLeft, ChevronRight, Upload, Plus, Save, X, Loader2 } from "lucide-react";

const MONTH_NAMES = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

const SALES_STAGES: LeadStatus[] = ["new","contacted","appointment_set","estimate_sent","closed_won"];
const DEAD_STAGES: LeadStatus[] = ["cancelled_appointment","lost","not_qualified"];
const ALL_STAGES = [...SALES_STAGES, ...DEAD_STAGES];

const SALESPERSONS = ["Ron", "Ray", "Other (Phone)"];

function normalizeStatus(raw: string): LeadStatus {
  const map: Record<string, LeadStatus> = {
    open: "new", new: "new", won: "closed_won", lost: "lost",
    new_lead: "new",
    contacted: "contacted", appointment_set: "appointment_set",
    estimate_sent: "estimate_sent", closed_won: "closed_won",
    closed_lost: "cancelled_appointment", cancelled_appointment: "cancelled_appointment",
    not_qualified: "not_qualified",
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
  const now = new Date();
  const router = useRouter();
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [changeOrderTotals, setChangeOrderTotals] = useState<Record<string, number>>({});
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [viewAll, setViewAll] = useState(false);

  // ── New Lead dialog state ──
  const [showNewLead, setShowNewLead] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({
    first_name: "", last_name: "", phone: "", email: "",
    source_id: "", salesperson: "", notes: "",
  });
  const [savingNewLead, setSavingNewLead] = useState(false);
  const [leadSources, setLeadSources] = useState<{ id: string; name: string }[]>([]);

  const isCurrentMonth = selectedMonth === now.getMonth() && selectedYear === now.getFullYear();

  function goToPrevMonth() {
    if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1); }
    else setSelectedMonth(m => m - 1);
  }
  function goToNextMonth() {
    const nextMonth = selectedMonth === 11 ? 0 : selectedMonth + 1;
    const nextYear  = selectedMonth === 11 ? selectedYear + 1 : selectedYear;
    if (nextYear > now.getFullYear() || (nextYear === now.getFullYear() && nextMonth > now.getMonth())) return;
    setSelectedMonth(nextMonth);
    setSelectedYear(nextYear);
  }

  async function fetchLeads() {
    const { data, error } = await supabase
      .from("leads")
      .select("*, lead_sources(name)")
      .neq("archived", true)
      .order("created_at", { ascending: false });

    if (error) { console.error("Error fetching leads:", error.message); return; }

    const normalizedLeads = (data || []).map((lead: any) => ({
      ...lead,
      status: normalizeStatus(lead.status ?? "new"),
    }));
    setAllLeads(normalizedLeads as Lead[]);

    const closedWonIds = normalizedLeads
      .filter((l: any) => l.status === "closed_won")
      .map((l: any) => l.id);

    if (closedWonIds.length > 0) {
      const { data: cos } = await supabase
        .from("change_orders")
        .select("lead_id, amount")
        .eq("status", "won")
        .in("lead_id", closedWonIds);

      const totals: Record<string, number> = {};
      (cos || []).forEach((co: any) => {
        totals[co.lead_id] = (totals[co.lead_id] || 0) + Number(co.amount);
      });
      setChangeOrderTotals(totals);
    }
  }

  async function fetchLeadSources() {
    const { data } = await supabase.from("lead_sources").select("id, name").order("name");
    setLeadSources(data || []);
  }

  async function fetchSingleLead(leadId: string) {
    const { data, error } = await supabase
      .from("leads")
      .select("*, lead_sources(name)")
      .eq("id", leadId)
      .single();

    if (error) { console.error("Error fetching lead:", error.message); return; }

    if (data) {
      const normalized = { ...data, status: normalizeStatus(data.status ?? "new") };
      setSelectedLead(normalized as Lead);
      setAllLeads(prev => prev.map(l => (l as any).id === leadId ? normalized as Lead : l));
    }
  }

  // ── Create new lead ──
  async function handleCreateNewLead() {
    if (!newLeadForm.phone && !newLeadForm.first_name) return;
    setSavingNewLead(true);

    const fullName = `${newLeadForm.first_name} ${newLeadForm.last_name}`.trim();
    const { error } = await supabase.from("leads").insert({
      lead_name: fullName || newLeadForm.phone || "New Lead",
      phone: newLeadForm.phone || null,
      email: newLeadForm.email || null,
      source_id: newLeadForm.source_id || null,
      status: "new",
      archived: false,
      bad_lead: false,
      initial_contract_value: 0,
      metadata: {
        salesperson: newLeadForm.salesperson || null,
        notes: newLeadForm.notes || null,
      },
    });

    setSavingNewLead(false);
    if (!error) {
      setShowNewLead(false);
      setNewLeadForm({ first_name: "", last_name: "", phone: "", email: "", source_id: "", salesperson: "", notes: "" });
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

  // Filter by month using created_at
  const monthStart = new Date(selectedYear, selectedMonth, 1);
  const monthEnd   = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);

  const leads = viewAll
    ? allLeads
    : allLeads.filter((lead: any) => {
        const received = new Date(lead.created_at);
        return received >= monthStart && received <= monthEnd;
      });

  const handleLeadClick    = (lead: Lead) => { setSelectedLead(lead); setDialogOpen(true); };
  const handleStageChange  = async (leadId: string, newStatus: LeadStatus) => {
    setAllLeads(prev => prev.map(l => (l as any).id === leadId ? { ...l, status: newStatus } : l));
    const { error } = await supabase.from("leads").update({ status: newStatus }).eq("id", leadId);
    if (error) { console.error("Failed to update lead status:", error.message); fetchLeads(); }
  };

  const leadsByStage = ALL_STAGES.reduce<Record<LeadStatus, Lead[]>>(
    (acc, stage) => { acc[stage] = leads.filter(lead => lead.status === stage); return acc; },
    {} as Record<LeadStatus, Lead[]>
  );

  const pipelineValue = leads
    .filter(l => SALES_STAGES.includes(l.status as LeadStatus))
    .reduce((sum, lead: any) => {
      const initial  = Number(lead.estimated_amount || lead.initial_contract_value || 0);
      const coTotal  = changeOrderTotals[(lead as any).id] || 0;
      return sum + initial + coTotal;
    }, 0);

  const hiddenLeadsCount = allLeads.length - leads.length;

  return (
    <>
      {/* ── Header ── */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">

        {/* Left: month selector */}
        {!viewAll ? (
          <div className="flex items-center gap-3">
            <button onClick={goToPrevMonth}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted transition-colors">
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

        {/* Right: stats + actions */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {leads.length} lead{leads.length !== 1 ? "s" : ""}
            {!viewAll && hiddenLeadsCount > 0 && (
              <span className="text-amber-500 font-medium"> · {hiddenLeadsCount} outside this month</span>
            )}
          </span>
          <span className="text-sm text-muted-foreground">·</span>
          <span className="text-sm font-medium text-emerald-600">
            ${pipelineValue.toLocaleString()} pipeline value
          </span>

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

          {/* ✅ + New Lead button */}
          <button onClick={() => setShowNewLead(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium">
            <Plus className="h-3.5 w-3.5" /> New Lead
          </button>
        </div>
      </div>

      {/* ── New Lead Quick-Add Form ── */}
      {showNewLead && (
        <div className="mb-4 rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-primary">Add New Lead</p>
            <button onClick={() => setShowNewLead(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">First Name</label>
              <input value={newLeadForm.first_name}
                onChange={e => setNewLeadForm({ ...newLeadForm, first_name: e.target.value })}
                placeholder="John"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Last Name</label>
              <input value={newLeadForm.last_name}
                onChange={e => setNewLeadForm({ ...newLeadForm, last_name: e.target.value })}
                placeholder="Smith"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Phone *</label>
              <input value={newLeadForm.phone}
                onChange={e => setNewLeadForm({ ...newLeadForm, phone: formatPhone(e.target.value) })}
                placeholder="(201) 555-0000"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Source</label>
              <select value={newLeadForm.source_id}
                onChange={e => setNewLeadForm({ ...newLeadForm, source_id: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                <option value="">— Select —</option>
                {leadSources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Salesperson</label>
              <select value={newLeadForm.salesperson}
                onChange={e => setNewLeadForm({ ...newLeadForm, salesperson: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                <option value="">— Assign —</option>
                {SALESPERSONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button onClick={handleCreateNewLead}
                disabled={savingNewLead || (!newLeadForm.phone && !newLeadForm.first_name)}
                className="w-full flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors">
                {savingNewLead ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {savingNewLead ? "Saving..." : "Save Lead"}
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">* Phone or name required</p>
        </div>
      )}

      {/* ── Sales Pipeline ── */}
      <div className="mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Sales Pipeline</p>
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {SALES_STAGES.map((stage) => (
              <KanbanColumn
                key={stage}
                status={stage}
                leads={leadsByStage[stage]}
                onLeadClick={handleLeadClick}
                onDropLead={handleStageChange}
                changeOrderTotals={changeOrderTotals}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Dead Leads ── */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Dead Leads</p>
        <div className="overflow-x-auto pb-6">
          <div className="flex gap-4 min-w-max">
            {DEAD_STAGES.map((stage) => (
              <KanbanColumn
                key={stage}
                status={stage}
                leads={leadsByStage[stage]}
                onLeadClick={handleLeadClick}
                onDropLead={handleStageChange}
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
        onStageChange={handleStageChange}
        onLeadUpdated={(leadId) => fetchSingleLead(leadId)}
        onLeadDeleted={() => { setDialogOpen(false); fetchLeads(); }}
      />
    </>
  );
}