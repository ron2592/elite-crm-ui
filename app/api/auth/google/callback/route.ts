import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_URL = process.env.GOOGLE_REDIRECT_URI?.replace('/api/auth/google/callback', '') || 'https://elite-crm-ui.vercel.app'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error) {
    console.error('Google OAuth error:', error)
    return NextResponse.redirect(`${BASE_URL}/settings?google_error=${error}`)
  }

  if (!code) {
    return NextResponse.redirect(`${BASE_URL}/settings?google_error=no_code`)
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        grant_type: 'authorization_code',
      }),
    })

    const tokens = await tokenResponse.json()

    if (!tokenResponse.ok || !tokens.access_token) {
      console.error('Token exchange failed:', tokens)
      return NextResponse.redirect(`${BASE_URL}/settings?google_error=token_failed`)
    }

    // Get Google user info
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const googleUser = await userInfoResponse.json()

    if (!googleUser.email) {
      return NextResponse.redirect(`${BASE_URL}/settings?google_error=no_email`)
    }

    // Store tokens in google_calendar_sync table
    const { error: upsertError } = await supabaseAdmin
      .from('google_calendar_sync')
      .upsert(
        {
          google_email: googleUser.email,
          user_email: googleUser.email,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || null,
          token_expiry: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'google_email' }
      )

    if (upsertError) {
      console.error('Failed to store tokens:', upsertError)
      return NextResponse.redirect(`${BASE_URL}/settings?google_error=db_failed`)
    }

    return NextResponse.redirect(`${BASE_URL}/settings?google_connected=true`)
  } catch (err) {
    console.error('OAuth callback error:', err)
    return NextResponse.redirect(`${BASE_URL}/settings?google_error=unknown`)
  }
}