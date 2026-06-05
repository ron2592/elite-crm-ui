import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { email, full_name, role, phone } = await req.json()

    if (!email || !full_name || !role) {
      return NextResponse.json({ error: 'email, full_name, and role are required' }, { status: 400 })
    }

    // Check user cap (max 3 active users)
    const { data: existingUsers, error: countError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('is_active', true)

    if (countError) throw countError

    if ((existingUsers?.length || 0) >= 3) {
      return NextResponse.json({ error: 'User limit reached. Maximum 3 users allowed.' }, { status: 403 })
    }

    // Check if email already invited
    const { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'This email is already a user.' }, { status: 409 })
    }

    // Send Supabase invite email
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { full_name, role },
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://elite-crm-ui.vercel.app'}/login`,
    })

    if (inviteError) throw inviteError

    // Insert into profiles
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: inviteData.user.id,
        full_name,
        email,
        phone: phone || null,
        role,
        is_active: true,
      })

    if (profileError) throw profileError

    return NextResponse.json({ success: true, message: `Invite sent to ${email}` })

  } catch (err: any) {
    console.error('[INVITE] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user_id } = await req.json()

    if (!user_id) {
      return NextResponse.json({ error: 'user_id required' }, { status: 400 })
    }

    // Deactivate in profiles
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ is_active: false })
      .eq('id', user_id)

    if (error) throw error

    // Disable in Supabase Auth
    await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: 'none' })

    return NextResponse.json({ success: true })

  } catch (err: any) {
    console.error('[REMOVE USER] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}