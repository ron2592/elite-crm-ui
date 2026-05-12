"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  Upload, ChevronLeft, AlertCircle, CheckCircle,
  Loader2, X, FileText,
} from "lucide-react";

// ── CRM Fields ─────────────────────────────────────────────────────────────────
const DB_FIELDS = [
  { key: "phone",                   label: "Phone",                      required: false },
  { key: "first_name",              label: "First Name",                 required: false },
  { key: "last_name",               label: "Last Name",                  required: false },
  { key: "full_name",               label: "Full Name (auto-split)",     required: false },
  { key: "location",                label: "Location (auto-parse city)", required: false },
  { key: "client_city",             label: "City",                       required: false },
  { key: "client_address",          label: "Street Address",             required: false },
  { key: "client_state",            label: "State",                      required: false },
  { key: "client_zip",              label: "ZIP Code",                   required: false },
  { key: "lsa_status",              label: "LSA Status (Charged/Credited/etc)", required: false },
  { key: "contact_type",            label: "Contact Type",               required: false },
  { key: "visited",                 label: "Visited? (true/false → in_person)", required: false },
  { key: "estimate_sent",           label: "Estimate Sent? (true/false)", required: false },
  { key: "job_closed",              label: "Job Closed? (true/false)",   required: false },
  { key: "bad_lead",                label: "Bad Lead? (true/false)",     required: false },
  { key: "initial_contract_value",  label: "Contract Value ($)",         required: false },
  { key: "created_at",              label: "Date Received",              required: false },
  { key: "meta_salesperson",        label: "Salesperson",                required: false },
  { key: "meta_job_type",           label: "Job Type",                   required: false },
  { key: "meta_notes",              label: "Notes",                      required: false },
];

// ── Auto-detect column mapping ─────────────────────────────────────────────────
function autoMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases: Record<string, string[]> = {
    phone:                  ["customer", "customersnum", "phonenumber", "mobile", "cell", "telephone", "tel", "unnamed0"],
    first_name:             ["firstname", "fname", "givenname"],
    last_name:              ["lastname", "lname", "surname"],
    full_name:              ["name", "fullname", "clientname", "customername"],
    location:               ["location"],
    client_city:            ["city", "town"],
    client_address:         ["address", "street", "streetaddress"],
    client_state:           ["state", "province"],
    client_zip:             ["zip", "zipcode", "postalcode", "postal"],
    lsa_status:             ["leadstatus", "lsastatus", "status2"],
    contact_type:           ["leadtype", "contacttype", "type"],
    visited:                ["visited"],
    estimate_sent:          ["estimatesent", "estimate"],
    job_closed:             ["jobclosed", "closed", "won"],
    bad_lead:               ["badlead", "bad"],
    initial_contract_value: ["initialvolume", "projectrevenue", "revenue", "contractvalue", "amount", "value"],
    created_at:             ["leadreceived", "datereceived", "date", "createdat", "received"],
    meta_salesperson:       ["technicians", "salesperson", "assignedto", "rep", "agent"],
    meta_job_type:          ["jobtype", "job", "service", "worktype"],
    meta_notes:             ["notes", "note", "comments", "description"],
  };
  headers.forEach(h => {
    const normalized = n(h);
    for (const [field, aliasList] of Object.entries(aliases)) {
      if (normalized === n(field) || aliasList.some(a => normalized.includes(a))) {
        map[h] = field;
        return;
      }
    }
  });
  return map;
}

// ── Value helpers ──────────────────────────────────────────────────────────────
function parseBool(val: string) {
  return ["true", "yes", "1"].includes((val || "").trim().toLowerCase());
}

function parseLocation(loc: string) {
  if (!loc?.trim()) return {};
  const parts = loc.split(",");
  if (parts.length >= 2) {
    const addr  = parts[0].trim();
    const rest  = parts.slice(1).join(",").trim();
    const match = rest.match(/([A-Z]{2})\s*(\d{5})?$/);
    if (match) return {
      client_address: addr,
      client_city:    rest.replace(match[0], "").trim(),
      client_state:   match[1],
      client_zip:     match[2] || null,
    };
    return { client_address: addr, client_city: rest };
  }
  return { client_city: loc.trim() };
}

function parseName(name: string) {
  if (!name?.trim()) return {};
  const parts = name.trim().split(" ");
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") || null };
}

function mapLsaStatus(val: string): { lsa_status: string | null; bad_lead: boolean } {
  const v = (val || "").trim().toLowerCase();
  if (v === "charged")     return { lsa_status: "charged",     bad_lead: false };
  if (v === "submitted")   return { lsa_status: "charged",     bad_lead: true  }; // disputed
  if (v === "not charged") return { lsa_status: "not_charged", bad_lead: false };
  if (v === "credited")    return { lsa_status: "credited",    bad_lead: false };
  if (v === "in review")   return { lsa_status: "in_review",   bad_lead: true  };
  return { lsa_status: null, bad_lead: false };
}

function parseRevenue(val: string) {
  const n = parseFloat((val || "").replace(/[$,]/g, "").trim());
  return isNaN(n) ? 0 : n;
}

function parseDate(val: string) {
  if (!val?.trim()) return null;
  try {
    const d = new Date(val.trim());
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch {}
  return null;
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map(line => {
    const cols: string[] = [];
    let cur = "", inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === "," && !inQuote) { cols.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur.trim());
    return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? ""]));
  });
  return { headers, rows };
}

