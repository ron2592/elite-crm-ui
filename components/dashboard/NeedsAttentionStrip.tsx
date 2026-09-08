"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import LeadDetailDialog from "@/components/leads/LeadDetailDialog";
import { AlertTriangle, ChevronDown } from "lucide-react";

const COLLAPSED_LIMIT = 3;

interface TaskQueueRow {
  id: string;
  title: string;
  description: string | null;
  lead_id: string | null;
  lead_name: string | null;
  priority: string | null;
  due_date: string | null;
  trigger_stage: string | null;
  days_overdue: number | null;
  queue: string;
  urgency: string | null;
  priority_rank: number | null;
}

function overdueLabel(row: TaskQueueRow) {
  const days = row.days_overdue ?? 0;
  if (days > 0) return `${days}d overdue`;
  if (days === 0) return "Due today";
  return `Due in ${Math.abs(days)}d`;
}

export default function NeedsAttentionStrip() {
  const [rows, setRows] = useState<TaskQueueRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);

  async function openLead(leadId: string) {
    const { data } = await supabase.from("leads").select("*, lead_sources(name)").eq("id", leadId).single();
    if (data) { setSelectedLead(data); setLeadDialogOpen(true); }
  }

  useEffect(() => {
    async function fetchQueue() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoaded(true); return; }

      const { data } = await supabase
        .from("v_my_task_queue")
        .select("id, title, description, lead_id, lead_name, priority, due_date, trigger_stage, days_overdue, queue, urgency, priority_rank")
        .eq("queue", "work")
        .eq("assigned_user_id", user.id)
        .order("priority_rank", { ascending: true })
        .order("due_date", { ascending: true });
      setRows((data as TaskQueueRow[]) || []);
      setLoaded(true);
    }
    fetchQueue();
  }, []);

  if (!loaded || rows.length === 0) return null;

  const visible = expanded ? rows : rows.slice(0, COLLAPSED_LIMIT);
  const remaining = rows.length - COLLAPSED_LIMIT;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/10 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-2 bg-amber-100/50 dark:bg-amber-950/20">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
        <span className="text-sm font-bold">Needs Attention</span>
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-200/70 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-medium">
          {rows.length}
        </span>
      </div>
      <div className="divide-y divide-amber-100 dark:divide-amber-900/30">
        {visible.map(row => (
          <button
            key={row.id}
            onClick={() => row.lead_id && openLead(row.lead_id)}
            disabled={!row.lead_id}
            className="w-full flex items-center gap-2 px-5 py-1.5 text-left hover:bg-amber-100/40 dark:hover:bg-amber-950/20 transition-colors disabled:cursor-default disabled:hover:bg-transparent"
          >
            <span className="text-sm font-medium truncate">{row.title}</span>
            {row.lead_name && (
              <span className="text-xs text-muted-foreground truncate">{row.lead_name}</span>
            )}
            <span className="shrink-0 text-xs font-semibold text-amber-700 dark:text-amber-400 ml-auto">
              {overdueLabel(row)}
            </span>
          </button>
        ))}
      </div>
      {remaining > 0 && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-center gap-1 px-5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-100/40 dark:hover:bg-amber-950/20 bg-amber-50/60 dark:bg-amber-950/10 transition-colors"
        >
          {expanded ? "Show less" : `Show all ${rows.length}`}
          <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      )}

      <LeadDetailDialog
        lead={selectedLead}
        open={leadDialogOpen}
        onOpenChange={setLeadDialogOpen}
        onLeadUpdated={(leadId) => openLead(leadId)}
        onLeadDeleted={() => setLeadDialogOpen(false)}
      />
    </div>
  );
}
