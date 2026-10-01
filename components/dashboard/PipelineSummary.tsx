"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const stageColors = ["bg-blue-500", "bg-indigo-500", "bg-violet-500", "bg-amber-500", "bg-emerald-500"];

// Each stage is its own filtered, count-exact query — never a single unfiltered fetch of
// the whole `leads` table. Supabase caps unfiltered fetches at 1000 rows; with 1103 leads
// that fetch was silently clipped, and JS then counted only what made it across the wire
// (New showed 273 of 305, Won 2 of 25). Every stage here has well under 1000 rows, so no
// query is at risk of that cap, and `count: "exact"` asks Postgres for the row count
// directly rather than trusting `data.length` on the client.
const STAGE_FILTERS: { stage: string; apply: (q: any) => any }[] = [
  { stage: "New",       apply: (q) => q.in("status", ["new", "new_lead"]) },
  { stage: "Contacted", apply: (q) => q.eq("status", "contacted") },
  { stage: "Appt Set",  apply: (q) => q.eq("status", "appointment_set") },
  { stage: "Estimate",  apply: (q) => q.eq("status", "estimate_sent") },
  {
    stage: "Won",
    apply: (q) => q.in("status", ["closed_won", "completed", "completed_with_balance", "won"]).is("cancelled_at", null),
  },
];

export default function PipelineSummary() {
  const [pipelineData, setPipelineData] = useState<{ stage: string; count: number; value: number }[]>([]);

  useEffect(() => {
    async function fetchData() {
      const results = await Promise.all(
        STAGE_FILTERS.map(({ apply }) =>
          apply(
            supabase
              .from("leads")
              .select("closed_amount, estimated_amount, initial_contract_value", { count: "exact" })
              .neq("archived", true)
          )
        )
      );

      const data = STAGE_FILTERS.map(({ stage }, i) => {
        const { data: rows, count } = results[i];
        const value = (rows || []).reduce(
          (sum: number, l: any) => sum + Number(l.closed_amount || l.estimated_amount || l.initial_contract_value || 0),
          0
        );
        return { stage, count: count ?? 0, value };
      });

      setPipelineData(data);
    }
    fetchData();
  }, []);

  const maxCount = Math.max(...pipelineData.map((s) => s.count), 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Pipeline Summary</CardTitle>
        <CardDescription>Leads by stage</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pipelineData.map((stage, idx) => (
          <div key={stage.stage} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{stage.stage}</span>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">{stage.count} leads</span>
                <span className="font-semibold text-foreground">${stage.value.toLocaleString()}</span>
              </div>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full rounded-full ${stageColors[idx]} transition-all duration-700`}
                style={{ width: `${(stage.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