// ── Build lead from a CSV row ─────────────────────────────────────────────────
function buildLead(row: Record<string, string>, mapping: Record<string, string>, sourceId: string | null) {
  const lead: any = {
    archived:  false,
    status:    "new_lead",
    source_id: sourceId,
    metadata:  { imported_from: "csv", import_date: new Date().toISOString() },
  };
  let hasIdentifier = false;
  let lsaVal = "";

  for (const [csvCol, crmField] of Object.entries(mapping)) {
    if (!crmField || crmField === "skip") continue;
    const val = String(row[csvCol] || "").trim();
    if (!val) continue;

    switch (crmField) {
      case "phone":                  lead.phone = val; hasIdentifier = true; break;
      case "first_name":             lead.first_name = val; hasIdentifier = true; break;
      case "last_name":              lead.last_name = val; break;
      case "full_name":              Object.assign(lead, parseName(val)); hasIdentifier = true; break;
      case "location":               Object.assign(lead, parseLocation(val)); break;
      case "client_city":            lead.client_city = val; break;
      case "client_address":         lead.client_address = val; break;
      case "client_state":           lead.client_state = val; break;
      case "client_zip":             lead.client_zip = val; break;
      case "lsa_status":             lsaVal = val; break;
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

  // Apply LSA status (may override bad_lead)
  if (lsaVal) {
    const { lsa_status, bad_lead } = mapLsaStatus(lsaVal);
    lead.lsa_status = lsa_status;
    if (bad_lead) lead.bad_lead = true;
  }

  return { lead, hasIdentifier };
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ImportLeadsPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep]         = useState<"upload" | "map" | "preview" | "importing" | "done">("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows]   = useState<Record<string, string>[]>([]);
  const [mapping, setMapping]   = useState<Record<string, string>>({});
  const [errors, setErrors]     = useState<string[]>([]);
  const [results, setResults]   = useState({ success: 0, failed: 0 });
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);

  // Lead source
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
      setCsvHeaders(headers);
      setCsvRows(rows);
      setMapping(autoMap(headers));
      setErrors([]);
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

    // Get or create source
    let sourceId: string | null = null;
    if (selectedSource === "__new__" && newSourceName.trim()) {
      const { data } = await supabase.from("lead_sources").insert({ name: newSourceName.trim() }).select().single();
      sourceId = data?.id || null;
    } else if (selectedSource && selectedSource !== "__none__") {
      sourceId = selectedSource;
    }

    // Build leads
    const leadsToInsert: any[] = [];
    csvRows.forEach(row => {
      const { lead, hasIdentifier } = buildLead(row, mapping, sourceId);
      if (!hasIdentifier) { failed++; return; }
      leadsToInsert.push(lead);
    });

    // Batch insert
    for (let i = 0; i < leadsToInsert.length; i += 50) {
      const batch = leadsToInsert.slice(i, i + 50);
      const { error } = await supabase.from("leads").insert(batch);
      if (error) { failed += batch.length; console.error("Import batch error:", error.message); }
      else success += batch.length;
    }

    setResults({ success, failed });
    setStep("done");
  }

  const mappedCount  = Object.values(mapping).filter(Boolean).length;
  const previewRows  = csvRows.slice(0, 5);
  const mappedCols   = Object.entries(mapping).filter(([, v]) => v && v !== "skip");

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
          const stepIdx = ["upload","map","preview","importing","done"].indexOf(step);
          const active  = i === Math.min(stepIdx, 3);
          const done    = i < stepIdx;
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
        <>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-colors
              ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}>
            <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium text-sm mb-1">Drop your CSV file here</p>
            <p className="text-xs text-muted-foreground">or click to browse</p>
            <p className="text-xs text-muted-foreground mt-2">Works with LSA exports, JobNimbus, Google Sheets, any CSV</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden"
              onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
          </div>
          <div className="rounded-lg bg-muted/30 p-4 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tips</p>
            <p className="text-xs text-muted-foreground">• First row must be column headers</p>
            <p className="text-xs text-muted-foreground">• Columns are auto-detected — you can adjust in the next step</p>
            <p className="text-xs text-muted-foreground">• LSA Status: Charged, Submitted (bad lead), Credited, Not charged</p>
            <p className="text-xs text-muted-foreground">• Export from Google Sheets or JobNimbus as CSV and upload directly</p>
          </div>
        </>
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

          {/* Lead source selector */}
          <div className="rounded-lg border border-border p-4">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Lead Source
            </label>
            <select value={selectedSource} onChange={e => setSelectedSource(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
              <option value="">— No source / select later —</option>
              {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value="__new__">+ Create new source...</option>
            </select>
            {selectedSource === "__new__" && (
              <input
                className="w-full mt-2 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="New source name (e.g. LSA - Teaneck)"
                value={newSourceName}
                onChange={e => setNewSourceName(e.target.value)}
              />
            )}
          </div>

          {/* Column mapping table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="bg-muted/30 px-4 py-2.5 border-b border-border flex justify-between items-center">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Map CSV → CRM Fields</p>
              <p className="text-xs text-muted-foreground">Preview value shown on right</p>
            </div>
            <div className="divide-y divide-border">
              {csvHeaders.map(col => (
                <div key={col} className="flex items-center gap-3 px-4 py-2.5">
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
                  {mapping[col] && <span className="text-xs text-emerald-600 font-medium shrink-0">✓</span>}
                  <span className="text-xs text-muted-foreground w-28 truncate shrink-0 hidden sm:block">
                    {String(csvRows[0]?.[col] || "").slice(0, 25) || "—"}
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
            <button
              onClick={() => { setErrors([]); setStep("preview"); }}
              disabled={mappedCount === 0}
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
            Showing first 5 rows of {csvRows.length} total. Review before importing.
          </div>

          <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
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
                        {row[col] || <span className="text-muted-foreground/50">—</span>}
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
              {results.failed > 0 && (
                <span className="text-red-500 ml-2">· {results.failed} skipped (no phone or name)</span>
              )}
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => router.push("/leads")}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium">
              View Leads Pipeline
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