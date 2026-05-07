"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, ChevronLeft, AlertCircle, CheckCircle, Loader2, X, FileText } from "lucide-react";

// ─── Expected DB fields ────────────────────────────────────────────────────────
const DB_FIELDS = [
  { key: "first_name",      label: "First Name",       required: true  },
  { key: "last_name",       label: "Last Name",         required: false },
  { key: "phone",           label: "Phone",             required: true  },
  { key: "email",           label: "Email",             required: false },
  { key: "address_line_1",  label: "Address",           required: false },
  { key: "city",            label: "City",              required: false },
  { key: "state",           label: "State",             required: false },
  { key: "postal_code",     label: "Zip Code",          required: false },
  { key: "lead_source",     label: "Lead Source",       required: false },
  { key: "job_type",        label: "Job Type",          required: false },
  { key: "salesperson",     label: "Salesperson",       required: false },
  { key: "estimated_amount",label: "Estimated Amount",  required: false },
  { key: "notes",           label: "Notes",             required: false },
  { key: "status",          label: "Status",            required: false },
  { key: "created_at",      label: "Date Received",     required: false },
];

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map(line => {
    // Handle quoted commas
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

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// Auto-detect mapping from CSV header to DB field
function autoMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases: Record<string, string[]> = {
    first_name:       ["firstname","first","fname","givenname"],
    last_name:        ["lastname","last","lname","surname","familyname"],
    phone:            ["phone","phonenumber","mobile","cell","telephone","tel"],
    email:            ["email","emailaddress","mail"],
    address_line_1:   ["address","streetaddress","address1","street"],
    city:             ["city","town"],
    state:            ["state","province","region"],
    postal_code:      ["zip","zipcode","postalcode","postal"],
    lead_source:      ["source","leadsource","leadtype","campaign"],
    job_type:         ["jobtype","job","service","type","worktype"],
    salesperson:      ["salesperson","sales","rep","agent","assignedto"],
    estimated_amount: ["estimatedamount","estimate","amount","value","price"],
    notes:            ["notes","note","comments","comment","description"],
    status:           ["status","stage","leadstatus"],
    created_at:       ["createdat","datereceived","date","leaddate","received"],
  };
  headers.forEach(h => {
    const n = normalize(h);
    for (const [field, aliasList] of Object.entries(aliases)) {
      if (n === normalize(field) || aliasList.some(a => n === a)) {
        map[h] = field;
        break;
      }
    }
  });
  return map;
}

export default function ImportLeadsPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "map" | "preview" | "importing" | "done">("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [results, setResults] = useState({ success: 0, failed: 0 });
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);

  function handleFile(file: File) {
    if (!file.name.endsWith(".csv")) {
      setErrors(["Please upload a .csv file"]);
      return;
    }
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
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function validateMapping() {
    const errs: string[] = [];
    const requiredFields = DB_FIELDS.filter(f => f.required).map(f => f.key);
    const mappedValues = Object.values(mapping);
    requiredFields.forEach(f => {
      if (!mappedValues.includes(f)) errs.push(`Required field "${DB_FIELDS.find(d => d.key === f)?.label}" is not mapped`);
    });
    return errs;
  }

  async function handleImport() {
    setStep("importing");
    let success = 0, failed = 0;

    for (const row of csvRows) {
      // Build the lead object from mapping
      const mapped: Record<string, any> = {};
      Object.entries(mapping).forEach(([csvCol, dbField]) => {
        if (dbField && row[csvCol] !== undefined) mapped[dbField] = row[csvCol];
      });

      if (!mapped.first_name && !mapped.phone) { failed++; continue; }

      const full_name = `${mapped.first_name || ""} ${mapped.last_name || ""}`.trim();
      const phone = mapped.phone ? formatPhone(mapped.phone) : "";

      try {
        const res = await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lead_name:        full_name || phone,
            last_name:        mapped.last_name || null,
            phone:            phone,
            email:            mapped.email || null,
            address_line_1:   mapped.address_line_1 || null,
            city:             mapped.city || null,
            state:            mapped.state || null,
            postal_code:      mapped.postal_code || null,
            lead_source:      mapped.lead_source || null,
            job_type:         mapped.job_type || null,
            salesperson:      mapped.salesperson || null,
            estimated_amount: mapped.estimated_amount ? Number(mapped.estimated_amount.replace(/[^0-9.]/g, "")) : 0,
            notes:            mapped.notes || null,
            status:           mapped.status || "new",
            created_at:       mapped.created_at || null,
            archived:         false,
          }),
        });
        if (res.ok) success++; else failed++;
      } catch { failed++; }
    }

    setResults({ success, failed });
    setStep("done");
  }

  const mappedCount = Object.values(mapping).filter(Boolean).length;
  const previewRows = csvRows.slice(0, 5);

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/leads")}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Leads
        </button>
        <div>
          <h1 className="text-xl font-bold">Import Leads</h1>
          <p className="text-xs text-muted-foreground">Upload a CSV file to bulk import leads</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs">
        {["Upload", "Map Columns", "Preview", "Import"].map((s, i) => {
          const stepIdx = ["upload","map","preview","importing","done"].indexOf(step);
          const active = i === Math.min(stepIdx, 3);
          const done = i < stepIdx;
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
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-colors
            ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
        >
          <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="font-medium text-sm mb-1">Drop your CSV file here</p>
          <p className="text-xs text-muted-foreground">or click to browse</p>
          <input ref={fileRef} type="file" accept=".csv" className="hidden"
            onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
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

          <div className="rounded-lg border border-border overflow-hidden">
            <div className="bg-muted/30 px-4 py-2.5 border-b border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Column Mapping</p>
            </div>
            <div className="divide-y divide-border">
              {csvHeaders.map(col => (
                <div key={col} className="flex items-center gap-4 px-4 py-2.5">
                  <span className="text-sm w-44 truncate text-muted-foreground">{col}</span>
                  <span className="text-muted-foreground">→</span>
                  <select
                    value={mapping[col] || ""}
                    onChange={e => setMapping(prev => ({ ...prev, [col]: e.target.value }))}
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <option value="">— Skip this column —</option>
                    {DB_FIELDS.map(f => (
                      <option key={f.key} value={f.key}>
                        {f.label}{f.required ? " *" : ""}
                      </option>
                    ))}
                  </select>
                  {mapping[col] && (
                    <span className="text-xs text-emerald-600 font-medium shrink-0">✓ mapped</span>
                  )}
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
              onClick={() => {
                const errs = validateMapping();
                if (errs.length) { setErrors(errs); return; }
                setErrors([]);
                setStep("preview");
              }}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
            >
              Preview Import →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Preview ── */}
      {step === "preview" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border p-3 bg-blue-50/50 dark:bg-blue-950/20 flex items-center gap-2 text-sm text-blue-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Showing first 5 rows of {csvRows.length} total. Review before importing.
          </div>

          <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  {Object.entries(mapping).filter(([,v]) => v).map(([col, field]) => (
                    <th key={col} className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">
                      {DB_FIELDS.find(f => f.key === field)?.label || field}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    {Object.entries(mapping).filter(([,v]) => v).map(([col]) => (
                      <td key={col} className="px-3 py-2 text-xs truncate max-w-[180px]">
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
              Back
            </button>
            <button onClick={handleImport}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium">
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
          <p className="text-xs text-muted-foreground">Please wait, do not close this page</p>
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
              {results.failed > 0 && <span className="text-red-500 ml-2">· {results.failed} failed (missing name/phone)</span>}
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => router.push("/leads")}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium">
              View Leads Pipeline
            </button>
            <button onClick={() => { setStep("upload"); setCsvRows([]); setCsvHeaders([]); setMapping({}); setFileName(""); }}
              className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors">
              Import Another File
            </button>
          </div>
        </div>
      )}

      {/* Helper text */}
      {step === "upload" && (
        <div className="rounded-lg bg-muted/30 p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">CSV Format Tips</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• First row must be column headers</li>
            <li>• Required columns: <span className="font-medium text-foreground">First Name</span> and <span className="font-medium text-foreground">Phone</span></li>
            <li>• Column names are auto-detected — you can rename them in the next step</li>
            <li>• Dates should be in MM/DD/YYYY or YYYY-MM-DD format</li>
            <li>• Export your Google Sheet or existing CRM as CSV and upload directly</li>
          </ul>
        </div>
      )}
    </div>
  );
}