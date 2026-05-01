"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Lead, LeadStatus } from "@/types";
import KanbanColumn from "@/components/leads/KanbanColumn";
import LeadDetailDialog from "@/components/leads/LeadDetailDialog";

const STAGES: LeadStatus[] = [
  "new",
  "contacted",
  "appointment_set",
  "estimate_sent",
  "closed_won",
  "closed_lost",
];

const STAGE_LABELS: Record<LeadStatus, string> = {
  new: "New Lead",
  contacted: "Qualified",
  appointment_set: "Appointment Set",
  estimate_sent: "Estimate Sent",
  closed_won: "Closed Won",
  closed_lost: "Cancelled",
};

function normalizeStatus(lead: any): LeadStatus {
  if (lead.status === "open") return "new";
  if (lead.status === "new") return "new";
  if (lead.status === "won") return "closed_won";
  if (lead.status === "lost") return "closed_lost";
  if (lead.status === "contacted") return "contacted";
  if (lead.status === "appointment_set") return "appointment_set";
  if (lead.status === "estimate_sent") return "estimate_sent";
  if (lead.status === "closed_won") return "closed_won";
  if (lead.status === "closed_lost") return "closed_lost";
  return "new";
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function fetchLeads() {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching leads:", error.message);
      return;
    }

    const normalizedLeads = (data || []).map((lead: any) => ({
      ...lead,
      status: normalizeStatus(lead),
    }));

    setLeads(normalizedLeads as Lead[]);
  }

  useEffect(() => {
    fetchLeads();
  }, []);

  const handleLeadClick = (lead: Lead) => {
    setSelectedLead(lead);
    setDialogOpen(true);
  };

  const handleStageChange = async (leadId: string, newStatus: LeadStatus) => {
    await supabase
      .from("leads")
      .update({ status: newStatus })
      .eq("id", leadId);
    await fetchLeads();
  };

  const leadsByStage = STAGES.reduce<Record<LeadStatus, Lead[]>>(
    (acc, stage) => {
      acc[stage] = leads.filter((lead) => lead.status === stage);
      return acc;
    },
    {} as Record<LeadStatus, Lead[]>
  );

  const pipelineValue = leads.reduce((sum, lead: any) => {
    return sum + Number(
      lead.estimated_amount ||
      lead.closed_amount ||
      lead.initial_contract_value ||
      0
    );
  }, 0);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {leads.length} total leads
          </span>
          <span className="text-sm text-muted-foreground">·</span>
          <span className="text-sm font-medium text-emerald-600">
            ${pipelineValue.toLocaleString()} pipeline value
          </span>
        </div>
      </div>

      <div className="overflow-x-auto pb-6">
        <div className="flex gap-4 min-w-max">
          {STAGES.map((stage) => (
            <KanbanColumn
              key={stage}
              status={stage}
              leads={leadsByStage[stage]}
              onLeadClick={handleLeadClick}
            />
          ))}
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
      />
    </>
  );
}