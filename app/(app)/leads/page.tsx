"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Lead, LeadStatus } from "@/types";
import KanbanColumn from "@/components/leads/KanbanColumn";
import LeadDetailDialog from "@/components/leads/LeadDetailDialog";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MONTH_NAMES = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];

const SALES_STAGES: LeadStatus[] = ["new","contacted","appointment_set","estimate_sent","closed_won"];
const DEAD_STAGES: LeadStatus[] = ["cancelled_appointment","lost","not_qualified"];
const ALL_STAGES = [...SALES_STAGES, ...DEAD_STAGES];

function normalizeStatus(raw: string): LeadStatus {
  const map: Record<string, LeadStatus> = {
    open: "new", new: "new", won: "closed_won", lost: "lost",
    contacted: "contacted", appointment_set: "appointment_set",
    estimate_sent: "estimate_sent", closed_won: "closed_won",
    closed_lost: "cancelled_appointment", cancelled_appointment: "cancelled_appointment",
    not_qualified: "not_qualified",
  };
  return map[raw] ?? "new";
}

export default function LeadsPage() {
  const now = new Date();
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [changeOrderTotals, setChangeOrderTotals] = useState<Record<string, number>>({});
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [viewAll, setViewAll] = useState(false);

  const isCurrentMonth = selectedMonth === now.getMonth() && selectedYear === now.getFullYear();

  function goToPrevMonth() {
    if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1); }
    else setSelectedMonth(m => m - 1);
  }
  function goToNextMonth() {
    const nextMonth = selectedMonth === 11 ? 0 : selectedMonth + 1;
    const nextYear = selectedMonth === 11 ? selectedYear + 1 : selectedYear;
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

    // Fetch won change order totals for closed_won leads
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

  useEffect(() => {
    fetchLeads();
    const channel = supabase
      .channel("leads-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchLeads())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Filter by month unless viewAll is on
  const monthStart = new Date(selectedYear, selectedMonth, 1);
  const monthEnd = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);

  const leads = viewAll
    ? allLeads
    : allLeads.filter((lead: any) => {
        const received = new Date(lead.lead_received_at || lead.created_at);
        return received >= monthStart && received <= monthEnd;
      });

  const handleLeadClick = (lead: Lead) => { setSelectedLead(lead); setDialogOpen(true); };

  const handleStageChange = async (leadId: string, newStatus: LeadStatus) => {
    // Update locally across ALL leads regardless of month filter
    setAllLeads(prev => prev.map(l => (l as any).id === leadId ? { ...l, status: newStatus } : l));
    const { error } = await supabase.from("leads").update({ status: newStatus }).eq("id", leadId);
    if (error) { console.error("Failed to update lead status:", error.message); fetchLeads(); }
  };

  const leadsByStage = ALL_STAGES.reduce<Record<LeadStatus, Lead[]>>(
    (acc, stage) => {
      acc[stage] = leads.filter(lead => lead.status === stage);
      return acc;
    },
    {} as Record<LeadStatus, Lead[]>
  );

  const pipelineValue = leads
    .filter(l => SALES_STAGES.includes(l.status as LeadStatus))
    .reduce((sum, lead: any) => {
      const initial = Number(lead.estimated_amount || lead.initial_contract_value || 0);
      const coTotal = changeOrderTotals[(lead as any).id] || 0;
      return sum + initial + coTotal;
    }, 0);

  const hiddenLeadsCount = allLeads.length - leads.length;

  return (
    <>
      {/* Header row */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">

        {/* Month selector — hidden when viewAll is on */}
        {!viewAll ? (
          <div className="flex items-center gap-3">
            <button onClick={goToPrevMonth} className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-center min-w-[150px]">
              <p className="font-semibold text-sm">{MONTH_NAMES[selectedMonth]} {selectedYear}</p>
              {isCurrentMonth && <p className="text-xs text-muted-foreground">Current month</p>}
            </div>
            <button
              onClick={goToNextMonth}
              disabled={isCurrentMonth}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
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

        {/* Right side: stats + view all toggle */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {leads.length} lead{leads.length !== 1 ? "s" : ""}
            {!viewAll && hiddenLeadsCount > 0 && (
              <span className="text-amber-500 font-medium"> · {hiddenLeadsCount} outside this month</span>
            )}
          </span>
          <span className="text-sm text-muted-foreground">·</span>
          <span className="text-sm font-medium text-emerald-600">${pipelineValue.toLocaleString()} pipeline value</span>
          <button
            onClick={() => setViewAll(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-md border font-medium transition-colors ${
              viewAll
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border hover:bg-muted text-muted-foreground"
            }`}
          >
            {viewAll ? "Viewing all" : "View all leads"}
          </button>
        </div>
      </div>

      {/* Sales Pipeline */}
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

      {/* Dead Leads */}
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