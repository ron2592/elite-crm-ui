import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ✅ Always normalize phone to (XXX) XXX-XXXX format
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 10) {
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  return raw;
}

// ✅ Map Command Center lead source name to JN lead source name
function mapLeadSource(sourceName: string | null): string {
  if (!sourceName) return "";
  const name = sourceName.toLowerCase();
  if (name.includes("facebook") || name.includes("social media")) return "Facebook";
  if (name.includes("google")) return "Google Ads";
  if (name.includes("referral")) return "Referral";
  if (name.includes("angi") || name.includes("homeadvisor")) return "HomeAdvisor";
  if (name.includes("canvass")) return "Canvassing";
  return "";
}

// ✅ Push new lead to JobNimbus as a contact under Elite Work Home Improvement
async function pushToJobNimbus(lead: {
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  client_address?: string;
  client_city?: string;
  client_state?: string;
  client_zip?: string;
  lead_source?: string;
}) {
  const apiKey = process.env.JOBNIMBUS_API_KEY;
  if (!apiKey) {
    console.warn("JOBNIMBUS_API_KEY not set — skipping JN sync");
    return null;
  }

  const nameParts = (lead.first_name || lead.last_name)
    ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
    : "Unknown";

  const payload: Record<string, any> = {
    first_name:    lead.first_name  || "",
    last_name:     lead.last_name   || "",
    display_name:  nameParts,
    // Phone fields
    ...(lead.phone && { mobile_phone: lead.phone, number: lead.phone }),
    // Email
    ...(lead.email && { email: lead.email }),
    // Address
    ...(lead.client_address && { address_line1: lead.client_address }),
    ...(lead.client_city    && { city:          lead.client_city }),
    ...(lead.client_state   && { state_text:    lead.client_state }),
    ...(lead.client_zip     && { zip:           lead.client_zip }),
    // Lead source
    ...(lead.lead_source && { lead_source: mapLeadSource(lead.lead_source) }),
    // Contact type = Lead (status in JN workflow)
    record_type_name: "Customer",
    status_name:      "Lead",
    // Tag so we know it came from Command Center
    tags: ["Command Center"],
  };

  try {
    const res = await fetch("https://app.jobnimbus.com/api1/contacts", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok) {
      console.error("JN API error:", json);
      return null;
    }
    console.log("JN contact created:", json.jnid);
    return json.jnid as string;
  } catch (err) {
    console.error("JN push failed:", err);
    return null;
  }
}

export async function POST(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();

  // ─── Duplicate check ────────────────────────────────────────────────────────
  if (body.phone && !body.force) {
    const normalizedInput = normalizePhone(body.phone);
    const rawInput        = body.phone;

    let existingLead: any = null;

    const { data: match1 } = await supabase
      .from("leads")
      .select("id, lead_name, status, phone")
      .eq("phone", normalizedInput)
      .neq("archived", true)
      .limit(1)
      .maybeSingle();

    existingLead = match1;

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
  let sourceName: string | null = null;

  if (!source_id && body.lead_source) {
    const { data: src } = await supabase
      .from("lead_sources")
      .select("id, name")
      .ilike("name", `%${body.lead_source}%`)
      .limit(1)
      .single();
    source_id  = src?.id   || null;
    sourceName = src?.name || body.lead_source || null;
  } else if (source_id) {
    const { data: src } = await supabase
      .from("lead_sources")
      .select("name")
      .eq("id", source_id)
      .maybeSingle();
    sourceName = src?.name || null;
  }

  // ─── Parse name ─────────────────────────────────────────────────────────────
  let firstName = body.first_name || "";
  let lastName  = body.last_name  || "";

  // If lead_name provided but not split, try to split it
  if (!firstName && !lastName && body.lead_name) {
    const parts = body.lead_name.trim().split(" ");
    firstName = parts[0] || "";
    lastName  = parts.slice(1).join(" ") || "";
  }

  // ─── Insert to Supabase ─────────────────────────────────────────────────────
  const { data, error } = await supabase.from("leads").insert([
    {
      lead_name:              body.lead_name || `${firstName} ${lastName}`.trim() || "LSA Lead",
      phone:                  body.phone ? normalizePhone(body.phone) : null,
      email:                  body.email || null,
      created_at:             body.created_at || new Date().toISOString(),
      client_address:         body.client_address  || body.address_line_1 || null,
      client_city:            body.client_city     || body.city           || null,
      client_state:           body.client_state    || body.state          || null,
      client_zip:             body.client_zip      || body.postal_code    || body.zip || null,
      source_id:              source_id,
      status:                 body.status       || "new_lead",
      contact_type:           body.contact_type || null,
      lsa_status:             body.lsa_status   || null,
      bad_lead:               body.bad_lead     || false,
      archived:               false,
      initial_contract_value: body.initial_contract_value || 0,
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

  // ─── Push to JobNimbus (non-blocking) ───────────────────────────────────────
  const jnId = await pushToJobNimbus({
    first_name:     firstName,
    last_name:      lastName,
    phone:          body.phone ? normalizePhone(body.phone) : undefined,
    email:          body.email || undefined,
    client_address: body.client_address || body.address_line_1 || undefined,
    client_city:    body.client_city    || body.city           || undefined,
    client_state:   body.client_state   || body.state          || undefined,
    client_zip:     body.client_zip     || body.postal_code    || body.zip || undefined,
    lead_source:    sourceName || body.lead_source || undefined,
  });

  return NextResponse.json({ success: true, data, jn_id: jnId || null });
}
