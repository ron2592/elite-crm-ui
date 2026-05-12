"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  Upload, ChevronLeft, AlertCircle, CheckCircle,
  Loader2, X, FileText, Download,
} from "lucide-react";

// ── Standard template columns — matches CRM fields exactly ───────────────────
// This is what we tell clients to use. Auto-detection is perfect for these.
const TEMPLATE_COLUMNS = [
  { col: "first_name",      example: "John",            note: "First name" },
  { col: "last_name",       example: "Smith",           note: "Last name" },
  { col: "phone",           example: "(201) 555-1234",  note: "Contact number" },
  { col: "email",           example: "john@email.com",  note: "Email address" },
  { col: "address",         example: "123 Main St",     note: "Street address" },
  { col: "city",            example: "Newark",          note: "City" },
  { col: "state",           example: "NJ",              note: "State (2-letter)" },
  { col: "zip",             example: "07101",           note: "ZIP code" },
  { col: "job_type",        example: "Roofing",         note: "Type of work" },
  { col: "salesperson",     example: "Ron",             note: "Salesperson assigned" },
  { col: "contract_value",  example: "8500",            note: "Initial contract $ (numbers only)" },
  { col: "date_received",   example: "4/1/2026",        note: "Date lead came in" },
  { col: "status",          example: "new_lead",        note: "new_lead / appointment_set / estimate_sent / closed_won / lost" },
  { col: "lsa_status",      example: "charged",         note: "charged / submitted / credited / not_charged" },
  { col: "contact_type",    example: "phone_quote",     note: "in_person / phone_quote" },
  { col: "notes",           example: "Needs roof replacement", note: "Any notes" },
];

// ── CRM Fields available in mapper ────────────────────────────────────────────
const DB_FIELDS = [
  { key: "first_name",              label: "First Name"                        },
  { key: "last_name",               label: "Last Name"                         },
  { key: "full_name",               label: "Full Name (auto-split)"            },
  { key: "phone",                   label: "Phone"                             },
  { key: "email",                   label: "Email"                             },
  { key: "client_address",          label: "Street Address"                    },
  { key: "client_city",             label: "City"                              },
  { key: "client_state",            label: "State"                             },
  { key: "client_zip",              label: "ZIP Code"                          },
  { key: "location",                label: "Location (auto-parse: city, ST zip)"},
  { key: "jn_address",             label: "Address Block (JN multi-line)"     },
  { key: "meta_job_type",           label: "Job Type"                          },
  { key: "meta_salesperson",        label: "Salesperson"                       },
  { key: "initial_contract_value",  label: "Contract Value ($)"               },
  { key: "created_at",              label: "Date Received"                     },
  { key: "status",                  label: "Stage / Status"                    },
  { key: "lsa_status",              label: "LSA Status"                        },
  { key: "contact_type",            label: "Contact Type"                      },
  { key: "visited",                 label: "Visited? (true → in_person)"       },
  { key: "estimate_sent",           label: "Estimate Sent? (true/false)"       },
  { key: "job_closed",              label: "Job Closed? (true → closed_won)"   },
  { key: "bad_lead",                label: "Bad Lead? (true/false)"            },
  { key: "meta_notes",              label: "Notes"                             },
];

