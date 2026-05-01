"use client";

import { Lead, LeadStatus } from "@/types";
import LeadCard from "./LeadCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";

const columnConfig: Record<LeadStatus, { label: string; dot: string }> = {
  new: { label: "New Lead", dot: "bg-blue-500" },
  contacted: { label: "Qualified", dot: "bg-indigo-500" },
  appointment_set: { label: "Appointment Set", dot: "bg-violet-500" },
  estimate_sent: { label: "Estimate Sent", dot: "bg-amber-500" },
  closed_won: { label: "Closed Won", dot: "bg-emerald-500" },
  cancelled_appointment: { label: "Cancelled Appt", dot: "bg-orange-400" },
  lost: { label: "Lost", dot: "bg-red-500" },
  not_qualified: { label: "Not Qualified", dot: "bg-gray-400" },
};

interface KanbanColumnProps {
  status: LeadStatus;
  leads: Lead[];
  onLeadClick?: (lead: Lead) => void;
  onDropLead?: (leadId: string, newStatus: LeadStatus) => void;
}

export default function KanbanColumn({ status, leads, onLeadClick, onDropLead }: KanbanColumnProps) {
  const config = columnConfig[status];
  const [isDragOver, setIsDragOver] = useState(false);

  const totalValue = leads.reduce(
    (sum, lead: any) => sum + Number(lead.estimated_amount || lead.closed_amount || lead.initial_contract_value || 0),
    0
  );

  return (
    <div
      className={`flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30 transition-colors ${isDragOver ? "border-primary/50 bg-primary/5" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const leadId = e.dataTransfer.getData("leadId");
        if (leadId && onDropLead) onDropLead(leadId, status);
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background/60 rounded-t-xl">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${config.dot}`} />
          <span className="text-sm font-semibold">{config.label}</span>
        </div>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {leads.length}
        </span>
      </div>

      {leads.length > 0 && (
        <div className="px-4 py-2 text-xs text-muted-foreground border-b bg-background/40">
          Total: <span className="font-semibold text-foreground">${totalValue.toLocaleString()}</span>
        </div>
      )}

      <ScrollArea className="flex-1 max-h-[calc(100vh-320px)]">
        <div className="space-y-2.5 p-3">
          {leads.length === 0 ? (
            <div className={`flex items-center justify-center py-8 text-sm transition-colors ${isDragOver ? "text-primary/60" : "text-muted-foreground/50"}`}>
              {isDragOver ? "Drop here" : "No leads"}
            </div>
          ) : (
            leads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onClick={() => onLeadClick?.(lead)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}