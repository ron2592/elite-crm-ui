'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export type UserRole = 'admin' | 'manager' | 'sales' | 'operations' | 'permit_admin' | 'marketing' | 'staff'

interface RoleState {
  role: UserRole | null
  userId: string | null
  loading: boolean
}

// Permission helpers — expand as needed
export function can(role: UserRole | null) {
  const isAdmin    = role === 'admin'
  const isManager  = role === 'manager' || isAdmin
  const isSales    = role === 'sales' || isManager
  const isStaff    = !!role // any authenticated role

  return {
    // Leads
    viewAllLeads:      isManager,   // sales sees full pipeline but view-only for unassigned
    editAnyLead:       isManager,
    editAssignedLead:  isSales,
    deleteLead:        isManager,
    archiveLead:       isManager,
    addLead:           isSales,

    // Payments
    viewPayments:      isSales,
    addPayment:        isManager,
    deletePayment:     isManager,

    // Production
    viewProduction:    isSales,
    editProduction:    isManager,

    // Estimates
    viewEstimates:     isSales,
    createEstimate:    isSales,

    // KPI
    viewKPI:           isSales,
    viewAllKPI:        isManager,   // sales sees own KPI only

    // Settings
    viewSettings:      isStaff,
    editTeamMembers:   isAdmin,
    viewBilling:       isAdmin,

    // Marketing spend
    viewMarketingSpend: isManager,

    // Activities
    viewSODEOD:        isAdmin,     // Admin sees all SOD/EOD
    submitSODEOD:      role === 'staff' || isAdmin, // VA + Admin only

    // Admin only
    isAdmin,
    isManager,
    isSales,
  }
}

export function useRole(): RoleState & ReturnType<typeof can> {
  const [state, setState] = useState<RoleState>({
    role: null,
    userId: null,
    loading: true,
  })

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setState({ role: null, userId: null, loading: false })
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      setState({
        role: (profile?.role as UserRole) || 'staff',
        userId: user.id,
        loading: false,
      })
    }

    load()
  }, [])

  return {
    ...state,
    ...can(state.role),
  }
}

// Utility: check if a lead is assigned to the current user
export function isAssignedToMe(lead: any, userId: string | null): boolean {
  if (!userId) return false
  const salesperson = lead?.metadata?.salesperson || lead?.assigned_to
  // Check by profile ID or by name match (legacy)
  return lead?.assigned_to === userId || 
    (salesperson && typeof salesperson === 'string' && salesperson.toLowerCase() !== '')
}