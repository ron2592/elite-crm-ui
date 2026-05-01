"use client";

import { useState, useEffect } from "react";
import { Lead } from "@/types";
import { supabase } from "@/lib/supabaseClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Phone, Mail, MapPin, Calendar, DollarSign, Save, Plus, X, Pencil, Archive } from "lucide-react";

const statusLabels: Record<string, string> = {
  new: "New Lead",
  open: "New Lead",
  contacted: "Qualified",
  appointment_set: "Appointment Set",
  estimate_sent: "Estimate Sent",
  closed_won: "Closed Won",
  won: "Closed Won",
  closed_lost: "Cancelled Appt",
  cancelled_appointment: "Cancelled Appt",
  lost: "Lost",
  not_qualified: "Not Qualified",
};

const PAYMENT_TYPES = ["Deposit", "Progress Payment", "Final", "Installment"];
const PAYMENT_METHODS = ["Cash", "Check", "Zelle", "Credit Card", "Sunlight Financial", "Upgrade"];
const JOB_TYPES = ["Roofing", "Siding", "Windows", "Gutters", "Doors", "General Contracting", "Other"];
const SALESPERSONS = ["Jamie Davis", "Ron", "Other"];

interface Payment {
  id: string;
  amount: number;
  payment_type: string;
  payment_method: string;
  paid_at: string;
  notes: string;
}

