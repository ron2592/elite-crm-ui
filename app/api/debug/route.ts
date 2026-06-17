import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await supabaseAdmin
      .from('google_calendar_sync')
      .insert({
        google_email: 'debug@test.com',
        user_email: 'debug@test.com',
        access_token: 'debug_token',
        refresh_token: 'debug_refresh',
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .select()

    if (error) {
      return NextResponse.json({ success: false, error: error.message, code: error.code, details: error.details }, { status: 500 })
    }

    // Clean up
    await supabaseAdmin.from('google_calendar_sync').delete().eq('google_email', 'debug@test.com')

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}