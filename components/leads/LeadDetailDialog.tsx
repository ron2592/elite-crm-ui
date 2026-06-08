"use client";

import { useState, useEffect } from "react";
import { Lead } from "@/types";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "@/lib/useRole";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Phone, Mail, MapPin, Calendar, DollarSign, Save, Plus, X, Pencil, Archive, ChevronDown, ChevronUp, Trash2 } from "lucide-react";

const statusLabels: Record<string, string> = {
  new: "New Lead", open: "New Lead", contacted: "Qualified",
  appointment_set: "Appointment Set", estimate_sent: "Estimate Sent",
  closed_won: "Closed Won", won: "Closed Won", closed_lost: "Cancelled Appt",
  cancelled_appointment: "Cancelled Appt",
  completed:             "Completed",
  no_opportunity:        "No Opportunity", lost: "Lost", not_qualified: "Not Qualified",
};

const LSA_STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  charged:     { label: "Charged",     classes: "bg-emerald-100 text-emerald-700" },
  submitted:   { label: "Submitted",   classes: "bg-yellow-100 text-yellow-700" },
  credited:    { label: "Credited",    classes: "bg-orange-100 text-orange-700" },
  not_charged: { label: "Not Charged", classes: "bg-gray-100 text-gray-500" },
  in_review:   { label: "In Review",   classes: "bg-blue-100 text-blue-700" },
};

const PAYMENT_TYPES   = ["Deposit", "Progress Payment", "Final", "Installment"];
const PAYMENT_METHODS = ["Cash", "Check", "Zelle", "Credit Card", "Sunlight Financial", "Upgrade"];
const SALESPERSONS    = ["Ron", "Ray", "Other (Phone)"];

const STANDARD_JOB_TYPES = [
  "Roof Replacement", "Roof Repair", "Deck", "Siding",
  "Windows", "Painting", "Masonry", "Stucco", "Chimney",
];

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function toLocalDate(iso: string | null): string {
  if (!iso) return new Date().toISOString().split("T")[0];
  return new Date(iso).toISOString().split("T")[0];
}

function parseLeadName(leadName: string): { first: string; last: string } {
  const trimmed = (leadName || "").trim();
  if (!trimmed) return { first: "", last: "" };
  const stripped = trimmed.replace(/[\s\-\(\)\+\.]/g, "");
  if (/^\d{7,}$/.test(stripped)) return { first: "", last: "" };
  const parts = trimmed.split(" ");
  return { first: parts[0] || "", last: parts.slice(1).join(" ") || "" };
}

interface Payment { id: string; amount: number; payment_type: string; payment_method: string; paid_at: string; notes: string; }
interface ChangeOrder { id: string; order_number: number; description: string; job_type: string; amount: number; status: "pending" | "won" | "lost"; signed_at: string | null; payments: ChangeOrderPayment[]; }
interface ChangeOrderPayment { id: string; amount: number; payment_type: string; payment_method: string; paid_at: string; notes: string; }
interface LeadDetailDialogProps {
  lead: Lead | null; open: boolean;
  onOpenChange: (open: boolean) => void;
  onStageChange?: (leadId: string, newStatus: any) => void;
  onLeadUpdated?: (leadId: string) => void;
  onLeadDeleted?: () => void;
}

