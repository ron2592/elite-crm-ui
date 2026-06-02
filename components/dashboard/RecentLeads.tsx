"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";

const statusConfig: Record<string, { label: string; variant: "default" | "info" | "warning" | "success" | "destructive" | "purple" | "secondary" | "outline" }> = {
  new: { label: "New", variant: "info" },
  open: { label: "New", variant: "info" },
  contacted: { label: "Contacted", variant: "purple" },
  appointment_set: { label: "Appt Set", variant: "warning" },
  estimate_sent: { label: "Estimate", variant: "secondary" },
  closed_won: { label: "Won", variant: "success" },
  won: { label: "Won", variant: "success" },
  closed_lost: { label: "Lost", variant: "destructive" },
  lost: { label: "Lost", variant: "destructive" },
};

export default function RecentLeads() {
  const [leads, setLeads] = useState<any[]>([]);

  useEffect(() => {
    async function fetchLeads() {
      const { data } = await supabase
        .from("leads")
        .select("id, lead_name, first_name, status, source_email, estimated_amount, closed_amount, initial_contract_value")
        .order("created_at", { ascending: false })
        .limit(6);
      setLeads(data || []);
    }
    fetchLeads();
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Recent Leads</CardTitle>
            <CardDescription>Latest entries in your pipeline</CardDescription>
          </div>
          <Link href="/leads" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {leads.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              No leads yet. Add your first lead to get started.
            </div>
          ) : (
            leads.map((lead: any) => {
              const displayName = lead.lead_name || lead.first_name || "Unnamed Lead";
              const initials = displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
              const status = statusConfig[lead.status] || { label: lead.status || "New", variant: "info" as const };
              const value = Number(lead.closed_amount || lead.estimated_amount || lead.initial_contract_value || 0);
              const source = lead.source_email || "No source";

              return (
                <div key={lead.id} className="flex items-center justify-between px-6 py-3 hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {initials}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{displayName}</p>
                      <p className="text-xs text-muted-foreground">{source}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="hidden sm:block text-sm font-semibold">${value.toLocaleString()}</span>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
