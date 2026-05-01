"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AddLeadModal() {
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    lead_name: "",
    phone: "",
    email: "",
    address_line_1: "",
    city: "",
    state: "",
    source_email: "",
  });

  const handleChange = (e: any) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    if (!form.lead_name.trim() || !form.phone.trim()) {
      alert("Name and phone are required.");
      return;
    }

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (res.ok) {
        alert("Lead added!");
        setOpen(false);
        window.location.reload();
      } else {
        alert("Error: " + data.error);
      }
    } catch (err) {
      console.error(err);
      alert("Something went wrong.");
    }
  };

  return (
    <>
      <Button
        size="sm"
        className="gap-1.5 h-8"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Add Lead</span>
      </Button>

      {open && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white rounded-lg p-6 w-[400px] space-y-3">
            <h2 className="text-lg font-semibold">Add Lead</h2>

            <input name="lead_name" placeholder="Name *" value={form.lead_name} onChange={handleChange} className="w-full border p-2 rounded" />
            <input name="phone" placeholder="Phone *" value={form.phone} onChange={handleChange} className="w-full border p-2 rounded" />
            <input name="email" placeholder="Email" value={form.email} onChange={handleChange} className="w-full border p-2 rounded" />
            <input name="address_line_1" placeholder="Address" value={form.address_line_1} onChange={handleChange} className="w-full border p-2 rounded" />
            <input name="city" placeholder="City" value={form.city} onChange={handleChange} className="w-full border p-2 rounded" />
            <input name="state" placeholder="State" value={form.state} onChange={handleChange} className="w-full border p-2 rounded" />
            <input name="source_email" placeholder="Source Email" value={form.source_email} onChange={handleChange} className="w-full border p-2 rounded" />

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setOpen(false)}>Cancel</button>
              <button
                onClick={handleSubmit}
                className="bg-blue-600 text-white px-4 py-2 rounded"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}