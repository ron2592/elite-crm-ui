import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();

  const { data, error } = await supabase.from("leads").insert([
    {
      lead_name: body.lead_name,
      first_name: body.first_name,
      last_name: body.last_name,
      phone: body.phone,
      email: body.email,
      address_line_1: body.address_line_1,
      city: body.city,
      state: body.state,
      postal_code: body.postal_code || body.zip || null,
      source_email: body.source_email,
      pipeline_stage_id: "f54efb42-a10a-44b7-81b3-de852e0a4197",
      status: "new",
      lead_received_at: new Date(),
      appointment_set: false,
      estimate_sent: false,
      follow_up_count: 0,
      archived: false,
      metadata: {
        salesperson: body.salesperson || null,
        job_type: body.job_type || null,
        notes: body.notes || null,
      },
    },
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}