// ── Auto-detect — prioritizes exact template column names ─────────────────────
function autoMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Always skip these — calculated or irrelevant
  const alwaysSkip = ["projectrevenue", "changeorders", "recordtype", "salesrep"];

  // Exact template matches first, then fuzzy fallbacks
  const exact: Record<string, string> = {
    "first_name":     "first_name",
    "last_name":      "last_name",
    "phone":          "phone",
    "email":          "email",
    "address":        "client_address",
    "city":           "client_city",
    "state":          "client_state",
    "zip":            "client_zip",
    "job_type":       "meta_job_type",
    "salesperson":    "meta_salesperson",
    "contract_value": "initial_contract_value",
    "date_received":  "created_at",
    "status":         "status",
    "lsa_status":     "lsa_status",
    "contact_type":   "contact_type",
    "notes":          "meta_notes",
  };

  // Fuzzy fallbacks for non-template CSVs (LSA, JN, etc.)
  const fuzzy: Record<string, string[]> = {
    phone:                  ["mainphone", "contactnum", "contact", "customernum", "customersnum", "phonenumber", "mobile", "cell", "tel", "unnamed0"],
    full_name:              ["display", "name", "fullname", "clientname", "customername"],
    first_name:             ["firstname", "fname"],
    last_name:              ["lastname", "lname"],
    email:                  ["emailaddress", "mail"],
    jn_address:            ["addressinfo"],
    location:               ["location"],
    client_city:            ["city", "town"],
    client_address:         ["streetaddress", "street"],
    client_state:           ["province"],
    client_zip:             ["zipcode", "postalcode", "postal"],
    lsa_status:             ["leadstatus"],
    contact_type:           ["leadtype"],
    visited:                ["visited"],
    estimate_sent:          ["estimatesent"],
    job_closed:             ["jobclosed"],
    bad_lead:               ["badlead"],
    initial_contract_value: ["initialvolume", "contractvalue"],
    created_at:             ["leadreceived", "datereceived", "createdat", "received"],
    meta_salesperson:       ["technicians", "assignedto", "rep", "agent"],
    meta_job_type:          ["jobtype", "service", "worktype"],
    meta_notes:             ["note", "comments", "description"],
  };

  headers.forEach(h => {
    const normalized = n(h);
    if (alwaysSkip.includes(normalized)) return;

    // 1. Exact match against template columns
    if (exact[normalized]) { map[h] = exact[normalized]; return; }

    // 2. Fuzzy match
    for (const [field, aliases] of Object.entries(fuzzy)) {
      if (normalized === n(field) || aliases.some(a => normalized.includes(a))) {
        map[h] = field;
        return;
      }
    }
  });

  return map;
}

// ── Download template CSV ─────────────────────────────────────────────────────
function downloadTemplate() {
  const header = TEMPLATE_COLUMNS.map(c => c.col).join(",");
  const example = TEMPLATE_COLUMNS.map(c => `"${c.example}"`).join(",");
  const notes = TEMPLATE_COLUMNS.map(c => `"${c.note}"`).join(",");
  const csv = [header, example, notes].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "lead_import_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Value helpers ─────────────────────────────────────────────────────────────
function parseBool(val: string) {
  return ["true", "yes", "1"].includes((val || "").trim().toLowerCase());
}

function parseJNAddress(val: string) {
  if (!val?.trim()) return {};
  const lines = val.split(/\n/).map(l => l.trim()).filter(Boolean);
  const result: any = {};
  if (lines[0]) result.client_address = lines[0];
  if (lines[1]) {
    const parts = lines[1].split(",").map(p => p.trim());
    if (parts.length >= 2) {
      result.client_city = parts[0];
      const stateZip = parts.slice(1).join(" ").trim();
      const match = stateZip.match(/([A-Za-z]{2})\s*,?\s*(\d{5})?/);
      if (match) { result.client_state = match[1].toUpperCase(); if (match[2]) result.client_zip = match[2]; }
    } else result.client_city = lines[1];
  }
  return result;
}

function parseLocation(loc: string) {
  if (!loc?.trim()) return {};
  const parts = loc.split(",");
  if (parts.length >= 2) {
    const addr  = parts[0].trim();
    const rest  = parts.slice(1).join(",").trim();
    const match = rest.match(/([A-Z]{2})\s*(\d{5})?$/);
    if (match) return { client_address: addr, client_city: rest.replace(match[0], "").trim(), client_state: match[1], client_zip: match[2] || null };
    return { client_address: addr, client_city: rest };
  }
  return { client_city: loc.trim() };
}

function parseName(name: string) {
  if (!name?.trim()) return {};
  const parts = name.trim().split(" ");
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") || null };
}

function mapLsaStatus(val: string) {
  const v = (val || "").trim().toLowerCase();
  if (v === "charged")     return { lsa_status: "charged",     bad_lead: false };
  if (v === "submitted")   return { lsa_status: "charged",     bad_lead: true  };
  if (v === "not charged" || v === "not_charged") return { lsa_status: "not_charged", bad_lead: false };
  if (v === "credited")    return { lsa_status: "credited",    bad_lead: false };
  if (v === "in review" || v === "in_review")     return { lsa_status: "in_review",   bad_lead: true  };
  return { lsa_status: null, bad_lead: false };
}

function parseRevenue(val: string) {
  const n = parseFloat((val || "").replace(/[$,]/g, "").trim());
  return isNaN(n) ? 0 : n;
}

function parseDate(val: string) {
  if (!val?.trim()) return null;
  try { const d = new Date(val.trim()); if (!isNaN(d.getTime())) return d.toISOString(); } catch {}
  return null;
}

// ── Proper CSV parser — handles multi-line quoted fields ──────────────────────
function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const result: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else {
      if      (ch === '"')                   inQuotes = true;
      else if (ch === ',')                   { row.push(field.trim()); field = ""; }
      else if (ch === '\r' && next === '\n') { i++; row.push(field.trim()); result.push(row); row = []; field = ""; }
      else if (ch === '\n')                  { row.push(field.trim()); result.push(row); row = []; field = ""; }
      else                                   field += ch;
    }
  }
  if (field || row.length) { row.push(field.trim()); result.push(row); }
  const cleaned = result.filter(r => r.some(f => f !== ""));
  if (cleaned.length < 2) return { headers: [], rows: [] };
  const headers = cleaned[0];
  const rows = cleaned.slice(1).map(cols => Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? ""])));
  return { headers, rows };
}

