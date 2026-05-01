"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
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

export default function AddLeadModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    lead_name: "",
    phone: "",
    email: "",
    address_line_1: "",
    city: "",
    state: "",
    lead_source: "",
    job_type: "",
    salesperson: "",
    estimated_amount: "",
    payment_method: "",
    notes: "",
  });

  const handleChange = (e: any) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    if (!form.lead_name.trim() || !form.phone.trim()) {
      alert("Name and phone are required.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          estimated_amount: form.estimated_amount ? Number(form.estimated_amount) : 0,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setOpen(false);
        setForm({ lead_name:"",phone:"",email:"",address_line_1:"",city:"",state:"",lead_source:"",job_type:"",salesperson:"",estimated_amount:"",payment_method:"",notes:"" });
        window.location.reload();
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
            <h2 className="text-lg font-semibold">Add Lead</h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Client Name *</label>
                <input name="lead_name" placeholder="Full name" value={form.lead_name} onChange={handleChange} className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Phone *</label>
                <input name="phone" placeholder="(201) 555-0000" value={form.phone} onChange={handleChange} className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Email</label>
                <input name="email" placeholder="email@example.com" value={form.email} onChange={handleChange} className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Address</label>
                <input name="address_line_1" placeholder="Street address" value={form.address_line_1} onChange={handleChange} className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">City</label>
                <input name="city" placeholder="City" value={form.city} onChange={handleChange} className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">State</label>
                <input name="state" placeholder="NJ" value={form.state} onChange={handleChange} className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Lead Source</label>
                <select name="lead_source" value={form.lead_source} onChange={handleChange} className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700">
                  <option value="">Select source</option>
                  {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Job Type</label>
                <select name="job_type" value={form.job_type} onChange={handleChange} className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700">
                  <option value="">Select job type</option>
                  {JOB_TYPES.map(j => <option key={j} value={j}>{j}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Salesperson</label>
                <select name="salesperson" value={form.salesperson} onChange={handleChange} className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700">
                  <option value="">Select</option>
                  {SALESPEOPLE.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Estimated Amount ($)</label>
                <input name="estimated_amount" type="number" placeholder="0" value={form.estimated_amount} onChange={handleChange} className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Payment Method</label>
                <select name="payment_method" value={form.payment_method} onChange={handleChange} className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700">
                  <option value="">Select payment method</option>
                  {PAYMENT_METHODS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Notes</label>
                <textarea name="notes" placeholder="Job description or notes..." value={form.notes} onChange={handleChange} rows={3} className="w-full border p-2 rounded text-sm dark:bg-zinc-800 dark:border-zinc-700" />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button onClick={handleSubmit} disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50">
                {loading ? "Saving..." : "Save Lead"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}