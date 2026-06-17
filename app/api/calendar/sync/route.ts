import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
    console.error('Token refresh failed:', data)
    return null
  }

  return data.access_token
}

async function getValidAccessToken(syncRecord: {
  access_token: string
  refresh_token: string
  token_expiry: string
  google_email: string
}): Promise<string | null> {
  const expiry = new Date(syncRecord.token_expiry)
  const now = new Date()
  const fiveMinutes = 5 * 60 * 1000

  // If token is still valid (more than 5 min remaining), use it
  if (expiry.getTime() - now.getTime() > fiveMinutes) {
    return syncRecord.access_token
  }

  // Token expired or expiring soon — refresh it
  const newAccessToken = await refreshAccessToken(syncRecord.refresh_token)

  if (!newAccessToken) return null

  // Update the stored token
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

// Push a ComCenter calendar event to Google Calendar
async function pushEventToGoogle(
  accessToken: string,
  event: {
    title: string
    description?: string
    start_time: string
    end_time: string
    google_event_id?: string
  }
): Promise<string | null> {
  const body = {
    summary: event.title,
    description: event.description || '',
    start: { dateTime: event.start_time, timeZone: 'America/New_York' },
    end: { dateTime: event.end_time, timeZone: 'America/New_York' },
  }

  const isUpdate = !!event.google_event_id
  const url = isUpdate
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.google_event_id}`
    : 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

  const response = await fetch(url, {
    method: isUpdate ? 'PUT' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await response.json()

  if (!response.ok) {
    console.error('Failed to push event to Google:', data)
    return null
  }

  return data.id
}

// Pull events from Google Calendar into ComCenter
async function pullEventsFromGoogle(
  accessToken: string,
  googleEmail: string
): Promise<void> {
  const timeMin = new Date().toISOString()
  const timeMax = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  ).toISOString() // 30 days ahead

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  const data = await response.json()

  if (!response.ok || !data.items) {
    console.error('Failed to pull events from Google:', data)
    return
  }

  for (const googleEvent of data.items) {
    if (!googleEvent.start?.dateTime) continue // skip all-day events for now

    // Check if this event already exists in ComCenter
    const { data: existing } = await supabaseAdmin
      .from('calendar_events')
      .select('id')
      .eq('google_event_id', googleEvent.id)
      .single()

    if (existing) continue // already synced

    // Insert new event from Google into ComCenter
    await supabaseAdmin.from('calendar_events').insert({
      title: googleEvent.summary || 'Untitled Event',
      description: googleEvent.description || null,
      start_time: googleEvent.start.dateTime,
      end_time: googleEvent.end?.dateTime || googleEvent.start.dateTime,
      google_event_id: googleEvent.id,
      synced_from_google: true,
      created_at: new Date().toISOString(),
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { google_email, event_id, direction } = body

    // Get the sync record for this user
    const { data: syncRecord, error: syncError } = await supabaseAdmin
      .from('google_calendar_sync')
      .select('*')
      .eq('google_email', google_email)
      .eq('is_active', true)
      .single()

    if (syncError || !syncRecord) {
      return NextResponse.json(
        { error: 'No active Google Calendar connection found' },
        { status: 404 }
      )
    }

    const accessToken = await getValidAccessToken(syncRecord)

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Failed to get valid access token' },
        { status: 401 }
      )
    }

    // Pull: Google → ComCenter
    if (direction === 'pull' || direction === 'both') {
      await pullEventsFromGoogle(accessToken, google_email)
    }

    // Push: ComCenter → Google
    if ((direction === 'push' || direction === 'both') && event_id) {
      const { data: event, error: eventError } = await supabaseAdmin
        .from('calendar_events')
        .select('*')
        .eq('id', event_id)
        .single()

      if (eventError || !event) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 })
      }

      const googleEventId = await pushEventToGoogle(accessToken, event)

      if (googleEventId) {
        await supabaseAdmin
          .from('calendar_events')
          .update({
            google_event_id: googleEventId,
            synced_to_google: true,
          })
          .eq('id', event_id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Calendar sync error:', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const google_email = searchParams.get('google_email')

  if (!google_email) {
    return NextResponse.json({ error: 'google_email required' }, { status: 400 })
  }

  try {
    const { data: syncRecord, error } = await supabaseAdmin
      .from('google_calendar_sync')
      .select('google_email, is_active, updated_at, token_expiry')
      .eq('google_email', google_email)
      .single()

    if (error || !syncRecord) {
      return NextResponse.json({ connected: false })
    }

    return NextResponse.json({
      connected: syncRecord.is_active,
      google_email: syncRecord.google_email,
      last_synced: syncRecord.updated_at,
    })
  } catch (err) {
    console.error('Calendar status check error:', err)
    return NextResponse.json({ error: 'Status check failed' }, { status: 500 })
  }
}