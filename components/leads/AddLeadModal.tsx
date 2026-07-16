"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { X, Loader2, Calendar, DollarSign, Save, Plus } from "lucide-react";
import { pushLeadToJN } from "@/lib/jn-sync";
import { pushAppointmentToGoogle } from "@/lib/calendar-sync";

const JOB_TYPES = [
  "Roof Replacement","Roof Repair","Deck","Siding","Gutters",
  "Windows","Doors","Painting","Masonry","Patio","Walkway",
  "Stairs","Addition","Stucco","Chimney","Other",
];
const SALESPERSONS = ["Ron","Ray","Other (Phone)"];

const LSA_STATUS_OPTIONS = [
  { value: "not_charged", label: "Not Charged" },
  { value: "charged",     label: "Charged" },
  { value: "submitted",   label: "Submitted" },
  { value: "credited",    label: "Credited" },
  { value: "in_review",   label: "In Review" },
];

function formatPhone(v: string) {
  const d = v.replace(/\D/g,"").slice(0,10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0,3)}) ${d.slice(3)}`;
  return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

const BLANK_FORM = {
  lead_received:    todayStr(),
  first_name:       "",
  last_name:        "",
  company_name:     "",
  phone:            "",
  phone_2:          "",
  email:            "",
  address:          "",
  zip:              "",
  city:             "",
  state:            "",
  source_id:        "",
  job_type:         "",
  salesperson:      "",
  notes:            "",
  status:           "new",
  lsa_status:       "not_charged",
  // appointment
  appointment_at:   "",
  appointment_notes:"",
  contact_type:     "",
  // estimate
  estimated_amount: "",
  // contract (closed won / completed)
  contract_value:   "",
  description:      "",
  // lost
  reason_lost:      "",
};

interface AddLeadModalProps {
  open:          boolean;
  onOpenChange:  (open: boolean) => void;
  onLeadCreated?: () => void;
}

export default function AddLeadModal({ open, onOpenChange, onLeadCreated }: AddLeadModalProps) {
  const [form,         setForm]         = useState({ ...BLANK_FORM });
  const [sources,      setSources]      = useState<{id:string;name:string}[]>([]);
  const [saving,       setSaving]       = useState(false);
  const [dupWarning,   setDupWarning]   = useState<{name:string;status:string}|null>(null);
  const [zipLoading,   setZipLoading]   = useState(false);
  const [otherJobType, setOtherJobType] = useState("");
  const [showOtherJob, setShowOtherJob] = useState(false);
  const [links,        setLinks]        = useState<{label:string;url:string}[]>([]);

  const isAppointmentStage = form.status === "appointment_set";
  const isEstimateStage    = form.status === "estimate_sent";
  const isWonStage         = ["closed_won","completed"].includes(form.status);
  const isLostStage        = ["lost","no_opportunity","not_qualified","cancelled_appointment"].includes(form.status);

  useEffect(() => {
    supabase.from("lead_sources").select("id,name").order("name").then(({ data }) => setSources(data || []));
  }, []);

  useEffect(() => {
    if (!open) {
      setForm({ ...BLANK_FORM, lead_received: todayStr() });
      setDupWarning(null);
      setShowOtherJob(false);
      setOtherJobType("");
      setLinks([]);
    }
  }, [open]);

  async function handleZipBlur(zip: string) {
    if (zip.length !== 5) return;
    setZipLoading(true);
    try {
      const res  = await fetch(`https://api.zippopotam.us/us/${zip}`);
      if (res.ok) {
        const data  = await res.json();
        const place = data.places?.[0];
        if (place) setForm(f => ({ ...f, city: place["place name"] || "", state: place["state abbreviation"] || "" }));
      }
    } catch {}
    setZipLoading(false);
  }

  function handleStageChange(newStatus: string) {
    setForm(f => ({
      ...f,
      status:           newStatus,
      contact_type:     "",
      contract_value:   "",
      description:      "",
      appointment_at:   "",
      appointment_notes:"",
      estimated_amount: "",
      reason_lost:      "",
    }));
  }

  function addLink(presetLabel = "") {
    setLinks(prev => [...prev, { label: presetLabel, url: "" }]);
  }
  function updateLink(idx: number, field: "label" | "url", value: string) {
    setLinks(prev => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }
  function removeLink(idx: number) {
    setLinks(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSave(force = false) {
    if (!form.phone && !form.first_name) return;
    setSaving(true);
    setDupWarning(null);

    const fullName  = `${form.first_name} ${form.last_name}`.trim();
    const jobType   = showOtherJob ? otherJobType : form.job_type;
    const createdAt = form.lead_received
      ? new Date(form.lead_received + "T12:00:00").toISOString()
      : new Date().toISOString();

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_name:              fullName || form.phone || "New Lead",
          first_name:             form.first_name || "",
          last_name:              form.last_name  || "",
          phone:                  form.phone      || null,
          email:                  form.email      || null,
          created_at:             createdAt,
          client_address:         form.address    || null,
          client_city:            form.city       || null,
          client_state:           form.state      || null,
          client_zip:             form.zip        || null,
          source_id:              form.source_id  || null,
          status:                 form.status,
          lsa_status:             form.lsa_status || "not_charged",
          contact_type:           form.contact_type || null,
          appointment_at:         isAppointmentStage && form.appointment_at ? new Date(form.appointment_at).toISOString() : null,
          appointment_notes:      isAppointmentStage ? (form.appointment_notes || null) : null,
          estimated_amount:       isEstimateStage && form.estimated_amount ? Number(form.estimated_amount) : 0,
          initial_contract_value: isWonStage && form.contract_value ? Number(form.contract_value) : 0,
          bad_lead:               false,
          company_name:           form.company_name || null,
          phone_2:                form.phone_2      || null,
          links:                  links.filter(l => l.url.trim()).map(l => ({ label: l.label.trim() || "Link", url: l.url.trim() })),
          meta_salesperson:       form.salesperson || null,
          meta_job_type:          jobType          || null,
          meta_notes:             form.notes       || null,
          meta_description:       isWonStage ? (form.description || null) : null,
          meta_reason_lost:       isLostStage ? (form.reason_lost || null) : null,
          force:                  force,
        }),
      });

      const result = await res.json();
      setSaving(false);

      if (res.status === 409) {
        setDupWarning({
          name:   result.existing?.name   || "Unnamed",
          status: result.existing?.status || "unknown",
        });
        return;
      }

      if (!res.ok) {
        alert("Error saving lead: " + (result.error || "Unknown error"));
        return;
      }

      if (result.lead?.id) {
        pushLeadToJN(result.lead.id);
        // If this lead was created straight into Appointment Set with a date/time already
        // filled in, mirror it to Google Calendar too -- same one-way sync as editing an
        // existing lead's appointment, so it doesn't need to be entered twice.
        if (isAppointmentStage && form.appointment_at) pushAppointmentToGoogle(result.lead.id);
      }

      onOpenChange(false);
      onLeadCreated?.();

    } catch (err) {
      setSaving(false);
      alert("Network error — please try again.");
    }
  }

  if (!open) return null;

  const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
  const labelClass = "text-xs font-medium text-muted-foreground block mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background w-full max-w-lg rounded-xl shadow-2xl border border-border overflow-y-auto max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
          <h2 className="text-lg font-bold">Add New Lead</h2>
          <button onClick={() => onOpenChange(false)} className="rounded-lg p-1.5 hover:bg-muted transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Duplicate warning */}
          {dupWarning && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3">
              <p className="text-xs font-semibold text-amber-700 mb-1">⚠ Duplicate Found</p>
              <p className="text-xs text-amber-800 mb-2">
                <span className="font-bold">{dupWarning.name}</span> already exists — stage: <span className="font-bold">{dupWarning.status}</span>
              </p>
              <div className="flex gap-2">
                <button onClick={() => handleSave(true)}
                  className="text-xs px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700 font-medium">
                  Add Anyway
                </button>
                <button onClick={() => setDupWarning(null)}
                  className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Lead Received Date */}
          <div>
            <label className={labelClass}>Lead Received Date</label>
            <input type="date" value={form.lead_received}
              onChange={e => setForm(f => ({ ...f, lead_received: e.target.value }))}
              className={inputClass} />
          </div>

          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>First Name</label>
              <input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} placeholder="John" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Last Name</label>
              <input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} placeholder="Smith" className={inputClass} />
            </div>
          </div>

          {/* Company Name (optional) */}
          <div>
            <label className={labelClass}>Company Name (optional)</label>
            <input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
              placeholder="e.g. ABC Roofing LLC" className={inputClass} />
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Phone *</label>
              <input value={form.phone}
                onChange={e => { setDupWarning(null); setForm(f => ({ ...f, phone: formatPhone(e.target.value) })); }}
                placeholder="(201) 555-0000"
                className={`w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 ${dupWarning ? "border-amber-400" : "border-border"}`} />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="email@example.com" className={inputClass} />
            </div>
          </div>

          {/* Extra Phone (optional) */}
          <div>
            <label className={labelClass}>Extra Phone (optional)</label>
            <input value={form.phone_2}
              onChange={e => setForm(f => ({ ...f, phone_2: formatPhone(e.target.value) }))}
              placeholder="Office, spouse, alternate contact…" className={inputClass} />
          </div>

          {/* Address */}
          <div>
            <label className={labelClass}>Address</label>
            <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              placeholder="Street address" className={inputClass} />
          </div>

          {/* Zip / City / State */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Zip</label>
              <input value={form.zip} maxLength={5} placeholder="07011"
                onChange={e => setForm(f => ({ ...f, zip: e.target.value }))}
                onBlur={e => handleZipBlur(e.target.value)}
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>City</label>
              <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                placeholder={zipLoading ? "Loading…" : "Auto-filled"} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>State</label>
              <input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} placeholder="NJ" className={inputClass} />
            </div>
          </div>

          {/* Source + Salesperson */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Lead Source</label>
              <select value={form.source_id} onChange={e => setForm(f => ({ ...f, source_id: e.target.value }))} className={inputClass}>
                <option value="">Select source</option>
                {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Salesperson</label>
              <select value={form.salesperson} onChange={e => setForm(f => ({ ...f, salesperson: e.target.value }))} className={inputClass}>
                <option value="">Not assigned</option>
                {SALESPERSONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Job Type */}
          <div>
            <label className={labelClass}>Job Type</label>
            <select
              value={showOtherJob ? "Other" : form.job_type}
              onChange={e => {
                if (e.target.value === "Other") { setShowOtherJob(true); setForm(f => ({ ...f, job_type: "Other" })); }
                else { setShowOtherJob(false); setOtherJobType(""); setForm(f => ({ ...f, job_type: e.target.value })); }
              }}
              className={inputClass}>
              <option value="">Select job type</option>
              {JOB_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            {showOtherJob && (
              <input value={otherJobType} onChange={e => setOtherJobType(e.target.value)}
                placeholder="Specify job type…" autoFocus
                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            )}
          </div>

          {/* LSA Status */}
          <div>
            <label className={labelClass}>LSA Status</label>
            <select value={form.lsa_status} onChange={e => setForm(f => ({ ...f, lsa_status: e.target.value }))} className={inputClass}>
              {LSA_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Pipeline Stage */}
          <div>
            <label className={labelClass}>Pipeline Stage</label>
            <select value={form.status} onChange={e => handleStageChange(e.target.value)} className={inputClass}>
              <optgroup label="── Sales Pipeline ──">
                <option value="new">New Lead</option>
                <option value="contacted">Qualified</option>
                <option value="appointment_set">Appointment Set</option>
                <option value="estimate_sent">Estimate Sent</option>
                <option value="closed_won">Closed Won</option>
              </optgroup>
              <optgroup label="── Completed ──">
                <option value="completed">Completed</option>
              </optgroup>
              <optgroup label="── Dead Leads ──">
                <option value="cancelled_appointment">Cancelled Appt</option>
                <option value="no_opportunity">No Opportunity</option>
                <option value="lost">Lost</option>
                <option value="not_qualified">Not Qualified</option>
              </optgroup>
            </select>
          </div>

          {/* ── APPOINTMENT SECTION ── */}
          {isAppointmentStage && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-3">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Appointment
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Date & Time</label>
                  <input type="datetime-local" value={form.appointment_at}
                    onChange={e => setForm(f => ({ ...f, appointment_at: e.target.value }))}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40" />
                </div>
                <div>
                  <label className={labelClass}>Notes</label>
                  <input type="text" placeholder="e.g. 3-5 PM" value={form.appointment_notes}
                    onChange={e => setForm(f => ({ ...f, appointment_notes: e.target.value }))}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40" />
                </div>
              </div>
              {/* Contact Type Toggle */}
              <div className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact Type</p>
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, contact_type: f.contact_type === "in_person" ? "" : "in_person" }))}
                    className={`flex-1 text-xs px-3 py-2 rounded-md border font-medium transition-colors ${
                      form.contact_type === "in_person"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-muted text-muted-foreground"
                    }`}>
                    🏠 In-Person Visit
                  </button>
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, contact_type: f.contact_type === "phone_quote" ? "" : "phone_quote" }))}
                    className={`flex-1 text-xs px-3 py-2 rounded-md border font-medium transition-colors ${
                      form.contact_type === "phone_quote"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-muted text-muted-foreground"
                    }`}>
                    📞 Phone Quote
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── ESTIMATE SECTION ── */}
          {isEstimateStage && (
            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <DollarSign className="h-3 w-3" /> Estimate
              </p>
              {/* Contact Type Toggle */}
              <div className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact Type</p>
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, contact_type: f.contact_type === "in_person" ? "" : "in_person" }))}
                    className={`flex-1 text-xs px-3 py-2 rounded-md border font-medium transition-colors ${
                      form.contact_type === "in_person"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-muted text-muted-foreground"
                    }`}>
                    🏠 In-Person Visit
                  </button>
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, contact_type: f.contact_type === "phone_quote" ? "" : "phone_quote" }))}
                    className={`flex-1 text-xs px-3 py-2 rounded-md border font-medium transition-colors ${
                      form.contact_type === "phone_quote"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-muted text-muted-foreground"
                    }`}>
                    📞 Phone Quote
                  </button>
                </div>
              </div>
              <div>
                <label className={labelClass}>Estimated Amount ($)</label>
                <input type="number" min="0" value={form.estimated_amount}
                  onChange={e => setForm(f => ({ ...f, estimated_amount: e.target.value }))}
                  placeholder="0.00" className={inputClass} />
              </div>
            </div>
          )}

          {/* ── CONTRACT SECTION (Closed Won / Completed) ── */}
          {isWonStage && (
            <div className="rounded-lg border-2 border-primary/25 bg-primary/5 p-4 space-y-3">
              <p className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1">
                <DollarSign className="h-3 w-3" /> Initial Contract
              </p>
              {/* Contact Type Toggle */}
              <div className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact Type</p>
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, contact_type: f.contact_type === "in_person" ? "" : "in_person" }))}
                    className={`flex-1 text-xs px-3 py-2 rounded-md border font-medium transition-colors ${
                      form.contact_type === "in_person"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-muted text-muted-foreground"
                    }`}>
                    🏠 In-Person Visit
                  </button>
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, contact_type: f.contact_type === "phone_quote" ? "" : "phone_quote" }))}
                    className={`flex-1 text-xs px-3 py-2 rounded-md border font-medium transition-colors ${
                      form.contact_type === "phone_quote"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-muted text-muted-foreground"
                    }`}>
                    📞 Phone Quote
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Contract Value ($)</label>
                  <input type="number" min="0" value={form.contract_value}
                    onChange={e => setForm(f => ({ ...f, contract_value: e.target.value }))}
                    placeholder="0.00" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Description</label>
                  <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="e.g. Full roof replacement"
                    className={inputClass} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Open the lead after saving to add payments and change orders.
              </p>
            </div>
          )}

          {/* ── REASON LOST ── */}
          {isLostStage && (
            <div className="rounded-lg border border-red-200 bg-red-50/50 dark:bg-red-950/20 p-4 space-y-2">
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Reason Lost</p>
              <textarea rows={3}
                placeholder="e.g. Price too high, went with another contractor..."
                value={form.reason_lost}
                onChange={e => setForm(f => ({ ...f, reason_lost: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400/40 resize-none" />
            </div>
          )}

          {/* Links (CompanyCam photos, JobNimbus estimate, or anything else) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={labelClass + " mb-0"}>Links</label>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => addLink("CompanyCam")}
                  className="text-xs px-2 py-1 rounded-md border border-border hover:bg-muted text-muted-foreground transition-colors">
                  + CompanyCam
                </button>
                <button type="button" onClick={() => addLink("JobNimbus Estimate")}
                  className="text-xs px-2 py-1 rounded-md border border-border hover:bg-muted text-muted-foreground transition-colors">
                  + JN Estimate
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {links.map((link, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input value={link.label} onChange={e => updateLink(idx, "label", e.target.value)}
                    placeholder="Label" className="w-28 shrink-0 rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
                  <input value={link.url} onChange={e => updateLink(idx, "url", e.target.value)}
                    placeholder="https://…" className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
                  <button type="button" onClick={() => removeLink(idx)}
                    className="shrink-0 rounded-md p-1.5 hover:bg-muted text-muted-foreground transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => addLink()}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                <Plus className="h-3 w-3" /> Add link
              </button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelClass}>Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2} placeholder="Any additional notes…"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-1">
            <button onClick={() => onOpenChange(false)}
              className="flex-1 py-2.5 rounded-md border border-border hover:bg-muted text-sm font-medium transition-colors">
              Cancel
            </button>
            <button onClick={() => handleSave(false)}
              disabled={saving || (!form.phone && !form.first_name)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium disabled:opacity-40 transition-colors">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Saving…" : "Save Lead"}
            </button>
          </div>
          <p className="text-xs text-center text-muted-foreground">* Phone or name required · Duplicate check on save</p>
        </div>
      </div>
    </div>
  );
}