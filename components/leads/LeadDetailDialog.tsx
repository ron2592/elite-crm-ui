"use client";

import { Lead } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Phone, Mail, MapPin, Calendar, DollarSign } from "lucide-react";

const statusLabels: Record<string, string> = {
  new: "New Lead",
  open: "New Lead",
  contacted: "Qualified",
  appointment_set: "Appointment Set",
  estimate_sent: "Estimate Sent",
  closed_won: "Closed Won",
  won: "Closed Won",
  closed_lost: "Cancelled",
  lost: "Cancelled",
};

interface LeadDetailDialogProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStageChange?: (leadId: string, newStatus: any) => void;
}

export default function LeadDetailDialog({
  lead,
  open,
  onOpenChange,
  onStageChange,
}: LeadDetailDialogProps) {
  if (!lead) return null;

  const displayName = (lead as any).lead_name ||
    (lead as any).first_name ||
    "Unnamed Lead";

  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const value = Number(
    (lead as any).closed_amount ||
    (lead as any).estimated_amount ||
    (lead as any).initial_contract_value ||
    0
  );

  const phone = (lead as any).phone || "No phone";
  const email = (lead as any).email || "No email";
  const address = (lead as any).address_line_1
    ? `${(lead as any).address_line_1}${(lead as any).city ? ", " + (lead as any).city : ""}${(lead as any).state ? ", " + (lead as any).state : ""}`
    : "No address";
  const source = (lead as any).lead_source ||
    (lead as any).source_email ||
    "No source";
  const jobType = (lead as any).job_type || "";
  const salesperson = (lead as any).salesperson || "";
  const notes = (lead as any).notes || "";
  const createdAt = (lead as any).created_at || (lead as any).createdAt;
  const status = (lead as any).status || "new";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {initials}
            </div>
            <div>
              <DialogTitle>{displayName}</DialogTitle>
              <DialogDescription>
                {source} {jobType ? `· ${jobType}` : ""}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <DollarSign className="h-3 w-3" /> Value
              </p>
              <p className="font-semibold text-emerald-600">
                ${value.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              <p className="font-semibold text-sm">
                {statusLabels[status] || status}
              </p>
            </div>
            {salesperson && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">Salesperson</p>
                <p className="font-semibold text-sm">{salesperson}</p>
              </div>
            )}
            {jobType && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">Job Type</p>
                <p className="font-semibold text-sm">{jobType}</p>
              </div>
            )}
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{phone}</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{email}</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{address}</span>
            </div>
            {createdAt && (
              <div className="flex items-center gap-2.5 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>
                  Added{" "}
                  {new Date(createdAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            )}
          </div>

          {notes && (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-sm">{notes}</p>
            </div>
          )}

          {onStageChange && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Move to stage</p>
              <div className="flex flex-wrap gap-2">
                {["new","contacted","appointment_set","estimate_sent","closed_won","closed_lost"].map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      onStageChange((lead as any).id, s);
                      onOpenChange(false);
                    }}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                      status === s
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:bg-muted border-border"
                    }`}
                  >
                    {statusLabels[s]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}