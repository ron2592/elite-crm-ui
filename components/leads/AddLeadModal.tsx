"use client";

import { useState } from "react";
import { Plus, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const LEAD_SOURCES = [
  "LSA Clifton","LSA Teaneck","LSA Hawthorne",
  "Pro Referral","Referrals","Google/Website",
  "Social Media (Meta)","Repeat Client",
];

const JOB_TYPES = [
  "Roof Replacement","Roof Repair","Deck","Siding",
  "Windows","Painting","Masonry","Stucco","Chimney","Other",
];

const PAYMENT_METHODS = [
  "Cash","Check","Credit Card","Zelle",
  "Sunlight Financial","Upgrade",
];

const SALESPEOPLE = ["Ron","Ray"];

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0,3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
}

export default function AddLeadModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [zipLooking, setZipLooking] = useState(false);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    address_line_1: "",
    city: "",
    state: "",
    postal_code: "",
    lead_source: "",
    job_type: "",
    salesperson: "",
    estimated_amount: "",
    payment_method: "",
    notes: "",
  });

  const handleChange = (e: any) => {
    const { name, value } = e.target;
    if (name === "phone") {
      setForm({ ...form, phone: formatPhone(value) });
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
          setForm((prev) => ({
            ...prev,
            city: place["place name"] || prev.city,
            state: place["state abbreviation"] || prev.state,
          }));
        }
      }
    } catch (_) {}
    setZipLooking(false);
  };

  const handleSubmit = async () => {
    if (!form.first_name.trim() || !form.phone.trim()) {
      alert("First name and phone are required.");
      return;
    }
    setLoading(true);
    try {
      const full_name = `${form.first_name.trim()} ${form.last_name.trim()}`.trim();
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_name: full_name,
          last_name: form.last_name.trim() || null,
          phone: form.phone,
          email: form.email,
          address_line_1: form.address_line_1,
          city: form.city,
          state: form.state,
          postal_code: form.postal_code,
          lead_source: form.lead_source,
          job_type: form.job_type,
          salesperson: form.salesperson,
          estimated_amount: form.estimated_amount ? Number(form.estimated_amount) : 0,
          payment_method: form.payment_method,
          notes: form.notes,
          archived: false,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          setOpen(false);
          setForm({
            first_name: "", last_name: "", phone: "", email: "",
            address_line_1: "", city: "", state: "", postal_code: "",
            lead_source: "", job_type: "", salesperson: "",
            estimated_amount: "", payment_method: "", notes: "",
          });
        }, 1500);
      } else {
        alert("Error: " + data.error);
      }
    } catch (err) {
      alert("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button size="sm" className="gap-1.5 h-8" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Add Lead</span>
      </Button>

      {open && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto space-y-3">

            {/* Success State */}
            {success ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <CheckCircle className="h-12 w-12 text-emerald-500" />
                <p className="text-lg font-semibold text-emerald-600">Lead Saved!</p>
                <p className="text-sm text-gray-500">The lead has been added to your pipeline.</p>
              </div>
            ) : (
              <>
                <h2 className="text-lg font-semibold">Add Lead</h2>

                <div className="grid grid-cols-2 gap-3">
                  {/* First + Last Name */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">First Name *</label>
                    <input
                      name="first_name"
                      placeholder="First name"
                      value={form.first_name}
                      onChange={handleChange}
                      className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Last Name</label>
                    <input
                      name="last_name"
                      placeholder="Last name"
                      value={form.last_name}
                      onChange={handleChange}
                      className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700"
                    />
                  </div>

                  {/* Phone + Email */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Phone *</label>
                    <input
                      name="phone"
                      placeholder="(201) 555-0000"
                      value={form.phone}
                      onChange={handleChange}
                      className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Email</label>
                    <input
                      name="email"
                      placeholder="email@example.com"
                      value={form.email}
                      onChange={handleChange}
                      className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700"
                    />
                  </div>

                  {/* Address */}
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 mb-1 block">Address</label>
                    <input
                      name="address_line_1"
                      placeholder="Street address"
                      value={form.address_line_1}
                      onChange={handleChange}
                      className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700"
                    />
                  </div>

                  {/* Zip — auto fills city/state */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">
                      Zip Code {zipLooking && <span className="text-blue-500">Looking up...</span>}
                    </label>
                    <input
                      name="postal_code"
                      placeholder="07011"
                      maxLength={5}
                      value={form.postal_code}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 5);
                        setForm({ ...form, postal_code: val });
                        if (val.length === 5) handleZipLookup(val);
                      }}
                      className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700"
                    />
                  </div>

                  {/* City + State — auto filled */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">City</label>
                    <input
                      name="city"
                      placeholder="Auto-filled from zip"
                      value={form.city}
                      onChange={handleChange}
                      className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 mb-1 block">State</label>
                    <input
                      name="state"
                      placeholder="Auto-filled from zip"
                      value={form.state}
                      onChange={handleChange}
                      className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700"
                    />
                  </div>

                  {/* Lead Source + Job Type */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Lead Source</label>
                    <select
                      name="lead_source"
                      value={form.lead_source}
                      onChange={handleChange}
                      className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700"
                    >
                      <option value="">Select source</option>
                      {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Job Type</label>
                    <select
                      name="job_type"
                      value={form.job_type}
                      onChange={handleChange}
                      className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700"
                    >
                      <option value="">Select job type</option>
                      {JOB_TYPES.map(j => <option key={j} value={j}>{j}</option>)}
                    </select>
                  </div>

                  {/* Salesperson + Estimated Amount */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Salesperson</label>
                    <select
                      name="salesperson"
                      value={form.salesperson}
                      onChange={handleChange}
                      className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700"
                    >
                      <option value="">Select</option>
                      {SALESPEOPLE.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Estimated Amount ($)</label>
                    <input
                      name="estimated_amount"
                      type="number"
                      placeholder="0"
                      value={form.estimated_amount}
                      onChange={handleChange}
                      className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700"
                    />
                  </div>

                  {/* Payment Method */}
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 mb-1 block">Payment Method</label>
                    <select
                      name="payment_method"
                      value={form.payment_method}
                      onChange={handleChange}
                      className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700"
                    >
                      <option value="">Select payment method</option>
                      {PAYMENT_METHODS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>

                  {/* Notes */}
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 mb-1 block">Notes</label>
                    <textarea
                      name="notes"
                      placeholder="Job description or notes..."
                      value={form.notes}
                      onChange={handleChange}
                      rows={3}
                      className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setOpen(false)}
                    className="px-4 py-2 text-sm text-gray-600"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="bg-blue-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
                  >
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