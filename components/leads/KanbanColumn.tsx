"use client";

import { Lead, LeadStatus } from "@/types";
import LeadCard from "./LeadCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

const columnConfig: Record<LeadStatus, { label: string; dot: string }> = {
  new:                   { label: "New Lead",        dot: "bg-blue-500" },
  contacted:             { label: "Qualified",        dot: "bg-indigo-500" },
  appointment_set:       { label: "Appointment Set", dot: "bg-violet-500" },
  estimate_sent:         { label: "Estimate Sent",   dot: "bg-amber-500" },
  closed_won:            { label: "Closed Won",      dot: "bg-emerald-500" },
  cancelled_appointment: { label: "Cancelled Appt",  dot: "bg-orange-400" },
  lost:                  { label: "Lost",             dot: "bg-red-500" },
  not_qualified:         { label: "Not Qualified",   dot: "bg-gray-400" },
};

// How many days in a stage before the badge turns red (urgent)
const STAGE_THRESHOLDS: Partial<Record<LeadStatus, number>> = {
  new:             1,   // New leads should be contacted within 1 day
  contacted:       3,   // Qualified leads should get appointment within 3 days
  appointment_set: 5,   // Appointment should happen within 5 days
  estimate_sent:   7,   // Estimate should close within 7 days
};

interface KanbanColumnProps {
  status: LeadStatus;
  leads: Lead[];
  onLeadClick?: (lead: Lead) => void;
  onDropLead?: (leadId: string, newStatus: LeadStatus) => void;
  changeOrderTotals?: Record<string, number>;
  // Optional: pass pre-fetched stage dates from parent to avoid per-column queries
  stageEnteredDates?: Record<string, string>;
}

function getDaysInStage(enteredAt: string): number {
  const entered = new Date(enteredAt).getTime();
  const now     = Date.now();
  return Math.floor((now - entered) / (1000 * 60 * 60 * 24));
}

function DaysInStageBadge({
  days, threshold,
}: {
  days: number; threshold?: number;
}) {
  // Color logic:
  // Green:  0-1 days (fresh)
  // Amber:  2+ days or approaching threshold
  // Red:    at or over threshold (stale — needs attention)
  const isUrgent  = threshold !== undefined && days >= threshold;
  const isWarning = !isUrgent && days >= 2;

  const colorClass = isUrgent
    ? "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400"
    : isWarning
    ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400"
    : "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400";

  const label = days === 0
    ? "Today"
    : days === 1
    ? "1d"
    : `${days}d`;

  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${colorClass}`}
      title={`${days} day${days !== 1 ? "s" : ""} in this stage`}>
      {isUrgent ? "⚠ " : ""}{label}
    </span>
  );
}

export default function KanbanColumn({
  status, leads, onLeadClick, onDropLead,
  changeOrderTotals = {}, stageEnteredDates,
}: KanbanColumnProps) {
  const config    = columnConfig[status];
  const threshold = STAGE_THRESHOLDS[status];
  const [isDragOver, setIsDragOver] = useState(false);

  // ── Stage history: use passed data or fetch ourselves ─────────────────────
  const [localDates, setLocalDates] = useState<Record<string, string>>({});

  useEffect(() => {
    // If parent already passed dates, no need to fetch
    if (stageEnteredDates) return;
    if (leads.length === 0) { setLocalDates({}); return; }

    const ids = leads.map((l: any) => l.id);

    async function fetchStageHistory() {
      // Get the most recent entry for each lead in this stage where exited_at is null
      const { data } = await supabase
        .from("lead_stage_history")
        .select("lead_id, entered_at")
        .in("lead_id", ids)
        .eq("stage", status)
        .is("exited_at", null)
        .order("entered_at", { ascending: false });

      if (!data) return;

      // Keep only the most recent entry per lead
      const map: Record<string, string> = {};
      data.forEach((row: any) => {
        if (!map[row.lead_id]) map[row.lead_id] = row.entered_at;
      });
      setLocalDates(map);
    }

    fetchStageHistory();
  }, [leads, status, stageEnteredDates]);

  const dates = stageEnteredDates ?? localDates;

  // ── Revenue total ─────────────────────────────────────────────────────────
  const isClosedWon  = status === "closed_won";
  const totalValue   = leads.reduce((sum, lead: any) => {
    if (isClosedWon) {
      return sum + Number(lead.initial_contract_value || lead.closed_amount || 0) + (changeOrderTotals[lead.id] || 0);
    }
    return sum + Number(lead.estimated_amount || lead.initial_contract_value || 0);
  }, 0);

  // ── Stale count for column header warning ─────────────────────────────────
  const staleCount = threshold
    ? leads.filter((l: any) => {
        const entered = dates[(l as any).id];
        if (!entered) return false;
        return getDaysInStage(entered) >= threshold;
      }).length
    : 0;

  return (
    <div
      className={`flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30 transition-colors ${
        isDragOver ? "border-primary/50 bg-primary/5" : ""
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const leadId = e.dataTransfer.getData("leadId");
        if (leadId && onDropLead) onDropLead(leadId, status);
      }}
    >
      {/* ── Column header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background/60 rounded-t-xl">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${config.dot}`} />
          <span className="text-sm font-semibold">{config.label}</span>
          {/* Stale leads warning in column header */}
          {staleCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold border border-red-200"
              title={`${staleCount} lead${staleCount > 1 ? "s" : ""} need attention`}>
              {staleCount} stale
            </span>
          )}
        </div>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {leads.length}
        </span>
      </div>

      {/* ── Total value ── */}
      {leads.length > 0 && (
        <div className="px-4 py-2 text-xs text-muted-foreground border-b bg-background/40">
          Total: <span className="font-semibold text-foreground">${totalValue.toLocaleString()}</span>
        </div>
      )}

      {/* ── Cards ── */}
      <ScrollArea className="flex-1 max-h-[calc(100vh-320px)]">
        <div className="space-y-2.5 p-3">
          {leads.length === 0 ? (
            <div className={`flex items-center justify-center py-8 text-sm transition-colors ${
              isDragOver ? "text-primary/60" : "text-muted-foreground/50"
            }`}>
              {isDragOver ? "Drop here" : "No leads"}
            </div>
          ) : (
            leads.map((lead) => {
              const leadId   = (lead as any).id;
              const entered  = dates[leadId];
              const days     = entered ? getDaysInStage(entered) : null;

              return (
                <div key={leadId} className="relative">
                  <LeadCard
                    lead={lead}
                    onClick={() => onLeadClick?.(lead)}
                    changeOrderTotal={changeOrderTotals[leadId] || 0}
                  />
                  {/* Days-in-stage badge — bottom right of card */}
                  {days !== null && (
                    <div className="absolute bottom-2 right-2 pointer-events-none">
                      <DaysInStageBadge days={days} threshold={threshold} />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}