"use client";

import { useState } from "react";
import { Plus, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const LEAD_SOURCES = [
  "LSA Clifton","LSA Teaneck","LSA Hawthorne",
  "Pro Referral","Referrals","Google/Website",
  "Social Media (Meta)","Repeat Client",
];

// ✅ Standard job types — "Other" triggers a free-text input
const STANDARD_JOB_TYPES = [
  "Roof Replacement","Roof Repair","Deck","Siding",
  "Windows","Painting","Masonry","Stucco","Chimney",
];

const SALESPEOPLE = ["Ron","Ray"];

// ✅ Pipeline stages available at lead creation
const PIPELINE_STAGES = [
  { value: "new_lead",        label: "New Lead" },
  { value: "contacted",       label: "Qualified" },
  { value: "appointment_set", label: "Appointment Set" },
  { value: "estimate_sent",   label: "Estimate Sent" },
  { value: "closed_won",      label: "Closed Won" },
];

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0,3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

interface AddLeadModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function AddLeadModal({ open: externalOpen, onOpenChange }: AddLeadModalProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);

  const open    = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = (val: boolean) => {
    if (onOpenChange) onOpenChange(val);
    else setInternalOpen(val);
  };

  const [loading,    setLoading]    = useState(false);
  const [success,    setSuccess]    = useState(false);
  const [zipLooking, setZipLooking] = useState(false);

  const emptyForm = {
    date_received:   todayStr(),
    first_name:      "",
    last_name:       "",
    phone:           "",
    email:           "",
    client_address:  "",
    client_city:     "",
    client_state:    "",
    client_zip:      "",
    lead_source:     "",
    job_type:        "",        // dropdown value ("Other" or standard)
    custom_job_type: "",        // ✅ free-text when "Other" is selected
    salesperson:     "",
    status:          "new_lead", // ✅ pipeline stage
    notes:           "",
  };

  const [form, setForm] = useState(emptyForm);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    if (name === "phone") {
      setForm({ ...form, phone: formatPhone(value) });
    } else if (name === "job_type") {
      // Reset custom job type when switching away from "Other"
      setForm({ ...form, job_type: value, custom_job_type: value !== "Other" ? "" : form.custom_job_type });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleZipLookup = async (zip: string) => {
    if (zip.length !== 5) return;
    setZipLooking(true);
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
      if (res.ok) {
        const data = await res.json();
        const place = data.places?.[0];
        if (place) {
          setForm(prev => ({
            ...prev,
            client_city:  place["place name"]          || prev.client_city,
            client_state: place["state abbreviation"]  || prev.client_state,
          }));
        }
      }
    } catch (_) {}
    setZipLooking(false);
  };

  const handleSubmit = async () => {
    if (!form.first_name.trim() && !form.phone.trim()) {
      alert("First name or phone is required.");
      return;
    }
    setLoading(true);
    try {
      const full_name = `${form.first_name.trim()} ${form.last_name.trim()}`.trim();

      // ✅ Resolve job type — if "Other" selected, use the custom text
      const finalJobType = form.job_type === "Other"
        ? form.custom_job_type.trim()
        : form.job_type;

      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_name:      full_name || form.phone,
          phone:          form.phone          || null,
          email:          form.email          || null,
          client_address: form.client_address || null,
          client_city:    form.client_city    || null,
          client_state:   form.client_state   || null,
          client_zip:     form.client_zip     || null,
          lead_source:    form.lead_source    || null,
          meta_job_type:     finalJobType     || null,
          meta_salesperson:  form.salesperson || null,
          meta_notes:        form.notes       || null,
          // ✅ Pipeline stage
          status: form.status || "new_lead",
          // ✅ Lead received date
          created_at: form.date_received
            ? new Date(form.date_received + "T00:00:00").toISOString()
            : new Date().toISOString(),
          archived: false,
          bad_lead: false,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          setOpen(false);
          setForm(emptyForm);
        }, 1500);
      } else {
        alert("Error: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      alert("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const TriggerButton = externalOpen === undefined ? (
    <Button size="sm" variant="ghost"
      className="w-full justify-start gap-2 px-3 py-2.5 h-auto rounded-none text-sm font-normal"
      onClick={() => setOpen(true)}>
      <Plus className="h-3.5 w-3.5 text-muted-foreground" />
      Add Lead
    </Button>
  ) : null;

  return (
    <>
      {TriggerButton}

      {open && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-[100] p-4">
          <div className="bg-background rounded-xl border border-border shadow-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto space-y-3">

            {success ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <CheckCircle className="h-12 w-12 text-emerald-500" />
                <p className="text-lg font-semibold text-emerald-600">Lead Saved!</p>
                <p className="text-sm text-muted-foreground">The lead has been added to your pipeline.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-lg font-semibold">Add New Lead</h2>
                </div>

                <div className="grid grid-cols-2 gap-3">

                  {/* Lead Received Date */}
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block font-medium">Lead Received Date</label>
                    <input type="date" name="date_received" value={form.date_received} onChange={handleChange}
                      className="w-full border border-border rounded-md p-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" />
                  </div>

                  {/* First + Last Name */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">First Name</label>
                    <input name="first_name" placeholder="First name" value={form.first_name} onChange={handleChange}
                      className="w-full border border-border rounded-md p-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Last Name</label>
                    <input name="last_name" placeholder="Last name" value={form.last_name} onChange={handleChange}
                      className="w-full border border-border rounded-md p-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" />
                  </div>

                  {/* Phone + Email */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Phone *</label>
                    <input name="phone" placeholder="(201) 555-0000" value={form.phone} onChange={handleChange}
                      className="w-full border border-border rounded-md p-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Email</label>
                    <input name="email" placeholder="email@example.com" value={form.email} onChange={handleChange}
                      className="w-full border border-border rounded-md p-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" />
                  </div>

                  {/* Address */}
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">Address</label>
                    <input name="client_address" placeholder="Street address" value={form.client_address} onChange={handleChange}
                      className="w-full border border-border rounded-md p-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" />
                  </div>

                  {/* Zip + City */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Zip {zipLooking && <span className="text-blue-500">Looking up...</span>}
                    </label>
                    <input name="client_zip" placeholder="07011" maxLength={5} value={form.client_zip}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 5);
                        setForm({ ...form, client_zip: val });
                        if (val.length === 5) handleZipLookup(val);
                      }}
                      className="w-full border border-border rounded-md p-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">City</label>
                    <input name="client_city" placeholder="Auto-filled" value={form.client_city} onChange={handleChange}
                      className="w-full border border-border rounded-md p-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" />
                  </div>

                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">State</label>
                    <input name="client_state" placeholder="Auto-filled" value={form.client_state} onChange={handleChange}
                      className="w-full border border-border rounded-md p-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" />
                  </div>

                  {/* Lead Source + Job Type */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Lead Source</label>
                    <select name="lead_source" value={form.lead_source} onChange={handleChange}
                      className="w-full border border-border rounded-md p-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40">
                      <option value="">Select source</option>
                      {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Job Type</label>
                    <select name="job_type" value={form.job_type} onChange={handleChange}
                      className="w-full border border-border rounded-md p-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40">
                      <option value="">Select job type</option>
                      {STANDARD_JOB_TYPES.map(j => <option key={j} value={j}>{j}</option>)}
                      <option value="Other">Other (type below)</option>
                    </select>
                    {/* ✅ Custom job type text input when "Other" selected */}
                    {form.job_type === "Other" && (
                      <input
                        name="custom_job_type"
                        placeholder="e.g. Gutters, Insulation..."
                        value={form.custom_job_type}
                        onChange={handleChange}
                        autoFocus
                        className="mt-1.5 w-full border border-primary/40 rounded-md p-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    )}
                  </div>

                  {/* ✅ Pipeline Stage */}
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">Pipeline Stage</label>
                    <select name="status" value={form.status} onChange={handleChange}
                      className="w-full border border-border rounded-md p-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40">
                      {PIPELINE_STAGES.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Salesperson */}
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">Salesperson</label>
                    <select name="salesperson" value={form.salesperson} onChange={handleChange}
                      className="w-full border border-border rounded-md p-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40">
                      <option value="">Select</option>
                      {SALESPEOPLE.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  {/* Notes */}
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
                    <textarea name="notes" placeholder="Job description or notes..." value={form.notes} onChange={handleChange}
                      rows={3}
                      className="w-full border border-border rounded-md p-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setOpen(false)}
                    className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleSubmit} disabled={loading}
                    className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors">
                    {loading ? "Saving..." : "Save Lead"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}