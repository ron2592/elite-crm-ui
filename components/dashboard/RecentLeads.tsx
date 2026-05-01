import Link from "next/link";
import { mockLeads } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";

const statusConfig: Record<string, { label: string; variant: "default" | "info" | "warning" | "success" | "destructive" | "purple" | "secondary" | "outline" }> = {
  new: { label: "New", variant: "info" },
  contacted: { label: "Contacted", variant: "purple" },
  appointment_set: { label: "Appt Set", variant: "warning" },
  estimate_sent: { label: "Estimate", variant: "secondary" },
  closed_won: { label: "Won", variant: "success" },
  closed_lost: { label: "Lost", variant: "destructive" },
};

export default function RecentLeads() {
  const recentLeads = mockLeads.slice(0, 6);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Recent Leads</CardTitle>
            <CardDescription>Latest entries in your pipeline</CardDescription>
          </div>
          <Link
            href="/leads"
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {recentLeads.map((lead) => {
            const status = statusConfig[lead.status];
            return (
              <div
                key={lead.id}
                className="flex items-center justify-between px-6 py-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {lead.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{lead.name}</p>
                    <p className="text-xs text-muted-foreground">{lead.source}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="hidden sm:block text-sm font-semibold">${lead.value.toLocaleString()}</span>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
