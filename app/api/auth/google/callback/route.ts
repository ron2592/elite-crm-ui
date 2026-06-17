import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_URL = 'https://elite-crm-ui.vercel.app'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  console.log('[CALLBACK] Starting. code exists:', !!code, 'error:', error)

  if (error) {
    console.error('[CALLBACK] Google returned error:', error)
    return NextResponse.redirect(`${BASE_URL}/settings?google_error=${error}`)
  }

  if (!code) {
    console.error('[CALLBACK] No code in request')
    return NextResponse.redirect(`${BASE_URL}/settings?google_error=no_code`)
  }

  // Log env vars exist (not values)
  console.log('[CALLBACK] Env check:', {
    hasClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    hasRedirectUri: !!process.env.GOOGLE_REDIRECT_URI,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  })

  try {
    // Exchange code for tokens
    console.log('[CALLBACK] Exchanging code for tokens...')
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
    console.log('[CALLBACK] Token response status:', tokenResponse.status)
    console.log('[CALLBACK] Token response:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expires_in,
      error: tokens.error,
      errorDescription: tokens.error_description,
    })

    if (!tokenResponse.ok || !tokens.access_token) {
      console.error('[CALLBACK] Token exchange failed:', tokens)
      return NextResponse.redirect(`${BASE_URL}/settings?google_error=token_failed&detail=${tokens.error || 'unknown'}`)
    }

    // Get Google user info
    console.log('[CALLBACK] Getting user info...')
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const googleUser = await userInfoResponse.json()
    console.log('[CALLBACK] User info response:', {
      status: userInfoResponse.status,
      hasEmail: !!googleUser.email,
      email: googleUser.email,
      error: googleUser.error,
    })

    if (!googleUser.email) {
      console.error('[CALLBACK] No email in user info:', googleUser)
      return NextResponse.redirect(`${BASE_URL}/settings?google_error=no_email`)
    }

    // Store tokens
    console.log('[CALLBACK] Storing tokens for:', googleUser.email)
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
      console.error('[CALLBACK] Upsert failed:', upsertError)
      return NextResponse.redirect(`${BASE_URL}/settings?google_error=db_failed&detail=${upsertError.code}`)
    }

    console.log('[CALLBACK] Success! Redirecting...')
    return NextResponse.redirect(`${BASE_URL}/settings?google_connected=true`)
  } catch (err: any) {
    console.error('[CALLBACK] Unexpected error:', err)
    return NextResponse.redirect(`${BASE_URL}/settings?google_error=unknown&detail=${err.message}`)
  }
}