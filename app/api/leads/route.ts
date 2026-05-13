import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();

  // ⚠️ NEVER insert first_name or last_name — they are GENERATED ALWAYS columns
  // Postgres auto-computes them from lead_name via split_part()

  // If lead_source string is provided (e.g. "LSA"), look up the source_id
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

  const { data, error } = await supabase.from("leads").insert([
    {
      // ✅ Required — first_name/last_name auto-generate from this
      lead_name:               body.lead_name || "LSA Lead",

      // Contact
      phone:                   body.phone    || null,
      email:                   body.email    || null,

      // Address — correct column names from schema
      client_address:          body.client_address  || body.address_line_1 || null,
      client_city:             body.client_city     || body.city           || null,
      client_state:            body.client_state    || body.state          || null,
      client_zip:              body.client_zip      || body.postal_code    || body.zip || null,

      // Lead classification
      source_id:               source_id,
      status:                  body.status       || "new_lead",
      contact_type:            body.contact_type || null,
      lsa_status:              body.lsa_status   || null,
      bad_lead:                body.bad_lead     || false,
      archived:                false,

      // Revenue
      initial_contract_value:  body.initial_contract_value || 0,

      // Metadata (salesperson, job_type, notes all go here)
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