import { Phone, Globe } from "lucide-react";
import { Lead } from "@/types";

const sourceIcons: Record<string, string> = {
  "Google Ads": "🔍",
  Facebook: "📘",
  Referral: "🤝",
  Website: "🌐",
  Yelp: "⭐",
};

interface LeadCardProps {
  lead: Lead;
  onClick?: () => void;
}

export default function LeadCard({ lead, onClick }: LeadCardProps) {
  const leadData = lead as any;

  const name = leadData.lead_name || leadData.name || "Unnamed Lead";
  const phone = leadData.phone || "No phone";
  const source = leadData.source_email || leadData.source || "No source";
  const value = Number(
    leadData.estimated_amount ||
      leadData.closed_amount ||
      leadData.initial_contract_value ||
      0
  );

  const createdAt = leadData.created_at || leadData.createdAt;

  const initials = name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className="group rounded-lg border bg-card p-3.5 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary shrink-0">
            {initials}
          </div>
          <span className="text-sm font-semibold leading-tight">{name}</span>
        </div>

        <span className="text-sm font-semibold text-emerald-600 shrink-0">
          ${value.toLocaleString()}
        </span>
      </div>

      <div className="space-y-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Phone className="h-3 w-3 shrink-0" />
          <span>{phone}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Globe className="h-3 w-3 shrink-0" />
          <span>
            {sourceIcons[source] ?? "📌"} {source}
          </span>
        </div>
      </div>

      <div className="mt-2.5 border-t pt-2 text-xs text-muted-foreground/60">
        {createdAt
          ? new Date(createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          : "No date"}
      </div>
    </div>
  );
}