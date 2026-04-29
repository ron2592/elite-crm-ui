import { Phone, Globe, Tag } from "lucide-react";
import { Lead } from "@/types";
import { Badge } from "@/components/ui/badge";

const sourceIcons: Record<string, string> = {
  "Google Ads": "🔍",
  "Facebook": "📘",
  "Referral": "🤝",
  "Website": "🌐",
  "Yelp": "⭐",
};

interface LeadCardProps {
  lead: Lead;
  onClick?: () => void;
}

export default function LeadCard({ lead, onClick }: LeadCardProps) {
  return (
    <div
      className="group rounded-lg border bg-card p-3.5 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 cursor-pointer"
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary shrink-0">
            {lead.name.split(" ").map((n) => n[0]).join("")}
          </div>
          <span className="text-sm font-semibold leading-tight">{lead.name}</span>
        </div>
        <span className="text-sm font-semibold text-emerald-600 shrink-0">
          ${lead.value.toLocaleString()}
        </span>
      </div>

      {/* Details */}
      <div className="space-y-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Phone className="h-3 w-3 shrink-0" />
          <span>{lead.phone}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Globe className="h-3 w-3 shrink-0" />
          <span>{sourceIcons[lead.source] ?? "📌"} {lead.source}</span>
        </div>
      </div>

      {/* Tags */}
      {lead.tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {lead.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-primary/8 px-2 py-0.5 text-xs font-medium text-primary">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-2.5 border-t pt-2 text-xs text-muted-foreground/60">
        {new Date(lead.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </div>
    </div>
  );
}
