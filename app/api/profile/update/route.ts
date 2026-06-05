import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function PUT(req: NextRequest) {
  try {
    const { full_name, company_name, logo_url } = await req.json()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const updates: Record<string, string> = { updated_at: new Date().toISOString() }
    if (full_name !== undefined) updates.full_name = full_name
    if (company_name !== undefined) updates.company_name = company_name
    if (logo_url !== undefined) updates.logo_url = logo_url

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}