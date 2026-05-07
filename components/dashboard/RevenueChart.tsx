"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border bg-background p-3 shadow-md text-sm">
        <p className="font-semibold text-foreground">{label}</p>
        <p className="font-medium" style={{ color: "#E07B3A" }}>${payload[0].value.toLocaleString()}</p>
        <p className="text-muted-foreground">{payload[1]?.value} leads</p>
      </div>
    );
  }
  return null;
};

export default function RevenueChart() {
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    async function fetchData() {
      const { data: leads } = await supabase
        .from("leads")
        .select("created_at, closed_amount, estimated_amount, status");

      if (!leads) return;

      const months: Record<string, { revenue: number; leads: number }> = {};
      const now = new Date();

      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toLocaleString("default", { month: "short" });
        months[key] = { revenue: 0, leads: 0 };
      }

      leads.forEach((lead: any) => {
        const d = new Date(lead.created_at);
        const key = d.toLocaleString("default", { month: "short" });
        if (months[key] !== undefined) {
          months[key].leads += 1;
          if (lead.status === "won" || lead.status === "closed_won") {
            months[key].revenue += Number(lead.closed_amount || lead.estimated_amount || 0);
          }
        }
      });

      setData(Object.entries(months).map(([month, vals]) => ({ month, ...vals })));
    }
    fetchData();
  }, []);

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
              <span className="h-2 w-2 rounded-full" style={{ background: "#E07B3A" }} />
              Revenue
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: "#378ADD" }} />
              Leads
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#E07B3A" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#E07B3A" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="leadsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#378ADD" stopOpacity={0.12} />
                <stop offset="95%" stopColor="#378ADD" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(220, 9%, 46%)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(220, 9%, 46%)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#E07B3A"
              strokeWidth={2}
              fill="url(#revenueGradient)"
              dot={{ fill: "#E07B3A", r: 4, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}