"use client";

import { useState } from "react";
import { Lead } from "@/types";
import { supabase } from "@/lib/supabaseClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Phone, Mail, MapPin, Calendar, DollarSign, Save } from "lucide-react";

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
  const [estimatedAmount, setEstimatedAmount] = useState("");
  const [contractValue, setContractValue] = useState("");
  const [closedAmount, setClosedAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!lead) return null;

  const displayName =
    (lead as any).lead_name || (lead as any).first_name || "Unnamed Lead";

  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const phone = (lead as any).phone || "No phone";
  const email = (lead as any).email || "No email";
  const address = (lead as any).address_line_1
    ? `${(lead as any).address_line_1}${(lead as any).city ? ", " + (lead as any).city : ""}${(lead as any).state ? ", " + (lead as any).state : ""}`
    : "No address";
  const source =
    (lead as any).lead_source || (lead as any).source_email || "No source";
  const jobType = (lead as any).job_type || "";
  const salesperson = (lead as any).salesperson || "";
  const notes = (lead as any).notes || "";
  const createdAt = (lead as any).created_at || (lead as any).createdAt;
  const status = (lead as any).status || "new";

  // Current saved values
  const currentEstimated = Number((lead as any).estimated_amount || 0);
  const currentContract = Number((lead as any).initial_contract_value || 0);
  const currentClosed = Number((lead as any).closed_amount || 0);

  // Balance = contract value - closed amount
  const contractForBalance = contractValue !== "" ? Number(contractValue) : currentContract;
  const closedForBalance = closedAmount !== "" ? Number(closedAmount) : currentClosed;
  const balance = contractForBalance > 0 ? contractForBalance - closedForBalance : 0;

  const handleSaveAmounts = async () => {
    setSaving(true);
    const updates: any = {};
    if (estimatedAmount !== "") updates.estimated_amount = Number(estimatedAmount);
    if (contractValue !== "") updates.initial_contract_value = Number(contractValue);
    if (closedAmount !== "") updates.closed_amount = Number(closedAmount);

    if (Object.keys(updates).length > 0) {
      await supabase.from("leads").update(updates).eq("id", (lead as any).id);
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleOpen = (val: boolean) => {
    if (!val) {
      setEstimatedAmount("");
      setContractValue("");
      setClosedAmount("");
      setSaved(false);
    }
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
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

          {/* Status + Salesperson */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              <p className="font-semibold text-sm">{statusLabels[status] || status}</p>
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

          {/* Financial Fields */}
          <div className="rounded-lg border border-border p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <DollarSign className="h-3 w-3" /> Financials
            </p>

            <div className="grid grid-cols-1 gap-3">
              {/* Estimate */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Estimated Amount
                  <span className="ml-2 text-foreground font-medium">
                    (saved: ${currentEstimated.toLocaleString()})
                  </span>
                </label>
                <input
                  type="number"
                  placeholder={String(currentEstimated)}
                  value={estimatedAmount}
                  onChange={(e) => setEstimatedAmount(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* Contract */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Contract Value (Signed)
                  <span className="ml-2 text-foreground font-medium">
                    (saved: ${currentContract.toLocaleString()})
                  </span>
                </label>
                <input
                  type="number"
                  placeholder={String(currentContract)}
                  value={contractValue}
                  onChange={(e) => setContractValue(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* Closed / Collected */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Amount Collected
                  <span className="ml-2 text-foreground font-medium">
                    (saved: ${currentClosed.toLocaleString()})
                  </span>
                </label>
                <input
                  type="number"
                  placeholder={String(currentClosed)}
                  value={closedAmount}
                  onChange={(e) => setClosedAmount(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            {/* Balance */}
            <div className={`rounded-md px-3 py-2 flex items-center justify-between ${balance > 0 ? "bg-red-500/10 border border-red-500/30" : "bg-emerald-500/10 border border-emerald-500/30"}`}>
              <span className="text-xs font-medium text-muted-foreground">Balance Due</span>
              <span className={`font-bold text-sm ${balance > 0 ? "text-red-500" : "text-emerald-600"}`}>
                ${balance.toLocaleString()}
              </span>
            </div>

            {/* Save Button */}
            <button
              onClick={handleSaveAmounts}
              disabled={saving || (estimatedAmount === "" && contractValue === "" && closedAmount === "")}
              className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : saved ? "Saved ✓" : "Save Amounts"}
            </button>
          </div>

          {/* Contact Info */}
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

          {/* Notes */}
          {notes && (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-sm">{notes}</p>
            </div>
          )}

          {/* Move Stage */}
          {onStageChange && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Move to stage</p>
              <div className="flex flex-wrap gap-2">
                {[
                  "new",
                  "contacted",
                  "appointment_set",
                  "estimate_sent",
                  "closed_won",
                  "closed_lost",
                ].map((s) => (
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