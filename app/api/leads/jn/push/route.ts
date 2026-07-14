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
    const rawBody = await req.text()
    console.log('[JN] Raw incoming body:', rawBody)

    let lead_id: string | undefined
    let operation: string = 'INSERT'

    try {
      const parsed = JSON.parse(rawBody)
      lead_id   = parsed?.lead_id ?? parsed?.record?.id ?? parsed?.id
      operation = parsed?.operation ?? 'INSERT'
      console.log('[JN] lead_id:', lead_id, '| operation:', operation)
    } catch (parseErr) {
      console.error('[JN] Body parse failed:', parseErr)
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!lead_id) {
      console.error('[JN] lead_id missing')
      return NextResponse.json({ error: 'lead_id required' }, { status: 400 })
    }

    // ── Auto-cleanup old HTTP response logs to prevent Disk IO buildup ────────
    try {
      await supabase.rpc('cleanup_http_response_logs')
    } catch (_) {}

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (operation === 'DELETE') {
      console.log('[JN] DELETE operation — lead removed from ComCenter:', lead_id)
      return NextResponse.json({ success: true, action: 'delete_noted', lead_id })
    }

    // ── Fetch lead from Supabase ──────────────────────────────────────────────
    const { data: lead, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', lead_id)
      .single()

    if (error || !lead) {
      console.error('[JN] Lead not found:', lead_id, error)
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    console.log('[JN] Lead fetched:', lead.id, lead.lead_name)

    const payload = buildJNPayload(lead)
    console.log('[JN] Payload:', JSON.stringify(payload))

    // ── UPDATE existing JN contact ────────────────────────────────────────────
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
        await supabase
          .from('leads')
          .update({ jn_sync_status: 'failed' })
          .eq('id', lead_id)
        return NextResponse.json({ error: `JN update failed: ${updateText}` }, { status: 500 })
      }

      await supabase
        .from('leads')
        .update({ jn_sync_status: 'synced', jn_synced_at: new Date().toISOString() })
        .eq('id', lead_id)

      return NextResponse.json({ success: true, action: 'updated', jn_contact_id: lead.jn_contact_id })
    }

    // ── CREATE new JN contact ─────────────────────────────────────────────────
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
      await supabase
        .from('leads')
        .update({ jn_sync_status: 'failed' })
        .eq('id', lead_id)
      return NextResponse.json({ error: `JN create failed: ${createText}` }, { status: 500 })
    }

    let jnData: any = {}
    try {
      jnData = JSON.parse(createText)
    } catch (e) {
      console.error('[JN] Failed to parse create response:', createText)
      return NextResponse.json({ error: `JN parse failed: ${createText}` }, { status: 500 })
    }

    const jn_contact_id = jnData.jnid || jnData.id || jnData.record_id
    console.log('[JN] Created contact ID:', jn_contact_id)

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
  const lastName  = lead.last_name  || lead.lead_name?.split(' ').slice(1).join(' ') || ''
  const displayName = `${firstName} ${lastName}`.trim() || lead.lead_name || 'Unknown'

  return {
    first_name:    firstName,
    last_name:     lastName,
    display_name:  displayName,
    email:         lead.email || '',
    // JobNimbus's Contact object does not have a plain "phone" field -- it splits phone into
    // home_phone ("Main Phone" in their UI), mobile_phone, and work_phone. Sending "phone" (as
    // this used to) matches none of them, so JN silently ignores it and the field stays blank.
    // We only collect one phone number, so we write it to both Main and Mobile so it shows up
    // regardless of which tab someone checks in JN.
    home_phone:    lead.phone || '',
    mobile_phone:  lead.phone || '',
    address_line1: lead.client_address || '',
    city:          lead.client_city    || '',
    state_text:    lead.client_state   || '',
    zip:           lead.client_zip     || '',
    tags:          ['com-center'],
  }
}