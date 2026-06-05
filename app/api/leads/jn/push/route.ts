import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const JN_API_KEY = process.env.JOBNIMBUS_API_KEY!
const JN_BASE_URL = 'https://app.jobnimbus.com/api1'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { lead_id } = await req.json()

    if (!lead_id) {
      return NextResponse.json({ error: 'lead_id required' }, { status: 400 })
    }

    const { data: lead, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', lead_id)
      .single()

    if (error || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const payload = buildJNPayload(lead)

    // Log payload for debugging
    console.log('[JN] Payload:', JSON.stringify(payload))

    if (lead.jn_contact_id) {
      const updateRes = await fetch(`${JN_BASE_URL}/contacts/${lead.jn_contact_id}`, {
        method: 'PUT',
        headers: {
          'Authorization': JN_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const updateText = await updateRes.text()
      console.log('[JN] Update response:', updateRes.status, updateText)

      if (!updateRes.ok) {
        return NextResponse.json({ error: `JN update failed: ${updateText}` }, { status: 500 })
      }

      return NextResponse.json({ success: true, action: 'updated', jn_contact_id: lead.jn_contact_id })
    }

    const createRes = await fetch(`${JN_BASE_URL}/contacts`, {
      method: 'POST',
      headers: {
        'Authorization': JN_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const createText = await createRes.text()
    console.log('[JN] Create response:', createRes.status, createText)

    if (!createRes.ok) {
      return NextResponse.json({ error: `JN create failed: ${createText}` }, { status: 500 })
    }

    let jnData: any = {}
    try {
      jnData = JSON.parse(createText)
    } catch (e) {
      return NextResponse.json({ error: `JN parse failed: ${createText}` }, { status: 500 })
    }

    const jn_contact_id = jnData.jnid || jnData.id || jnData.record_id

    await supabase
      .from('leads')
      .update({
        jn_contact_id,
        jn_sync_status: 'synced',
        jn_synced_at: new Date().toISOString(),
      })
      .eq('id', lead_id)

    return NextResponse.json({ success: true, action: 'created', jn_contact_id })

  } catch (err: any) {
    console.error('[JN] Caught error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function buildJNPayload(lead: any) {
  const firstName = lead.first_name || lead.lead_name?.split(' ')[0] || ''
  const lastName = lead.last_name || lead.lead_name?.split(' ').slice(1).join(' ') || ''
  const displayName = `${firstName} ${lastName}`.trim() || lead.lead_name || 'Unknown'

  return {
    first_name: firstName,
    last_name: lastName,
    display_name: displayName,
    email: lead.email ? [{ email: lead.email }] : [],
    phone: lead.phone ? [{ number: lead.phone, type: 'mobile' }] : [],
    address_line_1: lead.client_address || '',
    city: lead.client_city || '',
    state: lead.client_state || '',
    zip: lead.client_zip || '',
    tags: ['com-center'],
  }
}