// ── Build lead from row ───────────────────────────────────────────────────────
function buildLead(row: Record<string, string>, mapping: Record<string, string>, sourceId: string | null) {
  const lead: any = {
    archived: false, status: "new_lead", source_id: sourceId,
    metadata: { imported_from: "csv", import_date: new Date().toISOString() },
  };
  let hasIdentifier = false, lsaVal = "";

  for (const [csvCol, crmField] of Object.entries(mapping)) {
    if (!crmField) continue;
    const val = String(row[csvCol] || "").trim();
    if (!val) continue;
    switch (crmField) {
      case "phone":                  lead.phone = val; hasIdentifier = true; break;
      case "first_name":             lead.first_name = val; hasIdentifier = true; break;
      case "last_name":              lead.last_name = val; break;
      case "full_name":              Object.assign(lead, parseName(val)); hasIdentifier = true; break;
      case "email":                  lead.email = val; break;
      case "jn_address":            Object.assign(lead, parseJNAddress(val)); break;
      case "location":               Object.assign(lead, parseLocation(val)); break;
      case "client_address":         lead.client_address = val; break;
      case "client_city":            lead.client_city = val; break;
      case "client_state":           lead.client_state = val; break;
      case "client_zip":             lead.client_zip = val; break;
      case "lsa_status":             lsaVal = val; break;
      case "status":                 lead.status = val; break;
      case "contact_type":           lead.contact_type = val; break;
      case "visited":                if (parseBool(val)) lead.contact_type = "in_person"; break;
      case "estimate_sent":          if (parseBool(val)) lead.status = "estimate_sent"; break;
      case "job_closed":             if (parseBool(val)) lead.status = "closed_won"; break;
      case "bad_lead":               lead.bad_lead = parseBool(val); break;
      case "initial_contract_value": lead.initial_contract_value = parseRevenue(val); break;
      case "created_at":             lead.created_at = parseDate(val) || undefined; break;
      case "meta_salesperson":       lead.metadata.salesperson = val; break;
      case "meta_job_type":          lead.metadata.job_type = val; break;
      case "meta_notes":             lead.metadata.notes = val; break;
    }
  }

  if (lsaVal) {
    const { lsa_status, bad_lead } = mapLsaStatus(lsaVal);
    lead.lsa_status = lsa_status;
    if (bad_lead) lead.bad_lead = true;
  }

  return { lead, hasIdentifier };
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ImportLeadsPage() {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep]             = useState<"upload" | "map" | "preview" | "importing" | "done">("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows]       = useState<Record<string, string>[]>([]);
  const [mapping, setMapping]       = useState<Record<string, string>>({});
  const [errors, setErrors]         = useState<string[]>([]);
  const [results, setResults]       = useState({ success: 0, failed: 0 });
  const [fileName, setFileName]     = useState("");
  const [dragging, setDragging]     = useState(false);
  const [sources, setSources]               = useState<{ id: string; name: string }[]>([]);
  const [selectedSource, setSelectedSource] = useState("");
  const [newSourceName, setNewSourceName]   = useState("");

  useEffect(() => {
    supabase.from("lead_sources").select("id,name").order("name")
      .then(({ data }) => setSources(data || []));
  }, []);

  function handleFile(file: File) {
    if (!file.name.endsWith(".csv")) { setErrors(["Please upload a .csv file"]); return; }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSV(text);
      if (!headers.length) { setErrors(["Could not parse CSV — check the file format"]); return; }
      setCsvHeaders(headers); setCsvRows(rows);
      setMapping(autoMap(headers)); setErrors([]);
      setStep("map");
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function handleImport() {
    setStep("importing");
    let success = 0, failed = 0;
    let sourceId: string | null = null;
    if (selectedSource === "__new__" && newSourceName.trim()) {
      const { data } = await supabase.from("lead_sources").insert({ name: newSourceName.trim() }).select().single();
      sourceId = data?.id || null;
    } else if (selectedSource && selectedSource !== "__none__") {
      sourceId = selectedSource;
    }

    const leadsToInsert: any[] = [];
    csvRows.forEach(row => {
      const { lead, hasIdentifier } = buildLead(row, mapping, sourceId);
      if (!hasIdentifier) { failed++; return; }
      leadsToInsert.push(lead);
    });

    for (let i = 0; i < leadsToInsert.length; i += 50) {
      const batch = leadsToInsert.slice(i, i + 50);
      const { error } = await supabase.from("leads").insert(batch);
      if (error) { failed += batch.length; console.error("Import error:", error.message); }
      else success += batch.length;
    }

    setResults({ success, failed });
    setStep("done");
  }

  const mappedCount = Object.values(mapping).filter(Boolean).length;
  const previewRows = csvRows.slice(0, 5);
  const mappedCols  = Object.entries(mapping).filter(([, v]) => v);

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/leads")}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Leads
        </button>
        <div>
          <h1 className="text-xl font-bold">Import Leads</h1>
          <p className="text-xs text-muted-foreground">Upload a CSV — map columns — import directly to CRM</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs">
        {["Upload", "Map Columns", "Preview", "Import"].map((s, i) => {
          const idx    = ["upload","map","preview","importing","done"].indexOf(step);
          const active = i === Math.min(idx, 3);
          const done   = i < idx;
          return (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold
                ${done ? "bg-emerald-500 text-white" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {done ? "✓" : i + 1}
              </div>
              <span className={active ? "font-medium" : "text-muted-foreground"}>{s}</span>
              {i < 3 && <div className="w-8 h-px bg-border" />}
            </div>
          );
        })}
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
          {errors.map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0" /> {e}
            </div>
          ))}
        </div>
      )}

      {/* ── STEP 1: Upload ── */}
      {step === "upload" && (
        <div className="space-y-4">

          {/* Template download — prominent */}
          <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-950/10 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-emerald-800 dark:text-emerald-300 mb-1">
                  Step 1 — Use our standard template
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mb-3">
                  Download the template, fill it in, and your CSV will import perfectly — no manual mapping needed.
                </p>
                <button onClick={downloadTemplate}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors">
                  <Download className="h-4 w-4" /> Download Template CSV
                </button>
              </div>
              <div className="hidden sm:block text-xs text-emerald-700 dark:text-emerald-400 space-y-1 shrink-0">
                <p className="font-semibold mb-1">Template columns:</p>
                {TEMPLATE_COLUMNS.map(c => (
                  <p key={c.col} className="font-mono">{c.col}</p>
                ))}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or upload any CSV and map manually</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Upload zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors
              ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}>
            <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium text-sm mb-1">Drop CSV file here or click to browse</p>
            <p className="text-xs text-muted-foreground">Template CSV, LSA export, JobNimbus, Google Sheets — any CSV works</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden"
              onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
          </div>

          {/* Field reference */}
          <details className="rounded-lg border border-border overflow-hidden">
            <summary className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:bg-muted/30 bg-muted/10">
              View all template fields + accepted values
            </summary>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Column name</th>
                    <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Example</th>
                    <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {TEMPLATE_COLUMNS.map((c, i) => (
                    <tr key={c.col} className={`border-b border-border/50 ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                      <td className="px-4 py-2 font-mono text-primary">{c.col}</td>
                      <td className="px-4 py-2 text-muted-foreground">{c.example}</td>
                      <td className="px-4 py-2 text-muted-foreground">{c.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}

      {/* ── STEP 2: Map columns ── */}
      {step === "map" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4" /> {fileName}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {csvRows.length} rows · {csvHeaders.length} columns · {mappedCount} mapped
              </p>
            </div>
            <button onClick={() => { setStep("upload"); setCsvHeaders([]); setCsvRows([]); setMapping({}); }}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <X className="h-3.5 w-3.5" /> Change file
            </button>
          </div>

          {/* Lead source */}
          <div className="rounded-lg border border-border p-4">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Lead Source</label>
            <select value={selectedSource} onChange={e => setSelectedSource(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
              <option value="">— No source / assign later —</option>
              {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value="__new__">+ Create new source...</option>
            </select>
            {selectedSource === "__new__" && (
              <input
                className="w-full mt-2 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="New source name (e.g. LSA - Teaneck, Pro Referral)"
                value={newSourceName}
                onChange={e => setNewSourceName(e.target.value)}
              />
            )}
          </div>

          {/* Column mapping */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="bg-muted/30 px-4 py-2.5 border-b border-border flex justify-between items-center">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Map CSV Columns → CRM Fields</p>
              <p className="text-xs text-muted-foreground">First row preview on right</p>
            </div>
            <div className="divide-y divide-border">
              {csvHeaders.map(col => (
                <div key={col} className={`flex items-center gap-3 px-4 py-2.5 ${!mapping[col] ? "opacity-50" : ""}`}>
                  <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded w-40 truncate shrink-0">{col}</span>
                  <span className="text-muted-foreground text-xs">→</span>
                  <select
                    value={mapping[col] || ""}
                    onChange={e => setMapping(prev => ({ ...prev, [col]: e.target.value }))}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 ${
                      mapping[col] ? "border-primary/50 bg-primary/5 text-primary font-medium" : "border-border bg-background text-muted-foreground"}`}>
                    <option value="">— Skip —</option>
                    {DB_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                  {mapping[col]
                    ? <span className="text-xs text-emerald-600 font-medium w-5 shrink-0">✓</span>
                    : <span className="text-xs text-muted-foreground w-5 shrink-0">—</span>}
                  <span className="text-xs text-muted-foreground w-32 truncate shrink-0 hidden sm:block">
                    {String(csvRows[0]?.[col] || "").split("\n")[0].slice(0, 28) || "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button onClick={() => setStep("upload")}
              className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors">
              Back
            </button>
            <button onClick={() => { setErrors([]); setStep("preview"); }} disabled={mappedCount === 0}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium disabled:opacity-40">
              Preview Import →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Preview ── */}
      {step === "preview" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 p-3 flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Showing first 5 of {csvRows.length} rows. Review then import.
          </div>
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  {mappedCols.map(([col, field]) => (
                    <th key={col} className="text-left text-xs font-semibold text-muted-foreground px-3 py-2 whitespace-nowrap">
                      {DB_FIELDS.find(f => f.key === field)?.label || field}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/10">
                    {mappedCols.map(([col]) => (
                      <td key={col} className="px-3 py-2 text-foreground truncate max-w-[160px]">
                        {String(row[col] || "").split("\n")[0] || <span className="text-muted-foreground/50">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setStep("map")}
              className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors">
              ← Back
            </button>
            <button onClick={handleImport}
              className="px-5 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium">
              Import {csvRows.length} Leads →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Importing ── */}
      {step === "importing" && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="font-medium">Importing leads...</p>
          <p className="text-xs text-muted-foreground">Do not close this page</p>
        </div>
      )}

      {/* ── STEP 5: Done ── */}
      {step === "done" && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <CheckCircle className="h-12 w-12 text-emerald-500" />
          <div>
            <p className="text-xl font-bold">Import Complete</p>
            <p className="text-sm text-muted-foreground mt-1">
              <span className="text-emerald-600 font-semibold">{results.success} leads imported</span>
              {results.failed > 0 && <span className="text-red-500 ml-2">· {results.failed} skipped (no phone or name)</span>}
            </p>
          </div>
          <div className="flex gap-3 flex-wrap justify-center">
            <button onClick={() => router.push("/leads")}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium">
              View Leads
            </button>
            <button onClick={() => router.push("/kpi")}
              className="px-4 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-medium">
              View KPI
            </button>
            <button onClick={() => { setStep("upload"); setCsvRows([]); setCsvHeaders([]); setMapping({}); setFileName(""); }}
              className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors">
              Import Another
            </button>
          </div>
        </div>
      )}

    </div>
  );
}