interface LeadSource {
  name: string;
}

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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newPayment, setNewPayment] = useState({
    amount: "",
    payment_type: "Deposit",
    payment_method: "Cash",
    paid_at: new Date().toISOString().split("T")[0],
    notes: "",
  });
  const [addingPayment, setAddingPayment] = useState(false);
  const [leadSources, setLeadSources] = useState<{ id: string; name: string }[]>([]);

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editFields, setEditFields] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    address_line_1: "",
    city: "",
    state: "",
    zip: "",
    source_id: "",
    job_type: "",
    salesperson: "",
    notes: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const leadId = (lead as any)?.id;

  useEffect(() => {
    if (open && leadId) {
      fetchPayments();
      fetchLeadSources();
    }
  }, [open, leadId]);

  useEffect(() => {
    if (lead && editMode) {
      const l = lead as any;
      setEditFields({
        first_name: l.first_name || "",
        last_name: l.last_name || "",
        phone: l.phone || "",
        email: l.email || "",
        address_line_1: l.address_line_1 || "",
        city: l.city || "",
        state: l.state || "",
        zip: l.zip || "",
        source_id: l.source_id || "",
        job_type: l.metadata?.job_type || l.job_type || "",
        salesperson: l.metadata?.salesperson || l.salesperson || "",
        notes: l.metadata?.notes || l.notes || "",
      });
    }
  }, [editMode, lead]);

  async function fetchPayments() {
    const { data } = await supabase
      .from("payments")
      .select("*")
      .eq("lead_id", leadId)
      .order("paid_at", { ascending: false });
    setPayments(data || []);
  }

  async function fetchLeadSources() {
    const { data } = await supabase.from("lead_sources").select("id, name").order("name");
    setLeadSources(data || []);
  }

  if (!lead) return null;

  const l = lead as any;
  const displayName = l.lead_name || l.first_name || "Unnamed Lead";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
  const phone = l.phone || "No phone";
  const email = l.email || "No email";
  const address = l.address_line_1
    ? `${l.address_line_1}${l.city ? ", " + l.city : ""}${l.state ? ", " + l.state : ""}`
    : "No address";
  const source = l.lead_sources?.name || l.source_email || l.metadata?.lead_source || "No source";
  const jobType = l.metadata?.job_type || l.job_type || "";
  const salesperson = l.metadata?.salesperson || l.salesperson || "";
  const notes = l.metadata?.notes || l.notes || "";
  const createdAt = l.created_at;
  const status = l.status || "new";

  const currentEstimated = Number(l.estimated_amount || 0);
  const currentContract = contractValue !== "" ? Number(contractValue) : Number(l.initial_contract_value || 0);
  const totalCollected = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const balance = currentContract > 0 ? currentContract - totalCollected : 0;
  const isFinancing = payments.some(p =>
    p.payment_method === "Sunlight Financial" || p.payment_method === "Upgrade"
  );

  const handleSaveAmounts = async () => {
    setSaving(true);
    const updates: any = {};
    if (estimatedAmount !== "") updates.estimated_amount = Number(estimatedAmount);
    if (contractValue !== "") updates.initial_contract_value = Number(contractValue);
    if (Object.keys(updates).length > 0) {
      await supabase.from("leads").update(updates).eq("id", leadId);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveEdit = async () => {
    setEditSaving(true);
    const fullName = `${editFields.first_name} ${editFields.last_name}`.trim();
    const updates: any = {
      first_name: editFields.first_name,
      last_name: editFields.last_name,
      lead_name: fullName,
      phone: editFields.phone,
      email: editFields.email,
      address_line_1: editFields.address_line_1,
      city: editFields.city,
      state: editFields.state,
      zip: editFields.zip,
      metadata: {
        ...l.metadata,
        job_type: editFields.job_type || null,
        salesperson: editFields.salesperson || null,
        notes: editFields.notes || null,
      },
    };
    if (editFields.source_id) updates.source_id = editFields.source_id;

    const { error } = await supabase.from("leads").update(updates).eq("id", leadId);
    if (!error) {
      setEditMode(false);
      onOpenChange(false);
    }
    setEditSaving(false);
  };

  const handleArchive = async () => {
    if (!confirm("Archive this lead? It will be removed from the pipeline. You can restore it later.")) return;
    setArchiving(true);
    await supabase.from("leads").update({ archived: true }).eq("id", leadId);
    setArchiving(false);
    onOpenChange(false);
  };

  const handleAddPayment = async () => {
    if (!newPayment.amount || Number(newPayment.amount) <= 0) return;
    setAddingPayment(true);
    const { error } = await supabase.from("payments").insert({
      lead_id: leadId,
      amount: Number(newPayment.amount),
      payment_type: newPayment.payment_type,
      payment_method: newPayment.payment_method,
      paid_at: newPayment.paid_at,
      notes: newPayment.notes || null,
    });
    if (!error) {
      const newTotal = totalCollected + Number(newPayment.amount);
      await supabase.from("leads").update({ closed_amount: newTotal }).eq("id", leadId);
      await fetchPayments();
      setNewPayment({
        amount: "",
        payment_type: "Deposit",
        payment_method: "Cash",
        paid_at: new Date().toISOString().split("T")[0],
        notes: "",
      });
      setShowAddPayment(false);
    }
    setAddingPayment(false);
  };

  const handleDeletePayment = async (paymentId: string, amount: number) => {
    await supabase.from("payments").delete().eq("id", paymentId);
    const newTotal = totalCollected - amount;
    await supabase.from("leads").update({ closed_amount: newTotal }).eq("id", leadId);
    await fetchPayments();
  };

  const handleOpen = (val: boolean) => {
    if (!val) {
      setEstimatedAmount("");
      setContractValue("");
      setSaved(false);
      setShowAddPayment(false);
      setEditMode(false);
    }
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {initials}
              </div>
              <div>
                <DialogTitle className="flex items-center gap-2">
                  {displayName}
                  {isFinancing && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 font-medium">
                      Financing
                    </span>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {source} {jobType ? `· ${jobType}` : ""}
                </DialogDescription>
              </div>
            </div>
            {/* Edit + Archive buttons */}
            <div className="flex items-center gap-2 mr-6">
              <button
                onClick={() => setEditMode(!editMode)}
                className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                  editMode
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-muted"
                }`}
              >
                <Pencil className="h-3 w-3" />
                {editMode ? "Editing" : "Edit"}
              </button>
              <button
                onClick={handleArchive}
                disabled={archiving}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-colors disabled:opacity-40"
              >
                <Archive className="h-3 w-3" />
                {archiving ? "..." : "Archive"}
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">

          {/* EDIT MODE FORM */}
          {editMode && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">Edit Lead Info</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">First Name</label>
                  <input
                    value={editFields.first_name}
                    onChange={(e) => setEditFields({ ...editFields, first_name: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Last Name</label>
                  <input
                    value={editFields.last_name}
                    onChange={(e) => setEditFields({ ...editFields, last_name: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Phone</label>
                  <input
                    value={editFields.phone}
                    onChange={(e) => setEditFields({ ...editFields, phone: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Email</label>
                  <input
                    value={editFields.email}
                    onChange={(e) => setEditFields({ ...editFields, email: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Address</label>
                <input
                  value={editFields.address_line_1}
                  onChange={(e) => setEditFields({ ...editFields, address_line_1: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">City</label>
                  <input
                    value={editFields.city}
                    onChange={(e) => setEditFields({ ...editFields, city: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">State</label>
                  <input
                    value={editFields.state}
                    onChange={(e) => setEditFields({ ...editFields, state: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Zip</label>
                  <input
                    value={editFields.zip}
                    onChange={(e) => setEditFields({ ...editFields, zip: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Lead Source</label>
                  <select
                    value={editFields.source_id}
                    onChange={(e) => setEditFields({ ...editFields, source_id: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <option value="">— Select source —</option>
                    {leadSources.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Job Type</label>
                  <select
                    value={editFields.job_type}
                    onChange={(e) => setEditFields({ ...editFields, job_type: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <option value="">— Select type —</option>
                    {JOB_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Salesperson</label>
                <select
                  value={editFields.salesperson}
                  onChange={(e) => setEditFields({ ...editFields, salesperson: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">— Select salesperson —</option>
                  {SALESPERSONS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Notes</label>
                <textarea
                  value={editFields.notes}
                  onChange={(e) => setEditFields({ ...editFields, notes: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveEdit}
                  disabled={editSaving}
                  className="flex-1 flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
                >
                  <Save className="h-4 w-4" />
                  {editSaving ? "Saving..." : "Save Changes"}
                </button>
                <button
                  onClick={() => setEditMode(false)}
                  className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Status + Salesperson */}
          {!editMode && (
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
          )}

          {/* Contract */}
          <div className="rounded-lg border border-border p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <DollarSign className="h-3 w-3" /> Contract
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Estimated Amount
                  <span className="ml-1 text-foreground font-medium">(${currentEstimated.toLocaleString()})</span>
                </label>
                <input
                  type="number"
                  placeholder={String(currentEstimated)}
                  value={estimatedAmount}
                  onChange={(e) => setEstimatedAmount(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Contract Value
                  <span className="ml-1 text-foreground font-medium">(${Number(l.initial_contract_value || 0).toLocaleString()})</span>
                </label>
                <input
                  type="number"
                  placeholder={String(Number(l.initial_contract_value || 0))}
                  value={contractValue}
                  onChange={(e) => setContractValue(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>
            <button
              onClick={handleSaveAmounts}
              disabled={saving || (estimatedAmount === "" && contractValue === "")}
              className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : saved ? "Saved ✓" : "Save Contract"}
            </button>
          </div>

          {/* Payments */}
          <div className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <DollarSign className="h-3 w-3" /> Payments Received
              </p>
              <button
                onClick={() => setShowAddPayment(!showAddPayment)}
                className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"
              >
                <Plus className="h-3 w-3" /> Add Payment
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-muted/50 p-2">
                <p className="text-xs text-muted-foreground">Contract</p>
                <p className="font-bold text-sm">${currentContract.toLocaleString()}</p>
              </div>
              <div className="rounded-md bg-emerald-500/10 p-2">
                <p className="text-xs text-muted-foreground">Collected</p>
                <p className="font-bold text-sm text-emerald-600">${totalCollected.toLocaleString()}</p>
              </div>
              <div className={`rounded-md p-2 ${balance > 0 ? "bg-red-500/10" : "bg-emerald-500/10"}`}>
                <p className="text-xs text-muted-foreground">Balance</p>
                <p className={`font-bold text-sm ${balance > 0 ? "text-red-500" : "text-emerald-600"}`}>
                  ${balance.toLocaleString()}
                </p>
              </div>
            </div>
            {showAddPayment && (
              <div className="rounded-md border border-border p-3 space-y-2 bg-muted/20">
                <p className="text-xs font-semibold">New Payment</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Amount</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={newPayment.amount}
                      onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Date</label>
                    <input
                      type="date"
                      value={newPayment.paid_at}
                      onChange={(e) => setNewPayment({ ...newPayment, paid_at: e.target.value })}
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Type</label>
                    <select
                      value={newPayment.payment_type}
                      onChange={(e) => setNewPayment({ ...newPayment, payment_type: e.target.value })}
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      {PAYMENT_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Method</label>
                    <select
                      value={newPayment.payment_method}
                      onChange={(e) => setNewPayment({ ...newPayment, payment_method: e.target.value })}
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Notes (optional)"
                  value={newPayment.notes}
                  onChange={(e) => setNewPayment({ ...newPayment, notes: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddPayment}
                    disabled={addingPayment || !newPayment.amount}
                    className="flex-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors"
                  >
                    {addingPayment ? "Saving..." : "Save Payment"}
                  </button>
                  <button
                    onClick={() => setShowAddPayment(false)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {payments.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Payment History</p>
                {payments.map((payment) => (
                  <div key={payment.id} className={`rounded-md border p-2.5 flex items-center justify-between ${
                    payment.payment_method === "Sunlight Financial" || payment.payment_method === "Upgrade"
                      ? "border-orange-300 bg-orange-50 dark:bg-orange-950/20"
                      : "border-border bg-muted/20"
                  }`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-emerald-600">${Number(payment.amount).toLocaleString()}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{payment.payment_type}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          payment.payment_method === "Sunlight Financial" || payment.payment_method === "Upgrade"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-secondary text-secondary-foreground"
                        }`}>{payment.payment_method}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(payment.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        {payment.notes && ` · ${payment.notes}`}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeletePayment(payment.id, Number(payment.amount))}
                      className="text-muted-foreground hover:text-red-500 transition-colors ml-2"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-2">No payments recorded yet</p>
            )}
          </div>

          {/* Contact Info */}
          {!editMode && (
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
                  <span>Added {new Date(createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {!editMode && notes && (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-sm">{notes}</p>
            </div>
          )}

          {/* Move Stage */}
          {!editMode && onStageChange && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Move to stage</p>
              <div className="flex flex-wrap gap-2">
                {["new", "contacted", "appointment_set", "estimate_sent", "closed_won", "cancelled_appointment", "lost", "not_qualified"].map((s) => (
                  <button
                    key={s}
                    onClick={() => { onStageChange((lead as any).id, s); onOpenChange(false); }}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                      status === s ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted border-border"
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