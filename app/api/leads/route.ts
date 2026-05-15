import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ✅ Always normalize phone to (XXX) XXX-XXXX format
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 10) {
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  return raw; // return as-is if not 10 digits (e.g. international)
}

export async function POST(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();

  // ─── Duplicate check ────────────────────────────────────────────────────────
  if (body.phone && !body.force) {
    // ✅ Normalize BOTH the input and what we search for
    // This ensures "(857) 415-8990" matches "(857) 415-8990" exactly
    const normalizedInput = normalizePhone(body.phone);
    const rawInput        = body.phone;

    // Strategy: search for normalized format AND raw input
    // Uses .eq() (exact match) which is reliable with special characters
    let existingLead: any = null;

    // Try exact match on normalized format first
    const { data: match1 } = await supabase
      .from("leads")
      .select("id, lead_name, status, phone")
      .eq("phone", normalizedInput)
      .neq("archived", true)
      .limit(1)
      .maybeSingle();

    existingLead = match1;

    // If not found, try exact match on raw input (in case stored differently)
    if (!existingLead && rawInput !== normalizedInput) {
      const { data: match2 } = await supabase
        .from("leads")
        .select("id, lead_name, status, phone")
        .eq("phone", rawInput)
        .neq("archived", true)
        .limit(1)
        .maybeSingle();
      existingLead = match2;
    }

    // If still not found, do a digit-normalized comparison on recent leads
    // (catches leads stored in any format — last resort, limited to 200 rows)
    if (!existingLead) {
      const inputDigits = body.phone.replace(/\D/g, "");
      if (inputDigits.length >= 7) {
        const { data: candidates } = await supabase
          .from("leads")
          .select("id, lead_name, status, phone")
          .neq("archived", true)
          .order("created_at", { ascending: false })
          .limit(200);

        existingLead = (candidates || []).find((l: any) =>
          l.phone?.replace(/\D/g, "") === inputDigits
        ) || null;
      }
    }

    if (existingLead) {
      return NextResponse.json(
        {
          duplicate: true,
          existing: {
            id:         existingLead.id,
            name:       existingLead.lead_name || "Unnamed Lead",
            status:     existingLead.status    || "unknown",
            phone:      existingLead.phone     || body.phone,
            created_at: existingLead.created_at,
          },
        },
        { status: 409 }
      );
    }
  }

  // ─── Source lookup ──────────────────────────────────────────────────────────
  let source_id = body.source_id || null;
  if (!source_id && body.lead_source) {
    const { data: src } = await supabase
      .from("lead_sources")
      .select("id")
      .ilike("name", `%${body.lead_source}%`)
      .limit(1)
      .single();
    source_id = src?.id || null;
  }

  // ─── Insert ─────────────────────────────────────────────────────────────────
  const { data, error } = await supabase.from("leads").insert([
    {
      // ✅ NEVER insert first_name/last_name — GENERATED ALWAYS columns
      lead_name:              body.lead_name || "LSA Lead",

      // ✅ Normalize phone before storing so future dedup is reliable
      phone:                  body.phone ? normalizePhone(body.phone) : null,
      email:                  body.email || null,

      // ✅ Lead received date
      created_at:             body.created_at || new Date().toISOString(),

      // Address
      client_address:         body.client_address  || body.address_line_1 || null,
      client_city:            body.client_city     || body.city           || null,
      client_state:           body.client_state    || body.state          || null,
      client_zip:             body.client_zip      || body.postal_code    || body.zip || null,

      // Lead classification
      source_id:              source_id,
      status:                 body.status       || "new_lead",
      contact_type:           body.contact_type || null,
      lsa_status:             body.lsa_status   || null,
      bad_lead:               body.bad_lead     || false,
      archived:               false,

      // Revenue
      initial_contract_value: body.initial_contract_value || 0,

      // Metadata
      metadata: {
        salesperson: body.meta_salesperson || body.salesperson || null,
        job_type:    body.meta_job_type    || body.job_type    || null,
        notes:       body.meta_notes       || body.notes       || null,
        source:      body.lead_source      || null,
      },
    },
  ]);

  if (error) {
    console.error("Supabase insert error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}