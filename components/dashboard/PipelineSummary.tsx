"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const stageColors = ["bg-blue-500", "bg-indigo-500", "bg-violet-500", "bg-amber-500", "bg-emerald-500"];

const stageMap: Record<string, string> = {
  new: "New",
  open: "New",
  contacted: "Contacted",
  appointment_set: "Appt Set",
  estimate_sent: "Estimate",
  closed_won: "Won",
  won: "Won",
};

export default function PipelineSummary() {
  const [pipelineData, setPipelineData] = useState<{ stage: string; count: number; value: number }[]>([]);

  useEffect(() => {
    async function fetchData() {
      const { data: leads } = await supabase
        .from("leads")
        .select("status, closed_amount, estimated_amount, initial_contract_value");

      const stages: Record<string, { count: number; value: number }> = {
        New: { count: 0, value: 0 },
        Contacted: { count: 0, value: 0 },
        "Appt Set": { count: 0, value: 0 },
        Estimate: { count: 0, value: 0 },
        Won: { count: 0, value: 0 },
      };

      (leads || []).forEach((lead: any) => {
        const stageName = stageMap[lead.status];
        if (stageName && stages[stageName]) {
          stages[stageName].count += 1;
          stages[stageName].value += Number(
            lead.closed_amount || lead.estimated_amount || lead.initial_contract_value || 0
          );
        }
      });

      setPipelineData(Object.entries(stages).map(([stage, vals]) => ({ stage, ...vals })));
    }
    fetchData();
  }, []);

  const maxCount = Math.max(...pipelineData.map((s) => s.count), 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Pipeline Summary</CardTitle>
        <CardDescription>Leads by stage this month</CardDescription>
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