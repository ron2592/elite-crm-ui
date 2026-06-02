"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const REVENUE_COLOR = "#E07B3A"; // orange
const LEADS_COLOR   = "#378ADD"; // blue

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const rev   = payload.find((p: any) => p.dataKey === "revenue");
  const leads = payload.find((p: any) => p.dataKey === "leads");
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md text-sm space-y-1">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {rev && (
        <p className="font-medium" style={{ color: REVENUE_COLOR }}>
          ${rev.value.toLocaleString()} revenue
        </p>
      )}
      {leads && (
        <p className="font-medium" style={{ color: LEADS_COLOR }}>
          {leads.value} leads
        </p>
      )}
    </div>
  );
};

export default function RevenueChart() {
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    async function fetchData() {
      const now   = new Date();
      const months: Record<string, { revenue: number; leads: number }> = {};

      // Build last 6 months — keys match created_at month
      for (let i = 5; i >= 0; i--) {
        const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toLocaleString("default", { month: "short" });
        months[key] = { revenue: 0, leads: 0 };
      }

      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();

      // ✅ Use created_at (= lead received date) — same field as KPI + pipeline
      // ✅ Use initial_contract_value for revenue (not closed_amount which is often empty)
      const { data: leads } = await supabase
        .from("leads")
        .select("created_at, initial_contract_value, closed_amount, status")
        .neq("archived", true)
        .gte("created_at", sixMonthsAgo);

      if (!leads) return;

      leads.forEach((lead: any) => {
        const d   = new Date(lead.created_at);
        const key = d.toLocaleString("default", { month: "short" });
        if (months[key] === undefined) return;
        months[key].leads += 1;
        if (lead.status === "won" || lead.status === "closed_won") {
          months[key].revenue += Number(lead.initial_contract_value || lead.closed_amount || 0);
        }
      });

      setData(Object.entries(months).map(([month, vals]) => ({ month, ...vals })));
    }
    fetchData();
  }, []);

  const hasRevenue = data.some(d => d.revenue > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Revenue Overview</CardTitle>
            <CardDescription>Monthly revenue and lead volume</CardDescription>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: REVENUE_COLOR }} />
              Revenue
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: LEADS_COLOR }} />
              Leads
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
            <defs>
              <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={REVENUE_COLOR} stopOpacity={0.20} />
                <stop offset="95%" stopColor={REVENUE_COLOR} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={LEADS_COLOR} stopOpacity={0.15} />
                <stop offset="95%" stopColor={LEADS_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" vertical={false} />

            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "hsl(220, 9%, 46%)" }}
              axisLine={false} tickLine={false}
            />

            {/* Left Y-axis: Revenue in dollars */}
            <YAxis
              yAxisId="revenue"
              orientation="left"
              tick={{ fontSize: 11, fill: "hsl(220, 9%, 46%)" }}
              axisLine={false} tickLine={false}
              tickFormatter={v => v === 0 ? "$0" : `$${(v / 1000).toFixed(0)}k`}
              width={45}
            />

            {/* Right Y-axis: Lead count */}
            <YAxis
              yAxisId="leads"
              orientation="right"
              tick={{ fontSize: 11, fill: "hsl(220, 9%, 46%)" }}
              axisLine={false} tickLine={false}
              tickFormatter={v => String(v)}
              width={30}
              allowDecimals={false}
            />

            <Tooltip content={<CustomTooltip />} />

            {/* Orange — Revenue (area) */}
            <Area
              yAxisId="revenue"
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              stroke={REVENUE_COLOR}
              strokeWidth={2}
              fill="url(#revenueGrad)"
              dot={{ fill: REVENUE_COLOR, r: 4, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />

            {/* Blue — Leads (line) */}
            <Line
              yAxisId="leads"
              type="monotone"
              dataKey="leads"
              name="Leads"
              stroke={LEADS_COLOR}
              strokeWidth={2}
              dot={{ fill: LEADS_COLOR, r: 4, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>

        {!hasRevenue && (
          <p className="text-xs text-muted-foreground text-center mt-1">
            Revenue will appear here once jobs are marked Closed Won with a contract value.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
