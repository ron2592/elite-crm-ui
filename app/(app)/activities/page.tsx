"use client";

import { useState } from "react";
import { mockActivities } from "@/lib/mock-data";
import { Activity, ActivityType, ActivityStatus } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Phone, Mail, RefreshCw, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

const typeConfig: Record<ActivityType, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  call: { label: "Call", icon: Phone, color: "text-blue-600", bg: "bg-blue-50" },
  email: { label: "Email", icon: Mail, color: "text-violet-600", bg: "bg-violet-50" },
  follow_up: { label: "Follow-up", icon: RefreshCw, color: "text-amber-600", bg: "bg-amber-50" },
};

const statusConfig: Record<ActivityStatus, { label: string; variant: "success" | "warning" | "secondary" }> = {
  completed: { label: "Completed", variant: "success" },
  pending: { label: "Pending", variant: "warning" },
  no_answer: { label: "No Answer", variant: "secondary" },
};

export default function ActivitiesPage() {
  const [typeFilter, setTypeFilter] = useState<ActivityType | "all">("all");

  const filtered = mockActivities.filter((a) =>
    typeFilter === "all" ? true : a.type === typeFilter
  );

  return (
    <div className="max-w-5xl space-y-4">
      {/* Summary badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground mr-1">Filter by type:</span>
        {(["all", "call", "email", "follow_up"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition-all capitalize",
              typeFilter === t
                ? "bg-primary text-white"
                : "bg-secondary text-muted-foreground hover:bg-secondary/80"
            )}
          >
            {t === "all" ? "All" : t === "follow_up" ? "Follow-up" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">{filtered.length} activities</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Lead
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">
                  Description
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden lg:table-cell">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((activity) => {
                const type = typeConfig[activity.type];
                const status = statusConfig[activity.status];
                const TypeIcon = type.icon;
                return (
                  <tr
                    key={activity.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className={cn("flex items-center gap-2 w-fit rounded-lg px-2.5 py-1.5", type.bg)}>
                        <TypeIcon className={cn("h-3.5 w-3.5", type.color)} />
                        <span className={cn("text-xs font-semibold", type.color)}>{type.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {activity.leadName.split(" ").map((n) => n[0]).join("")}
                        </div>
                        <span className="font-medium">{activity.leadName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-muted-foreground text-xs">{activity.description}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-muted-foreground text-xs">
                        {new Date(activity.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-muted-foreground text-xs">
                        {activity.duration ?? "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
