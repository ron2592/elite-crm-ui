import { Phone, Globe, RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Lead } from "@/types";

interface LeadCardProps {
  lead: Lead;
  onClick?: () => void;
  changeOrderTotal?: number;
}

// ── JN Sync Status Badge ──────────────────────────────────────────────────────
function JNSyncBadge({ status }: { status?: string }) {
  if (!status || status === 'pending') return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-gray-400 border border-gray-200 rounded-full px-1.5 py-0.5"
      title="Not yet synced to JobNimbus">
      <Clock className="h-2.5 w-2.5" /> JN
    </span>
  )
  if (status === 'synced') return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-emerald-600 border border-emerald-200 rounded-full px-1.5 py-0.5 bg-emerald-50"
      title="Synced to JobNimbus">
      <CheckCircle2 className="h-2.5 w-2.5" /> JN
    </span>
  )
  if (status === 'failed') return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-red-600 border border-red-200 rounded-full px-1.5 py-0.5 bg-red-50"
      title="JN sync failed">
      <XCircle className="h-2.5 w-2.5" /> JN
    </span>
  )
  return null
}

export default function LeadCard({ lead, onClick, changeOrderTotal = 0 }: LeadCardProps) {
  const l = lead as any;
  const name = l.lead_name || l.first_name || "Unnamed Lead";
  const phone = l.phone || "No phone";
  const source = l.lead_sources?.name || l.source_email || l.metadata?.lead_source || "No source";
  const isClosedWon = l.status === "closed_won" || l.status === "won";
  const initialContract = Number(l.initial_contract_value || l.closed_amount || 0);
  const value = isClosedWon
    ? initialContract + changeOrderTotal
    : Number(l.estimated_amount || l.initial_contract_value || 0);
  const createdAt = l.created_at || l.createdAt;
  const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div
      className="group rounded-lg border bg-card p-3.5 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 cursor-grab active:cursor-grabbing"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("leadId", l.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onClick}
    >
      {/* ── Top row: avatar + name + value ── */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary shrink-0">
            {initials}
          </div>
          <span className="text-sm font-semibold leading-tight">{name}</span>
        </div>
        <div className="text-right shrink-0">
          <span className="text-sm font-semibold text-emerald-600">${value.toLocaleString()}</span>
          {isClosedWon && changeOrderTotal > 0 && (
            <p className="text-xs text-muted-foreground">
              +${changeOrderTotal.toLocaleString()} CO
            </p>
          )}
        </div>
      </div>

      {/* ── Contact info ── */}
      <div className="space-y-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Phone className="h-3 w-3 shrink-0" />
          <span>{phone}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Globe className="h-3 w-3 shrink-0" />
          <span>📌 {source}</span>
        </div>
      </div>

      {/* ── Footer: date + JN sync badge ── */}
      <div className="mt-2.5 border-t pt-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground/60">
          {createdAt ? new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No date"}
        </span>
        <JNSyncBadge status={l.jn_sync_status} />
      </div>
    </div>
  );
}