export default function LeadDetailDialog({ lead, open, onOpenChange, onStageChange, onLeadUpdated, onLeadDeleted }: LeadDetailDialogProps) {
  const { deleteLead, archiveLead, isAdmin, isManager } = useRole();

  const [estimatedAmount,              setEstimatedAmount]              = useState("");
  const [contractValue,                setContractValue]                = useState("");
  const [initialContractDescription,   setInitialContractDescription]   = useState("");
  const [saving,                       setSaving]                       = useState(false);
  const [saved,                        setSaved]                        = useState(false);
  const [payments,                     setPayments]                     = useState<Payment[]>([]);
  const [showAddPayment,               setShowAddPayment]               = useState(false);
  const [newPayment,                   setNewPayment]                   = useState({ amount: "", payment_type: "Deposit", payment_method: "Cash", paid_at: new Date().toISOString().split("T")[0], notes: "" });
  const [addingPayment,                setAddingPayment]                = useState(false);
  const [leadSources,                  setLeadSources]                  = useState<{ id: string; name: string }[]>([]);
  const [editMode,                     setEditMode]                     = useState(false);
  const [saveEditSuccess,              setSaveEditSuccess]              = useState(false);
  const [editFields,                   setEditFields]                   = useState({
    first_name: "", last_name: "", phone: "", email: "",
    address_line_1: "", city: "", state: "", zip: "",
    source_id: "", job_type: "", custom_job_type: "",
    salesperson: "", notes: "",
    lead_received_date: "",
  });
  const [editSaving,                   setEditSaving]                   = useState(false);
  const [archiving,                    setArchiving]                    = useState(false);
  const [deleting,                     setDeleting]                     = useState(false);
  const [zipLooking,                   setZipLooking]                   = useState(false);
  const [changeOrders,                 setChangeOrders]                 = useState<ChangeOrder[]>([]);
  const [showAddChangeOrder,           setShowAddChangeOrder]           = useState(false);
  const [newChangeOrder,               setNewChangeOrder]               = useState({ description: "", job_type: "", amount: "", status: "pending" as "pending" | "won" | "lost" });
  const [addingChangeOrder,            setAddingChangeOrder]            = useState(false);
  const [expandedChangeOrders,         setExpandedChangeOrders]         = useState<Set<string>>(new Set());
  const [showAddCOPayment,             setShowAddCOPayment]             = useState<string | null>(null);
  const [newCOPayment,                 setNewCOPayment]                 = useState({ amount: "", payment_type: "Deposit", payment_method: "Cash", paid_at: new Date().toISOString().split("T")[0], notes: "" });
  const [addingCOPayment,              setAddingCOPayment]              = useState(false);
  const [appointmentAt,                setAppointmentAt]                = useState("");
  const [appointmentNotes,             setAppointmentNotes]             = useState("");
  const [savingAppointment,            setSavingAppointment]            = useState(false);
  const [savedAppointment,             setSavedAppointment]             = useState(false);
  const [reasonLost,                   setReasonLost]                   = useState("");
  const [savingReasonLost,             setSavingReasonLost]             = useState(false);
  const [savedReasonLost,              setSavedReasonLost]              = useState(false);
  const [currentStatus,                setCurrentStatus]                = useState<string>((lead as any)?.status || "new");
  const [inlineSalesperson,            setInlineSalesperson]            = useState<string>("");
  const [savingInlineSalesperson,      setSavingInlineSalesperson]      = useState(false);
  const [inlineJobType,                setInlineJobType]                = useState<string>("");
  const [inlineCustomJobType,          setInlineCustomJobType]          = useState<string>("");
  const [savingInlineJobType,          setSavingInlineJobType]          = useState(false);
  const [lsaStatus,                    setLsaStatus]                    = useState<string>("not_charged");
  const [savingLsaStatus,              setSavingLsaStatus]              = useState(false);
  const [contactType,                  setContactType]                  = useState<string>("");
  const [savingContactType,            setSavingContactType]            = useState(false);

  const leadId = (lead as any)?.id;
  const inlineJobTypeDropdownVal = STANDARD_JOB_TYPES.includes(inlineJobType) ? inlineJobType : inlineJobType ? "Other" : "";

  useEffect(() => {
    if (lead) {
      const raw = lead as any;
      const jobType = raw.metadata?.job_type || "";
      setCurrentStatus(raw.status || "new");
      setInlineSalesperson(raw.metadata?.salesperson || "");
      setInlineJobType(jobType);
      setInlineCustomJobType(STANDARD_JOB_TYPES.includes(jobType) ? "" : jobType);
      setLsaStatus(raw.lsa_status || "not_charged");
      setContactType(raw.contact_type || "");
    }
  }, [lead]);

  useEffect(() => {
    if (open && leadId) {
      fetchPayments(); fetchLeadSources(); fetchChangeOrders();
      const raw = lead as any;
      if (raw?.appointment_at) {
        const d = new Date(raw.appointment_at);
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        setAppointmentAt(local);
      }
      if (raw?.appointment_notes) setAppointmentNotes(raw.appointment_notes);
      if (raw?.metadata?.reason_lost) setReasonLost(raw.metadata.reason_lost);
    }
  }, [open, leadId]);

  useEffect(() => {
    if (lead && editMode) {
      const l = lead as any;
      const jobType  = l.metadata?.job_type || "";
      const isCustom = jobType && !STANDARD_JOB_TYPES.includes(jobType);
      const parsed = parseLeadName(l.lead_name || "");
      setEditFields({
        first_name:         l.first_name || parsed.first,
        last_name:          l.last_name  || parsed.last,
        phone:              l.phone              || "",
        email:              l.email              || "",
        address_line_1:     l.address_line_1     || l.client_address || "",
        city:               l.city               || l.client_city    || "",
        state:              l.state              || l.client_state   || "",
        zip:                l.zip                || l.postal_code    || l.client_zip || "",
        source_id:          l.source_id          || "",
        job_type:           isCustom ? "Other"   : jobType,
        custom_job_type:    isCustom ? jobType   : "",
        salesperson:        l.metadata?.salesperson || "",
        notes:              l.metadata?.notes    || "",
        lead_received_date: toLocalDate(l.created_at),
      });
    }
  }, [editMode, lead]);

  async function fetchPayments() {
    const { data } = await supabase.from("payments").select("*").eq("lead_id", leadId).order("paid_at", { ascending: false });
    setPayments(data || []);
  }
  async function fetchLeadSources() {
    const { data } = await supabase.from("lead_sources").select("id, name").order("name");
    setLeadSources(data || []);
  }
  async function fetchChangeOrders() {
    const { data: orders } = await supabase.from("change_orders").select("*").eq("lead_id", leadId).order("order_number", { ascending: true });
    if (!orders) { setChangeOrders([]); return; }
    const ordersWithPayments = await Promise.all(orders.map(async (order) => {
      const { data: coPayments } = await supabase.from("change_order_payments").select("*").eq("change_order_id", order.id).order("paid_at", { ascending: false });
      return { ...order, payments: coPayments || [] };
    }));
    setChangeOrders(ordersWithPayments);
  }
  async function handleZipLookup(zip: string) {
    if (zip.length !== 5) return;
    setZipLooking(true);
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
      if (res.ok) {
        const data = await res.json();
        const place = data.places?.[0];
        if (place) setEditFields(prev => ({ ...prev, city: place["place name"] || prev.city, state: place["state abbreviation"] || prev.state }));
      }
    } catch (_) {}
    setZipLooking(false);
  }

  if (!lead) return null;
  const l = lead as any;
  const displayName = l.lead_name || `${l.first_name || ""} ${l.last_name || ""}`.trim() || "Unnamed Lead";
  const initials    = displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
  const phone       = l.phone || "No phone";
  const email       = l.email || "No email";
  const address     = (l.address_line_1 || l.client_address)
    ? `${l.address_line_1 || l.client_address}${(l.city || l.client_city) ? ", " + (l.city || l.client_city) : ""}${(l.state || l.client_state) ? ", " + (l.state || l.client_state) : ""}`
    : "No address";
  const source      = l.lead_sources?.name || l.source_email || l.metadata?.lead_source || "No source";
  const jobType     = inlineJobType || l.metadata?.job_type || "";
  const notes       = l.metadata?.notes || "";
  const createdAt   = l.created_at;
  const currentEstimated = Number(l.estimated_amount || 0);
  const currentContract  = contractValue !== "" ? Number(contractValue) : Number(l.initial_contract_value || 0);
  const totalCollected   = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const balance          = currentContract > 0 ? currentContract - totalCollected : 0;
  const isFinancing      = payments.some(p => p.payment_method === "Sunlight Financial" || p.payment_method === "Upgrade");

  const isAppointmentStage = ["appointment_set", "cancelled_appointment", "closed_lost"].includes(currentStatus);
  const isEstimateSent     = currentStatus === "estimate_sent";
  const isClosedWon        = ["closed_won", "won", "completed"].includes(currentStatus);
  const isLost             = currentStatus === "lost";
  const showFullContract   = isClosedWon || isLost;

  const handleLsaStatusChange = async (val: string) => {
    setLsaStatus(val); setSavingLsaStatus(true);
    await supabase.from("leads").update({ lsa_status: val }).eq("id", leadId);
    setSavingLsaStatus(false);
    if (onLeadUpdated) onLeadUpdated(leadId);
  };
  const handleContactTypeChange = async (val: string) => {
    const next = contactType === val ? "" : val;
    setContactType(next); setSavingContactType(true);
    await supabase.from("leads").update({ contact_type: next || null }).eq("id", leadId);
    setSavingContactType(false);
    if (onLeadUpdated) onLeadUpdated(leadId);
  };
  const handleInlineSalespersonChange = async (val: string) => {
    setInlineSalesperson(val); setSavingInlineSalesperson(true);
    await supabase.from("leads").update({ metadata: { ...l.metadata, salesperson: val || null } }).eq("id", leadId);
    setSavingInlineSalesperson(false);
    if (onLeadUpdated) onLeadUpdated(leadId);
  };
  const handleInlineJobTypeSave = async (val: string) => {
    const finalVal = val === "Other" ? inlineCustomJobType : val;
    if (!finalVal && val === "Other") return;
    setInlineJobType(finalVal); setSavingInlineJobType(true);
    await supabase.from("leads").update({ metadata: { ...l.metadata, job_type: finalVal || null } }).eq("id", leadId);
    setSavingInlineJobType(false);
    if (onLeadUpdated) onLeadUpdated(leadId);
  };
  const handleSaveAmounts = async () => {
    setSaving(true);
    const updates: any = {};
    if (estimatedAmount !== "")            updates.estimated_amount       = Number(estimatedAmount);
    if (contractValue !== "")              updates.initial_contract_value = Number(contractValue);
    if (initialContractDescription !== "") updates.metadata               = { ...l.metadata, initial_contract_description: initialContractDescription };
    if (Object.keys(updates).length > 0) await supabase.from("leads").update(updates).eq("id", leadId);
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };
  const handleSaveEstimate = async () => {
    if (!estimatedAmount) return;
    setSaving(true);
    await supabase.from("leads").update({ estimated_amount: Number(estimatedAmount) }).eq("id", leadId);
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
    if (onLeadUpdated) onLeadUpdated(leadId);
  };
  const handleSaveEdit = async () => {
    setEditSaving(true);
    const fullName     = `${editFields.first_name} ${editFields.last_name}`.trim();
    const finalJobType = editFields.job_type === "Other" ? editFields.custom_job_type : editFields.job_type;
    const updates: any = {
      lead_name:      fullName || l.lead_name,
      phone:          editFields.phone,
      email:          editFields.email,
      client_address: editFields.address_line_1,
      client_city:    editFields.city,
      client_state:   editFields.state,
      client_zip:     editFields.zip,
      metadata: { ...l.metadata, job_type: finalJobType || null, salesperson: editFields.salesperson || null, notes: editFields.notes || null },
    };
    if (editFields.source_id) updates.source_id = editFields.source_id;
    if (editFields.lead_received_date) updates.created_at = new Date(editFields.lead_received_date + "T00:00:00").toISOString();
    const { error } = await supabase.from("leads").update(updates).eq("id", leadId);
    setEditSaving(false);
    if (error) { alert("Failed to save: " + error.message); return; }
    setInlineSalesperson(editFields.salesperson || "");
    setInlineJobType(finalJobType || "");
    setInlineCustomJobType(STANDARD_JOB_TYPES.includes(finalJobType) ? "" : finalJobType);
    setEditMode(false); setSaveEditSuccess(true); setTimeout(() => setSaveEditSuccess(false), 3000);
    if (onLeadUpdated) onLeadUpdated(leadId);
  };
  const handleArchive = async () => {
    if (!confirm("Archive this lead? You can restore it later.")) return;
    setArchiving(true);
    await supabase.from("leads").update({ archived: true }).eq("id", leadId);
    setArchiving(false); onOpenChange(false);
  };
  const handleDelete = async () => {
    if (!confirm(`Permanently delete "${displayName}"? This will delete all payments and change orders.`)) return;
    if (!confirm("Are you sure? This cannot be undone.")) return;
    setDeleting(true);
    await supabase.from("change_order_payments").delete().eq("lead_id", leadId);
    await supabase.from("change_orders").delete().eq("lead_id", leadId);
    await supabase.from("payments").delete().eq("lead_id", leadId);
    await supabase.from("leads").delete().eq("id", leadId);
    setDeleting(false); onOpenChange(false);
    if (onLeadDeleted) onLeadDeleted();
  };
  const handleAddPayment = async () => {
    if (!newPayment.amount || Number(newPayment.amount) <= 0) return;
    setAddingPayment(true);
    const { error } = await supabase.from("payments").insert({ lead_id: leadId, amount: Number(newPayment.amount), payment_type: newPayment.payment_type, payment_method: newPayment.payment_method, paid_at: newPayment.paid_at, notes: newPayment.notes || null });
    if (!error) {
      await supabase.from("leads").update({ closed_amount: totalCollected + Number(newPayment.amount) }).eq("id", leadId);
      await fetchPayments();
      setNewPayment({ amount: "", payment_type: "Deposit", payment_method: "Cash", paid_at: new Date().toISOString().split("T")[0], notes: "" });
      setShowAddPayment(false);
    }
    setAddingPayment(false);
  };
  const handleDeletePayment = async (paymentId: string, amount: number) => {
    await supabase.from("payments").delete().eq("id", paymentId);
    await supabase.from("leads").update({ closed_amount: totalCollected - amount }).eq("id", leadId);
    await fetchPayments();
  };
  const handleAddChangeOrder = async () => {
    if (!newChangeOrder.amount || Number(newChangeOrder.amount) <= 0) return;
    setAddingChangeOrder(true);
    const { error } = await supabase.from("change_orders").insert({ lead_id: leadId, order_number: changeOrders.length + 1, description: newChangeOrder.description || null, job_type: newChangeOrder.job_type || null, amount: Number(newChangeOrder.amount), status: newChangeOrder.status, signed_at: newChangeOrder.status === "won" ? new Date().toISOString() : null });
    if (!error) { await fetchChangeOrders(); setNewChangeOrder({ description: "", job_type: "", amount: "", status: "pending" }); setShowAddChangeOrder(false); }
    setAddingChangeOrder(false);
  };
  const handleUpdateCOStatus = async (coId: string, newStatus: "pending" | "won" | "lost") => {
    await supabase.from("change_orders").update({ status: newStatus, signed_at: newStatus === "won" ? new Date().toISOString() : null }).eq("id", coId);
    await fetchChangeOrders();
  };
  const handleAddCOPayment = async (coId: string) => {
    if (!newCOPayment.amount || Number(newCOPayment.amount) <= 0) return;
    setAddingCOPayment(true);
    const { error } = await supabase.from("change_order_payments").insert({ change_order_id: coId, lead_id: leadId, amount: Number(newCOPayment.amount), payment_type: newCOPayment.payment_type, payment_method: newCOPayment.payment_method, paid_at: newCOPayment.paid_at, notes: newCOPayment.notes || null });
    if (!error) { await fetchChangeOrders(); setNewCOPayment({ amount: "", payment_type: "Deposit", payment_method: "Cash", paid_at: new Date().toISOString().split("T")[0], notes: "" }); setShowAddCOPayment(null); }
    setAddingCOPayment(false);
  };
  const handleDeleteCOPayment = async (paymentId: string) => {
    await supabase.from("change_order_payments").delete().eq("id", paymentId);
    await fetchChangeOrders();
  };
  const handleSaveAppointment = async () => {
    if (!appointmentAt) return;
    setSavingAppointment(true);
    await supabase.from("leads").update({ appointment_at: new Date(appointmentAt).toISOString(), appointment_notes: appointmentNotes || null }).eq("id", leadId);
    setSavingAppointment(false); setSavedAppointment(true);
    setTimeout(() => setSavedAppointment(false), 2000);
    if (onLeadUpdated) onLeadUpdated(leadId);
  };
  const handleSaveReasonLost = async () => {
    setSavingReasonLost(true);
    await supabase.from("leads").update({ metadata: { ...l.metadata, reason_lost: reasonLost || null } }).eq("id", leadId);
    setSavingReasonLost(false); setSavedReasonLost(true);
    setTimeout(() => setSavedReasonLost(false), 2000);
  };
  const handleStageChange = (newStage: string) => {
    setCurrentStatus(newStage);
    if (onStageChange) onStageChange(leadId, newStage);
  };
  const handleOpen = (val: boolean) => {
    if (!val) {
      setEstimatedAmount(""); setContractValue(""); setInitialContractDescription("");
      setSaved(false); setShowAddPayment(false); setEditMode(false);
      setSaveEditSuccess(false); setShowAddChangeOrder(false); setShowAddCOPayment(null);
      setAppointmentAt(""); setAppointmentNotes(""); setSavedAppointment(false);
      setReasonLost(""); setSavedReasonLost(false);
      setLsaStatus("not_charged"); setContactType("");
    }
    onOpenChange(val);
  };
  const toggleCOExpand = (coId: string) => {
    setExpandedChangeOrders(prev => { const next = new Set(prev); next.has(coId) ? next.delete(coId) : next.add(coId); return next; });
  };
  const coStatusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    won:     "bg-emerald-100 text-emerald-700",
    lost:    "bg-red-100 text-red-600",
  };
  const ContactTypeToggle = () => (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact Type</p>
        {savingContactType && <span className="text-xs text-blue-400">saving...</span>}
      </div>
      <div className="flex gap-2">
        <button onClick={() => handleContactTypeChange("in_person")}
          className={`flex-1 text-xs px-3 py-2 rounded-md border font-medium transition-colors ${contactType === "in_person" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted text-muted-foreground"}`}>
          🏠 In-Person Visit
        </button>
        <button onClick={() => handleContactTypeChange("phone_quote")}
          className={`flex-1 text-xs px-3 py-2 rounded-md border font-medium transition-colors ${contactType === "phone_quote" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted text-muted-foreground"}`}>
          📞 Phone Quote
        </button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{initials}</div>
              <div>
                <DialogTitle className="flex items-center gap-2">
                  {displayName}
                  {isFinancing && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 font-medium">Financing</span>}
                </DialogTitle>
                <DialogDescription>{source} {jobType ? `· ${jobType}` : ""}</DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2 mr-6">
              {/* Edit — always visible */}
              <button onClick={() => setEditMode(!editMode)}
                className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border transition-colors ${editMode ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
                <Pencil className="h-3 w-3" />{editMode ? "Editing" : "Edit"}
              </button>
              {/* Archive — managers/admins only */}
              {archiveLead && (
                <button onClick={handleArchive} disabled={archiving}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-colors disabled:opacity-40">
                  <Archive className="h-3 w-3" />{archiving ? "..." : "Archive"}
                </button>
              )}
              {/* Delete — admins only */}
              {deleteLead && (
                <button onClick={handleDelete} disabled={deleting}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-red-100 hover:text-red-700 hover:border-red-400 transition-colors disabled:opacity-40">
                  <Trash2 className="h-3 w-3" />{deleting ? "..." : "Delete"}
                </button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {saveEditSuccess && (
            <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-sm text-emerald-600 font-medium">
              ✓ Lead updated successfully
            </div>
          )}

          {/* ── EDIT MODE ── */}
          {editMode && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">Edit Lead Info</p>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-muted-foreground block mb-1">First Name</label><input value={editFields.first_name} onChange={(e) => setEditFields({ ...editFields, first_name: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" /></div>
                <div><label className="text-xs text-muted-foreground block mb-1">Last Name</label><input value={editFields.last_name} onChange={(e) => setEditFields({ ...editFields, last_name: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-muted-foreground block mb-1">Phone</label><input value={editFields.phone} onChange={(e) => setEditFields({ ...editFields, phone: formatPhone(e.target.value) })} placeholder="(201) 555-0000" className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" /></div>
                <div><label className="text-xs text-muted-foreground block mb-1">Email</label><input value={editFields.email} onChange={(e) => setEditFields({ ...editFields, email: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" /></div>
              </div>
              <div><label className="text-xs text-muted-foreground block mb-1">Address</label><input value={editFields.address_line_1} onChange={(e) => setEditFields({ ...editFields, address_line_1: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><label className="text-xs text-muted-foreground block mb-1">Zip {zipLooking && <span className="text-blue-500">...</span>}</label><input value={editFields.zip} maxLength={5} placeholder="07011" onChange={(e) => { const val = e.target.value.replace(/\D/g, "").slice(0, 5); setEditFields({ ...editFields, zip: val }); if (val.length === 5) handleZipLookup(val); }} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" /></div>
                <div><label className="text-xs text-muted-foreground block mb-1">City</label><input value={editFields.city} onChange={(e) => setEditFields({ ...editFields, city: e.target.value })} placeholder="Auto-filled" className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" /></div>
                <div><label className="text-xs text-muted-foreground block mb-1">State</label><input value={editFields.state} onChange={(e) => setEditFields({ ...editFields, state: e.target.value })} placeholder="Auto-filled" className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Lead Source</label>
                  <select value={editFields.source_id} onChange={(e) => setEditFields({ ...editFields, source_id: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                    <option value="">— Select source —</option>
                    {leadSources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Job Type</label>
                  <select value={editFields.job_type} onChange={(e) => setEditFields({ ...editFields, job_type: e.target.value, custom_job_type: "" })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                    <option value="">— Select type —</option>
                    {STANDARD_JOB_TYPES.map((t) => <option key={t}>{t}</option>)}
                    <option value="Other">Other (type below)</option>
                  </select>
                  {editFields.job_type === "Other" && (
                    <input type="text" placeholder="e.g. Gutters, Insulation..." value={editFields.custom_job_type} onChange={(e) => setEditFields({ ...editFields, custom_job_type: e.target.value })} className="mt-1.5 w-full rounded-md border border-primary/40 bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" autoFocus />
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Salesperson</label>
                <select value={editFields.salesperson} onChange={(e) => setEditFields({ ...editFields, salesperson: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                  <option value="">— Select salesperson —</option>
                  {SALESPERSONS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Notes</label>
                <textarea value={editFields.notes} onChange={(e) => setEditFields({ ...editFields, notes: e.target.value })} rows={3} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Lead Received Date</label>
                <input type="date" value={editFields.lead_received_date} onChange={(e) => setEditFields({ ...editFields, lead_received_date: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                <p className="text-xs text-muted-foreground mt-1">This updates when the lead was received in the system.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveEdit} disabled={editSaving}
                  className="flex-1 flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors">
                  <Save className="h-4 w-4" />{editSaving ? "Saving..." : "Save Changes"}
                </button>
                <button onClick={() => setEditMode(false)} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {/* ── STATUS CARDS ── */}
          {!editMode && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <p className="font-semibold text-sm">{statusLabels[currentStatus] || currentStatus}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">Salesperson {savingInlineSalesperson && <span className="text-blue-400 text-xs">saving...</span>}</p>
                <select value={inlineSalesperson} onChange={(e) => handleInlineSalespersonChange(e.target.value)} className="w-full bg-transparent font-semibold text-sm focus:outline-none cursor-pointer">
                  <option value="">Not assigned</option>
                  {SALESPERSONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">LSA Status {savingLsaStatus && <span className="text-blue-400 text-xs">saving...</span>}</p>
                <div className="flex items-center gap-2">
                  <select value={lsaStatus} onChange={(e) => handleLsaStatusChange(e.target.value)} className="w-full bg-transparent font-semibold text-sm focus:outline-none cursor-pointer">
                    {Object.entries(LSA_STATUS_CONFIG).map(([val, cfg]) => <option key={val} value={val}>{cfg.label}</option>)}
                  </select>
                  {lsaStatus && <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${LSA_STATUS_CONFIG[lsaStatus]?.classes || ""}`}>{LSA_STATUS_CONFIG[lsaStatus]?.label}</span>}
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">Job Type {savingInlineJobType && <span className="text-blue-400 text-xs">saving...</span>}</p>
                <select value={inlineJobTypeDropdownVal} onChange={(e) => { const val = e.target.value; if (val !== "Other") { setInlineCustomJobType(""); handleInlineJobTypeSave(val); } else { setInlineJobType("Other"); } }} className="w-full bg-transparent font-semibold text-sm focus:outline-none cursor-pointer">
                  <option value="">— Select type —</option>
                  {STANDARD_JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  <option value="Other">Other (type below)</option>
                </select>
                {inlineJobTypeDropdownVal === "Other" && (
                  <div className="flex gap-1 mt-1.5">
                    <input type="text" placeholder="e.g. Gutters, Insulation..." value={inlineCustomJobType} onChange={(e) => setInlineCustomJobType(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleInlineJobTypeSave("Other"); }} className="flex-1 rounded-md border border-primary/40 bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" autoFocus />
                    <button onClick={() => handleInlineJobTypeSave("Other")} disabled={!inlineCustomJobType.trim()} className="text-xs px-2 py-1 rounded-md bg-primary text-primary-foreground disabled:opacity-40">Save</button>
                  </div>
                )}
              </div>
              {source && source !== "No source" && (
                <div className="rounded-lg bg-muted/50 p-3 col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Lead Source</p>
                  <p className="font-semibold text-sm">{source}</p>
                </div>
              )}
            </div>
          )}

          {/* ── APPOINTMENT ── */}
          {!editMode && isAppointmentStage && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-3">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide flex items-center gap-1"><Calendar className="h-3 w-3" /> Appointment</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-muted-foreground block mb-1">Date &amp; Time</label><input type="datetime-local" value={appointmentAt} onChange={(e) => setAppointmentAt(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40" /></div>
                <div><label className="text-xs text-muted-foreground block mb-1">Notes</label><input type="text" placeholder="e.g. Meet at front door" value={appointmentNotes} onChange={(e) => setAppointmentNotes(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40" /></div>
              </div>
              <button onClick={handleSaveAppointment} disabled={savingAppointment || !appointmentAt} className="w-full flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <Save className="h-4 w-4" />{savingAppointment ? "Saving..." : savedAppointment ? "Saved ✓" : "Save Appointment"}
              </button>
            </div>
          )}

          {/* ── ESTIMATE ── */}
          {!editMode && isEstimateSent && (
            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1"><DollarSign className="h-3 w-3" /> Estimate</p>
              <ContactTypeToggle />
              <div><label className="text-xs text-muted-foreground mb-1 block">Estimated Amount <span className="text-foreground font-medium">(${currentEstimated.toLocaleString()})</span></label><input type="number" placeholder={String(currentEstimated)} value={estimatedAmount} onChange={(e) => setEstimatedAmount(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" /></div>
              <button onClick={handleSaveEstimate} disabled={saving || estimatedAmount === ""} className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <Save className="h-4 w-4" />{saving ? "Saving..." : saved ? "Saved ✓" : "Save Estimate"}
              </button>
            </div>
          )}

          {/* ── FULL CONTRACT ── */}
          {!editMode && showFullContract && (
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1"><DollarSign className="h-3 w-3" /> Initial Contract</p>
                {jobType && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{jobType}</span>}
              </div>
              <ContactTypeToggle />
              {l.metadata?.initial_contract_description && <p className="text-xs text-muted-foreground italic">{l.metadata.initial_contract_description}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-muted-foreground mb-1 block">Estimated Amount <span className="text-foreground font-medium">(${currentEstimated.toLocaleString()})</span></label><input type="number" placeholder={String(currentEstimated)} value={estimatedAmount} onChange={(e) => setEstimatedAmount(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">Contract Value <span className="text-foreground font-medium">(${Number(l.initial_contract_value || 0).toLocaleString()})</span></label><input type="number" placeholder={String(Number(l.initial_contract_value || 0))} value={contractValue} onChange={(e) => setContractValue(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" /></div>
              </div>
              <div><label className="text-xs text-muted-foreground mb-1 block">Description</label><input type="text" placeholder={l.metadata?.initial_contract_description || "e.g. Full roof replacement, 28 squares..."} value={initialContractDescription} onChange={(e) => setInitialContractDescription(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" /></div>
              <button onClick={handleSaveAmounts} disabled={saving || (estimatedAmount === "" && contractValue === "" && initialContractDescription === "")} className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <Save className="h-4 w-4" />{saving ? "Saving..." : saved ? "Saved ✓" : "Save Contract"}
              </button>
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Payments</p>
                  <button onClick={() => setShowAddPayment(!showAddPayment)} className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"><Plus className="h-3 w-3" /> Add Payment</button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-muted/50 p-2"><p className="text-xs text-muted-foreground">Contract</p><p className="font-bold text-sm">${currentContract.toLocaleString()}</p></div>
                  <div className="rounded-md bg-emerald-500/10 p-2"><p className="text-xs text-muted-foreground">Collected</p><p className="font-bold text-sm text-emerald-600">${totalCollected.toLocaleString()}</p></div>
                  <div className={`rounded-md p-2 ${balance > 0 ? "bg-red-500/10" : "bg-emerald-500/10"}`}><p className="text-xs text-muted-foreground">Balance</p><p className={`font-bold text-sm ${balance > 0 ? "text-red-500" : "text-emerald-600"}`}>${balance.toLocaleString()}</p></div>
                </div>
                {showAddPayment && (
                  <div className="rounded-md border border-border p-3 space-y-2 bg-muted/20">
                    <p className="text-xs font-semibold">New Payment</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="text-xs text-muted-foreground block mb-1">Amount</label><input type="number" placeholder="0" value={newPayment.amount} onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" /></div>
                      <div><label className="text-xs text-muted-foreground block mb-1">Date</label><input type="date" value={newPayment.paid_at} onChange={(e) => setNewPayment({ ...newPayment, paid_at: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="text-xs text-muted-foreground block mb-1">Type</label><select value={newPayment.payment_type} onChange={(e) => setNewPayment({ ...newPayment, payment_type: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">{PAYMENT_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
                      <div><label className="text-xs text-muted-foreground block mb-1">Method</label><select value={newPayment.payment_method} onChange={(e) => setNewPayment({ ...newPayment, payment_method: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">{PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}</select></div>
                    </div>
                    <input type="text" placeholder="Notes (optional)" value={newPayment.notes} onChange={(e) => setNewPayment({ ...newPayment, notes: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                    <div className="flex gap-2">
                      <button onClick={handleAddPayment} disabled={addingPayment || !newPayment.amount} className="flex-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors">{addingPayment ? "Saving..." : "Save Payment"}</button>
                      <button onClick={() => setShowAddPayment(false)} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors">Cancel</button>
                    </div>
                  </div>
                )}
                {payments.length > 0 ? (
                  <div className="space-y-1.5">
                    {payments.map((payment) => (
                      <div key={payment.id} className={`rounded-md border p-2.5 flex items-center justify-between ${payment.payment_method === "Sunlight Financial" || payment.payment_method === "Upgrade" ? "border-orange-300 bg-orange-50 dark:bg-orange-950/20" : "border-border bg-muted/20"}`}>
                        <div>
                          <div className="flex items-center gap-2"><span className="text-sm font-bold text-emerald-600">${Number(payment.amount).toLocaleString()}</span><span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{payment.payment_type}</span><span className={`text-xs px-1.5 py-0.5 rounded ${payment.payment_method === "Sunlight Financial" || payment.payment_method === "Upgrade" ? "bg-orange-100 text-orange-700" : "bg-secondary text-secondary-foreground"}`}>{payment.payment_method}</span></div>
                          <p className="text-xs text-muted-foreground mt-0.5">{new Date(payment.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}{payment.notes && ` · ${payment.notes}`}</p>
                        </div>
                        {isManager && (
                          <button onClick={() => handleDeletePayment(payment.id, Number(payment.amount))} className="text-muted-foreground hover:text-red-500 transition-colors ml-2"><X className="h-3.5 w-3.5" /></button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-muted-foreground text-center py-1">No payments recorded yet</p>}
              </div>
            </div>
          )}

          {/* ── CHANGE ORDERS ── */}
          {!editMode && showFullContract && (
            <>
              {changeOrders.map((co) => {
                const coCollected = co.payments.reduce((sum, p) => sum + Number(p.amount), 0);
                const coBalance   = Number(co.amount) - coCollected;
                const isExpanded  = expandedChangeOrders.has(co.id);
                return (
                  <div key={co.id} className="rounded-lg border border-border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Change Order #{co.order_number}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${coStatusColors[co.status]}`}>{co.status.charAt(0).toUpperCase() + co.status.slice(1)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <select value={co.status} onChange={(e) => handleUpdateCOStatus(co.id, e.target.value as any)} className="text-xs rounded-md border border-border bg-background px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/40"><option value="pending">Pending</option><option value="won">Won</option><option value="lost">Lost</option></select>
                        <button onClick={() => toggleCOExpand(co.id)} className="text-muted-foreground hover:text-foreground transition-colors">{isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      {co.job_type && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{co.job_type}</span>}
                      {co.description && <span className="text-xs text-muted-foreground">{co.description}</span>}
                      <span className="text-sm font-bold ml-auto">${Number(co.amount).toLocaleString()}</span>
                    </div>
                    {isExpanded && (
                      <div className="space-y-2 pt-1">
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-md bg-muted/50 p-2"><p className="text-xs text-muted-foreground">Contract</p><p className="font-bold text-sm">${Number(co.amount).toLocaleString()}</p></div>
                          <div className="rounded-md bg-emerald-500/10 p-2"><p className="text-xs text-muted-foreground">Collected</p><p className="font-bold text-sm text-emerald-600">${coCollected.toLocaleString()}</p></div>
                          <div className={`rounded-md p-2 ${coBalance > 0 ? "bg-red-500/10" : "bg-emerald-500/10"}`}><p className="text-xs text-muted-foreground">Balance</p><p className={`font-bold text-sm ${coBalance > 0 ? "text-red-500" : "text-emerald-600"}`}>${coBalance.toLocaleString()}</p></div>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-muted-foreground">Payment History</p>
                          {co.status === "won" && <button onClick={() => setShowAddCOPayment(showAddCOPayment === co.id ? null : co.id)} className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"><Plus className="h-3 w-3" /> Add Payment</button>}
                        </div>
                        {showAddCOPayment === co.id && (
                          <div className="rounded-md border border-border p-3 space-y-2 bg-muted/20">
                            <div className="grid grid-cols-2 gap-2">
                              <div><label className="text-xs text-muted-foreground block mb-1">Amount</label><input type="number" placeholder="0" value={newCOPayment.amount} onChange={(e) => setNewCOPayment({ ...newCOPayment, amount: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" /></div>
                              <div><label className="text-xs text-muted-foreground block mb-1">Date</label><input type="date" value={newCOPayment.paid_at} onChange={(e) => setNewCOPayment({ ...newCOPayment, paid_at: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div><label className="text-xs text-muted-foreground block mb-1">Type</label><select value={newCOPayment.payment_type} onChange={(e) => setNewCOPayment({ ...newCOPayment, payment_type: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">{PAYMENT_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
                              <div><label className="text-xs text-muted-foreground block mb-1">Method</label><select value={newCOPayment.payment_method} onChange={(e) => setNewCOPayment({ ...newCOPayment, payment_method: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">{PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}</select></div>
                            </div>
                            <input type="text" placeholder="Notes (optional)" value={newCOPayment.notes} onChange={(e) => setNewCOPayment({ ...newCOPayment, notes: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                            <div className="flex gap-2">
                              <button onClick={() => handleAddCOPayment(co.id)} disabled={addingCOPayment || !newCOPayment.amount} className="flex-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors">{addingCOPayment ? "Saving..." : "Save Payment"}</button>
                              <button onClick={() => setShowAddCOPayment(null)} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors">Cancel</button>
                            </div>
                          </div>
                        )}
                        {co.payments.length > 0 ? (
                          <div className="space-y-1.5">
                            {co.payments.map((p) => (
                              <div key={p.id} className="rounded-md border border-border bg-muted/20 p-2.5 flex items-center justify-between">
                                <div>
                                  <div className="flex items-center gap-2"><span className="text-sm font-bold text-emerald-600">${Number(p.amount).toLocaleString()}</span><span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{p.payment_type}</span><span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{p.payment_method}</span></div>
                                  <p className="text-xs text-muted-foreground mt-0.5">{new Date(p.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}{p.notes && ` · ${p.notes}`}</p>
                                </div>
                                {isManager && (
                                  <button onClick={() => handleDeleteCOPayment(p.id)} className="text-muted-foreground hover:text-red-500 transition-colors ml-2"><X className="h-3.5 w-3.5" /></button>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : <p className="text-xs text-muted-foreground text-center py-1">No payments recorded yet</p>}
                      </div>
                    )}
                  </div>
                );
              })}
              {!showAddChangeOrder ? (
                <button onClick={() => setShowAddChangeOrder(true)} className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"><Plus className="h-3.5 w-3.5" /> Add Change Order</button>
              ) : (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wide">New Change Order</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-xs text-muted-foreground block mb-1">Job Type</label><select value={newChangeOrder.job_type} onChange={(e) => setNewChangeOrder({ ...newChangeOrder, job_type: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"><option value="">— Select type —</option>{STANDARD_JOB_TYPES.map(t => <option key={t}>{t}</option>)}<option value="Other">Other</option></select></div>
                    <div><label className="text-xs text-muted-foreground block mb-1">Amount</label><input type="number" placeholder="0" value={newChangeOrder.amount} onChange={(e) => setNewChangeOrder({ ...newChangeOrder, amount: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" /></div>
                  </div>
                  <div><label className="text-xs text-muted-foreground block mb-1">Description</label><input type="text" placeholder="e.g. Add deck, replace gutters..." value={newChangeOrder.description} onChange={(e) => setNewChangeOrder({ ...newChangeOrder, description: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" /></div>
                  <div><label className="text-xs text-muted-foreground block mb-1">Status</label><select value={newChangeOrder.status} onChange={(e) => setNewChangeOrder({ ...newChangeOrder, status: e.target.value as any })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"><option value="pending">Pending</option><option value="won">Won</option><option value="lost">Lost</option></select></div>
                  <div className="flex gap-2">
                    <button onClick={handleAddChangeOrder} disabled={addingChangeOrder || !newChangeOrder.amount} className="flex-1 flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"><Save className="h-4 w-4" />{addingChangeOrder ? "Saving..." : "Save Change Order"}</button>
                    <button onClick={() => setShowAddChangeOrder(false)} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted transition-colors">Cancel</button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── REASON LOST ── */}
          {!editMode && isLost && (
            <div className="rounded-lg border border-red-200 bg-red-50/50 dark:bg-red-950/20 p-4 space-y-3">
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Reason Lost</p>
              <textarea rows={3} placeholder="e.g. Price too high, went with another contractor..." value={reasonLost} onChange={(e) => setReasonLost(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400/40 resize-none" />
              <button onClick={handleSaveReasonLost} disabled={savingReasonLost || !reasonLost} className="w-full flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <Save className="h-4 w-4" />{savingReasonLost ? "Saving..." : savedReasonLost ? "Saved ✓" : "Save Reason"}
              </button>
            </div>
          )}

          {/* ── JN SYNC STATUS ── */}
          {!editMode && (
            <div className="flex items-center gap-2 pb-1">
              {l.jn_contact_id ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
                  ✓ Synced to JobNimbus
                </span>
              ) : l.jn_sync_status === 'error' ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-full px-3 py-1">
                  ✕ JN Sync Failed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded-full px-3 py-1">
                  ○ Not Synced to JN
                </span>
              )}
            </div>
          )}

          {/* ── CONTACT INFO ── */}
          {!editMode && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5 text-sm"><Phone className="h-4 w-4 text-muted-foreground" /><span>{phone}</span></div>
              <div className="flex items-center gap-2.5 text-sm"><Mail className="h-4 w-4 text-muted-foreground" /><span>{email}</span></div>
              <div className="flex items-center gap-2.5 text-sm"><MapPin className="h-4 w-4 text-muted-foreground" /><span>{address}</span></div>
              {createdAt && (
                <div className="flex items-center gap-2.5 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>Lead received {new Date(createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
                </div>
              )}
            </div>
          )}
          {!editMode && notes && (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-sm">{notes}</p>
            </div>
          )}

          {/* ── MOVE TO STAGE ── */}
          {!editMode && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Move to stage</p>
              <div className="flex flex-wrap gap-2">
                {["new","contacted","appointment_set","estimate_sent","closed_won","completed","cancelled_appointment","no_opportunity","lost","not_qualified"].map((s) => (
                  <button key={s} onClick={() => handleStageChange(s)}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${currentStatus === s ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted border-border"}`}>
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