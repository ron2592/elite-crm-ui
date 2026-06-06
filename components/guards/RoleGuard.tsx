'use client'

import { useRole, UserRole } from '@/lib/useRole'

interface RoleGuardProps {
  children: React.ReactNode
  allow: UserRole[]           // roles that CAN see this
  fallback?: React.ReactNode  // optional: show something else instead
}

/**
 * Wraps any UI element and only renders it if the current user's role is allowed.
 *
 * Usage:
 *   <RoleGuard allow={['admin', 'manager']}>
 *     <DeleteButton />
 *   </RoleGuard>
 *
 *   <RoleGuard allow={['admin']} fallback={<p>No access</p>}>
 *     <TeamMembersPage />
 *   </RoleGuard>
 */
export default function RoleGuard({ children, allow, fallback = null }: RoleGuardProps) {
  const { role, loading } = useRole()

  if (loading) return null
  if (!role || !allow.includes(role)) return <>{fallback}</>
  return <>{children}</>
}

/**
 * Inline permission check — returns true/false.
 * Use when you need conditional logic rather than wrapping JSX.
 *
 * Usage:
 *   const { deleteLead } = useRole()
 *   {deleteLead && <button>Delete</button>}
 */
export { useRole }