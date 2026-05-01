"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Lead, LeadStatus } from "@/types";
import KanbanColumn from "@/components/leads/KanbanColumn";
import LeadDetailDialog from "@/components/leads/LeadDetailDialog";

const SALES_STAGES: LeadStatus[] = [
  "new",
  "contacted",
  "appointment_set",
  "estimate_sent",
  "closed_won",
];

const DEAD_STAGES: LeadStatus[] = [
  "cancelled_appointment",
  "lost",
  "not_qualified",
];

const ALL_STAGES = [...SALES_STAGES, ...DEAD_STAGES];

function normalizeStatus(raw: string): LeadStatus {
  const map: Record<string, LeadStatus> = {
    open: "new",
    new: "new",
    won: "closed_won",
    lost: "lost",
    contacted: "contacted",
    appointment_set: "appointment_set",
    estimate_sent: "estimate_sent",
    closed_won: "closed_won",
    closed_lost: "cancelled_appointment",
    cancelled_appointment: "cancelled_appointment",
    not_qualified: "not_qualified",
  };
  return map[raw] ?? "new";
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function fetchLeads() {
    const { data, error } = await supabase
      .from("leads")
      .select("*, lead_sources(name)")
      .neq("archived", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching leads:", error.message);
      return;
    }

    const normalizedLeads = (data || []).map((lead: any) => ({
      ...lead,
      status: normalizeStatus(lead.status ?? "new"),
    }));

    setLeads(normalizedLeads as Lead[]);
  }

  async function fetchSingleLead(leadId: string) {
    const { data, error } = await supabase
      .from("leads")
      .select("*, lead_sources(name)")
      .eq("id", leadId)
      .single();

    if (error) {
      console.error("Error fetching lead:", error.message);
      return;
    }

    if (data) {
      const normalized = {
        ...data,
        status: normalizeStatus(data.status ?? "new"),
      };
      setSelectedLead(normalized as Lead);
      setLeads((prev) =>
        prev.map((l) => (l as any).id === leadId ? normalized as Lead : l)
      );
    }
  }

  useEffect(() => {
    fetchLeads();

    const channel = supabase
      .channel("leads-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
        fetchLeads();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleLeadClick = (lead: Lead) => {
    setSelectedLead(lead);
    setDialogOpen(true);
  };

  const handleStageChange = async (leadId: string, newStatus: LeadStatus) => {
    setLeads((prev) =>
      prev.map((l) => (l as any).id === leadId ? { ...l, status: newStatus } : l)
    );

    const { error } = await supabase
      .from("leads")
      .update({ status: newStatus })
      .eq("id", leadId);

    if (error) {
      console.error("Failed to update lead status:", error.message);
      fetchLeads();
    }
  };

  const leadsByStage = ALL_STAGES.reduce<Record<LeadStatus, Lead[]>>(
    (acc, stage) => {
      acc[stage] = leads.filter((lead) => lead.status === stage);
      return acc;
    },
    {} as Record<LeadStatus, Lead[]>
  );

  const pipelineValue = leads
    .filter((l) => SALES_STAGES.includes(l.status as LeadStatus))
    .reduce((sum, lead: any) => {
      return sum + Number(lead.estimated_amount || lead.closed_amount || lead.initial_contract_value || 0);
    }, 0);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{leads.length} total leads</span>
          <span className="text-sm text-muted-foreground">·</span>
          <span className="text-sm font-medium text-emerald-600">
            ${pipelineValue.toLocaleString()} pipeline value
          </span>
        </div>
      </div>

      {/* Sales Pipeline */}
      <div className="mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Sales Pipeline
        </p>
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {SALES_STAGES.map((stage) => (
              <KanbanColumn
                key={stage}
                status={stage}
                leads={leadsByStage[stage]}
                onLeadClick={handleLeadClick}
                onDropLead={handleStageChange}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Dead Leads */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Dead Leads
        </p>
        <div className="overflow-x-auto pb-6">
          <div className="flex gap-4 min-w-max">
            {DEAD_STAGES.map((stage) => (
              <KanbanColumn
                key={stage}
                status={stage}
                leads={leadsByStage[stage]}
                onLeadClick={handleLeadClick}
                onDropLead={handleStageChange}
              />
            ))}
          </div>
        </div>
      </div>

      <LeadDetailDialog
        lead={selectedLead}
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) fetchLeads();
        }}
        onStageChange={handleStageChange}
        onLeadUpdated={(leadId) => fetchSingleLead(leadId)}
      />
    </>
  );
}