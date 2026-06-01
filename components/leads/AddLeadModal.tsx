"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { X, Loader2 } from "lucide-react";

const JOB_TYPES = [
  "Roof Replacement","Roof Repair","Deck","Siding","Gutters",
  "Windows","Doors","Painting","Masonry","Patio","Walkway",
  "Stairs","Addition","Other",
];
const SALESPERSONS = ["Ron","Ray","Other (Phone)"];

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
  lead_received:  todayStr(),
  first_name:     "",
  last_name:      "",
  phone:          "",
  email:          "",
  address:        "",
  zip:            "",
  city:           "",
  state:          "",
  source_id:      "",
  job_type:       "",
  salesperson:    "",
  notes:          "",
  status:         "new",
  contact_type:   "",
  contract_value: "",
  description:    "",
};

interface AddLeadModalProps {
  open:          boolean;
  onOpenChange:  (open: boolean) => void;
  onLeadCreated?: () => void;
}

export default function AddLeadModal({ open, onOpenChange, onLeadCreated }: AddLeadModalProps) {
  const [form,          setForm]          = useState({ ...BLANK_FORM });
  const [sources,       setSources]       = useState<{id:string;name:string}[]>([]);
  const [saving,        setSaving]        = useState(false);
  const [dupWarning,    setDupWarning]    = useState<{name:string;status:string}|null>(null);
  const [zipLoading,    setZipLoading]    = useState(false);
  const [otherJobType,  setOtherJobType]  = useState("");
  const [showOtherJob,  setShowOtherJob]  = useState(false);

  const isWonStage = ["closed_won","completed"].includes(form.status);

  useEffect(() => {
    supabase.from("lead_sources").select("id,name").order("name").then(({ data }) => setSources(data || []));
  }, []);

  useEffect(() => {
    if (!open) {
      setForm({ ...BLANK_FORM, lead_received: todayStr() });
      setDupWarning(null);
      setShowOtherJob(false);
      setOtherJobType("");
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
          contact_type:           isWonStage ? (form.contact_type || null) : null,
          initial_contract_value: isWonStage && form.contract_value ? Number(form.contract_value) : 0,
          bad_lead:               false,
          meta_salesperson:       form.salesperson || null,
          meta_job_type:          jobType          || null,
          meta_notes:             form.notes       || null,
          meta_description:       isWonStage ? (form.description || null) : null,
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

      onOpenChange(false);
      onLeadCreated?.();

    } catch (err) {
      setSaving(false);
      alert("Network error — please try again.");
    }
  }

  if (!open) return null;

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
            <label className="text-xs font-medium text-muted-foreground block mb-1">Lead Received Date</label>
            <input type="date" value={form.lead_received}
              onChange={e => setForm(f => ({ ...f, lead_received: e.target.value }))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>

          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">First Name</label>
              <input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} placeholder="John"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Last Name</label>
              <input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} placeholder="Smith"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Phone *</label>
              <input value={form.phone}
                onChange={e => { setDupWarning(null); setForm(f => ({ ...f, phone: formatPhone(e.target.value) })); }}
                placeholder="(201) 555-0000"
                className={`w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 ${dupWarning ? "border-amber-400" : "border-border"}`} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="email@example.com"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Address</label>
            <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              placeholder="Street address"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>

          {/* Zip / City / State */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Zip</label>
              <input value={form.zip} maxLength={5} placeholder="07011"
                onChange={e => setForm(f => ({ ...f, zip: e.target.value }))}
                onBlur={e => handleZipBlur(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">City</label>
              <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                placeholder={zipLoading ? "Loading…" : "Auto-filled"}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">State</label>
              <input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} placeholder="NJ"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
          </div>

          {/* Source + Salesperson */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Lead Source</label>
              <select value={form.source_id} onChange={e => setForm(f => ({ ...f, source_id: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                <option value="">Select source</option>
                {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Salesperson</label>
              <select value={form.salesperson} onChange={e => setForm(f => ({ ...f, salesperson: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                <option value="">Not assigned</option>
                {SALESPERSONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Job Type */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Job Type</label>
            <select
              value={showOtherJob ? "Other" : form.job_type}
              onChange={e => {
                if (e.target.value === "Other") { setShowOtherJob(true); setForm(f => ({ ...f, job_type: "Other" })); }
                else { setShowOtherJob(false); setOtherJobType(""); setForm(f => ({ ...f, job_type: e.target.value })); }
              }}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
              <option value="">Select job type</option>
              {JOB_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            {showOtherJob && (
              <input value={otherJobType} onChange={e => setOtherJobType(e.target.value)}
                placeholder="Specify job type…" autoFocus
                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            )}
          </div>

          {/* Pipeline Stage */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Pipeline Stage</label>
            <select value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value, contact_type: "", contract_value: "", description: "" }))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
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
            {form.status === "completed" && (
              <p className="text-xs text-muted-foreground mt-1">This lead will also appear in the Production tracker.</p>
            )}
          </div>

          {/* Contract fields — only for Closed Won / Completed */}
          {isWonStage && (
            <div className="rounded-lg border-2 border-primary/25 bg-primary/5 p-4 space-y-3">
              <p className="text-xs font-bold text-primary uppercase tracking-wide">$ Initial Contract</p>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Contact Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, contact_type: "in_person" }))}
                    className={`py-2 rounded-md text-sm font-medium border transition-colors ${
                      form.contact_type === "in_person"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-muted"
                    }`}>
                    🏠 In-Person Visit
                  </button>
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, contact_type: "phone_quote" }))}
                    className={`py-2 rounded-md text-sm font-medium border transition-colors ${
                      form.contact_type === "phone_quote"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-muted"
                    }`}>
                    📞 Phone Quote
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Contract Value ($)</label>
                  <input type="number" min="0" value={form.contract_value}
                    onChange={e => setForm(f => ({ ...f, contract_value: e.target.value }))}
                    placeholder="0.00"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Description</label>
                  <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="e.g. Full roof replacement"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Open the lead after saving to add payments and change orders.
              </p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Notes</label>
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