import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// One-way calendar sync: ComCenter -> Google Calendar (info@eliteworkhomeimprovement.com).
// Deliberately one-way -- appointments are entered once, in ComCenter, and mirrored out to
// Google so nothing needs to be typed twice. Nothing flows back in from Google.
//
// This route previously referenced calendar_events columns (start_time/end_time,
// synced_from_google/synced_to_google) that don't exist in the real schema (the real columns
// are start_at/end_at) -- meaning it silently failed every time it was actually called. The
// old two-way "pull" path has been removed entirely since it's not wanted and was equally
// broken. This rewrite fixes the column names and only does the push direction.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface SyncRecord {
  google_email: string
  access_token: string
  refresh_token: string
  token_expiry: string
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await response.json()
  if (!response.ok || !data.access_token) {
    console.error('[Calendar Sync] Token refresh failed:', data)
    return null
  }
  return data.access_token
}

async function getValidAccessToken(syncRecord: SyncRecord): Promise<string | null> {
  const expiry = new Date(syncRecord.token_expiry)
  const fiveMinutes = 5 * 60 * 1000
  if (expiry.getTime() - Date.now() > fiveMinutes) return syncRecord.access_token

  const newAccessToken = await refreshAccessToken(syncRecord.refresh_token)
  if (!newAccessToken) return null

  await supabaseAdmin
    .from('google_calendar_sync')
    .update({
      access_token: newAccessToken,
      token_expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('google_email', syncRecord.google_email)

  return newAccessToken
}

// This is a single shared company calendar connection (info@eliteworkhomeimprovement.com),
// not per-user -- so callers never need to know or pass which Google account to use.
async function getActiveSyncRecord(): Promise<SyncRecord | null> {
  const { data } = await supabaseAdmin
    .from('google_calendar_sync')
    .select('google_email, access_token, refresh_token, token_expiry')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

async function pushEventToGoogle(
  accessToken: string,
  event: { title: string; description?: string | null; location?: string | null; start_at: string; end_at: string; google_event_id?: string | null }
): Promise<string | null> {
  const body = {
    summary: event.title,
    description: event.description || '',
    location: event.location || undefined,
    start: { dateTime: event.start_at, timeZone: 'America/New_York' },
    end: { dateTime: event.end_at, timeZone: 'America/New_York' },
  }

  const isUpdate = !!event.google_event_id
  const url = isUpdate
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.google_event_id}`
    : 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

  const response = await fetch(url, {
    method: isUpdate ? 'PUT' : 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) {
    console.error('[Calendar Sync] Failed to push event to Google:', data)
    return null
  }
  return data.id
}

// Builds/updates the calendar_events row for a lead's appointment, then pushes it to Google.
// Upserting on (lead_id, event_type='appointment') keeps a single calendar entry per lead
// appointment instead of creating a new one every time the appointment date is edited.
async function syncLeadAppointment(leadId: string, accessToken: string): Promise<{ ok: boolean; reason?: string }> {
  const { data: lead, error } = await supabaseAdmin
    .from('leads')
    .select('id, lead_name, appointment_at, appointment_notes, address_line_1, client_address, city, client_city')
    .eq('id', leadId)
    .single()

  if (error || !lead) return { ok: false, reason: 'lead not found' }
  if (!lead.appointment_at) return { ok: false, reason: 'no appointment set' }

  const start = new Date(lead.appointment_at)
  const end = new Date(start.getTime() + 60 * 60 * 1000) // default 1-hour block
  const address = lead.address_line_1 || lead.client_address || ''
  const city = lead.city || lead.client_city || ''
  const location = [address, city].filter(Boolean).join(', ') || null

  const { data: existing } = await supabaseAdmin
    .from('calendar_events')
    .select('id, google_event_id')
    .eq('lead_id', leadId)
    .eq('event_type', 'appointment')
    .maybeSingle()

  const payload = {
    title: `Appointment: ${lead.lead_name || 'Lead'}`,
    description: lead.appointment_notes || null,
    event_type: 'appointment',
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    location,
    lead_id: leadId,
  }

  let eventRowId = existing?.id as string | undefined
  let googleEventId = existing?.google_event_id as string | undefined

  if (existing) {
    await supabaseAdmin.from('calendar_events').update(payload).eq('id', existing.id)
  } else {
    const { data: inserted } = await supabaseAdmin.from('calendar_events').insert(payload).select('id').single()
    eventRowId = inserted?.id
  }
  if (!eventRowId) return { ok: false, reason: 'failed to save calendar_events row' }

  const newGoogleEventId = await pushEventToGoogle(accessToken, {
    title: payload.title, description: payload.description, location: payload.location,
    start_at: payload.start_at, end_at: payload.end_at, google_event_id: googleEventId,
  })
  if (!newGoogleEventId) return { ok: false, reason: 'google push failed' }

  await supabaseAdmin
    .from('calendar_events')
    .update({ google_event_id: newGoogleEventId, google_calendar_id: 'primary' })
    .eq('id', eventRowId)

  return { ok: true }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { lead_id, bulk } = body

    const syncRecord = await getActiveSyncRecord()
    if (!syncRecord) return NextResponse.json({ error: 'No active Google Calendar connection found' }, { status: 404 })

    const accessToken = await getValidAccessToken(syncRecord)
    if (!accessToken) return NextResponse.json({ error: 'Failed to get valid access token' }, { status: 401 })

    // Bulk mode: catch up every upcoming appointment at once (used for a one-time backfill of
    // appointments that were set before this auto-push existed, or as a manual "push everything
    // now" safety net from Settings).
    if (bulk) {
      const { data: leads } = await supabaseAdmin
        .from('leads')
        .select('id')
        .not('appointment_at', 'is', null)
        .gte('appointment_at', new Date().toISOString())
        .eq('archived', false)

      let synced = 0
      let failed = 0
      for (const l of leads || []) {
        const result = await syncLeadAppointment(l.id, accessToken)
        if (result.ok) synced++
        else failed++
      }
      return NextResponse.json({ success: true, synced, failed })
    }

    if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 })

    const result = await syncLeadAppointment(lead_id, accessToken)
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 422 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Calendar Sync] Error:', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const syncRecord = await supabaseAdmin
      .from('google_calendar_sync')
      .select('google_email, is_active, updated_at, token_expiry')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!syncRecord.data) return NextResponse.json({ connected: false })

    return NextResponse.json({
      connected: syncRecord.data.is_active,
      google_email: syncRecord.data.google_email,
      last_synced: syncRecord.data.updated_at,
    })
  } catch (err) {
    console.error('[Calendar Sync] Status check error:', err)
    return NextResponse.json({ error: 'Status check failed' }, { status: 500 })
  }
}
