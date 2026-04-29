"use client";

import { useState } from "react";
import { mockLeads } from "@/lib/mock-data";
import { Lead, LeadStatus } from "@/types";
import KanbanColumn from "@/components/leads/KanbanColumn";
import LeadDetailDialog from "@/components/leads/LeadDetailDialog";
import { ScrollArea } from "@/components/ui/scroll-area";

const STAGES: LeadStatus[] = [
  "new",
  "contacted",
  "appointment_set",
  "estimate_sent",
  "closed_won",
  "closed_lost",
];

export default function LeadsPage() {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleLeadClick = (lead: Lead) => {
    setSelectedLead(lead);
    setDialogOpen(true);
  };

  const leadsByStage = STAGES.reduce<Record<LeadStatus, Lead[]>>(
    (acc, stage) => {
      acc[stage] = mockLeads.filter((l) => l.status === stage);
      return acc;
    },
    {} as Record<LeadStatus, Lead[]>
  );

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {mockLeads.length} total leads
          </span>
          <span className="text-sm text-muted-foreground">·</span>
          <span className="text-sm font-medium text-emerald-600">
            ${mockLeads.reduce((s, l) => s + l.value, 0).toLocaleString()} pipeline value
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
        onOpenChange={setDialogOpen}
      />
    </>
  );
}
