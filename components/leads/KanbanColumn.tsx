import { Lead, LeadStatus } from "@/types";
import LeadCard from "./LeadCard";
import { ScrollArea } from "@/components/ui/scroll-area";

const columnConfig: Record<LeadStatus, { label: string; color: string; dot: string }> = {
  new: { label: "New Lead", color: "bg-blue-50 border-blue-200", dot: "bg-blue-500" },
  contacted: { label: "Contacted", color: "bg-indigo-50 border-indigo-200", dot: "bg-indigo-500" },
  appointment_set: { label: "Appointment Set", color: "bg-violet-50 border-violet-200", dot: "bg-violet-500" },
  estimate_sent: { label: "Estimate Sent", color: "bg-amber-50 border-amber-200", dot: "bg-amber-500" },
  closed_won: { label: "Closed Won", color: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
  closed_lost: { label: "Closed Lost", color: "bg-red-50 border-red-200", dot: "bg-red-400" },
};

interface KanbanColumnProps {
  status: LeadStatus;
  leads: Lead[];
  onLeadClick?: (lead: Lead) => void;
}

export default function KanbanColumn({ status, leads, onLeadClick }: KanbanColumnProps) {
  const config = columnConfig[status];

  const totalValue = leads.reduce(
    (sum, lead: any) =>
      sum + Number(lead.estimated_amount || lead.closed_amount || lead.initial_contract_value || 0),
    0
  );

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30">
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
          Total:{" "}
          <span className="font-semibold text-foreground">
            ${totalValue.toLocaleString()}
          </span>
        </div>
      )}

      <ScrollArea className="flex-1 max-h-[calc(100vh-280px)]">
        <div className="space-y-2.5 p-3">
          {leads.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground/50">
              No leads
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