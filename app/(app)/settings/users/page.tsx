'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { UserPlus, Trash2, Shield, User, Briefcase } from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  salesperson: 'Salesperson',
  va: 'VA',
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  salesperson: 'bg-blue-100 text-blue-700',
  va: 'bg-green-100 text-green-700',
}

const ROLE_ICONS: Record<string, any> = {
  admin: Shield,
  salesperson: Briefcase,
  va: User,
}

interface Profile {
  id: string
  full_name: string
  email: string
  phone?: string
  role: string
  is_active: boolean
  created_at: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    role: 'salesperson',
  })

  const fetchUsers = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleInvite = async () => {
    setError('')
    setSuccess('')

    if (!form.full_name || !form.email || !form.role) {
      setError('Full name, email, and role are required.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to send invite.')
      } else {
        setSuccess(`Invite sent to ${form.email}`)
        setForm({ full_name: '', email: '', phone: '', role: 'salesperson' })
        setShowInvite(false)
        fetchUsers()
      }
    } catch (err) {
      setError('Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemove = async (user: Profile) => {
    if (!confirm(`Remove ${user.full_name}? They will lose access immediately.`)) return

    const res = await fetch('/api/users/invite', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id }),
    })

    if (res.ok) {
      fetchUsers()
    }
  }

  const atUserLimit = users.length >= 3

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Team Members</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {users.length}/3 users · Manage who has access to the Command Center
          </p>
        </div>
        {!atUserLimit && (
          <button
            onClick={() => { setShowInvite(true); setError(''); setSuccess('') }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            <UserPlus size={15} />
            Invite User
          </button>
        )}
        {atUserLimit && (
          <span className="text-xs text-gray-400 bg-gray-100 px-3 py-2 rounded-lg">
            User limit reached (3/3)
          </span>
        )}
      </div>

      {/* Success / Error */}
      {success && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
          {success}
        </div>
      )}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Invite Form */}
      {showInvite && (
        <div className="mb-6 p-5 border border-blue-200 bg-blue-50 rounded-xl">
          <h2 className="text-sm font-semibold text-blue-800 mb-4">New Invite</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Full Name *</label>
              <input
                type="text"
                placeholder="e.g. Ray Santos"
                value={form.full_name}
                onChange={e => setForm({ ...form, full_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Email *</label>
              <input
                type="email"
                placeholder="e.g. ray@elitework.com"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Phone (optional)</label>
              <input
                type="text"
                placeholder="(201) 555-0000"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Role *</label>
              <select
                value={form.role}
                onChange={e => setForm({ ...form, role: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="salesperson">Salesperson</option>
                <option value="va">VA</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleInvite}
              disabled={submitting}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {submitting ? 'Sending...' : 'Send Invite'}
            </button>
            <button
              onClick={() => { setShowInvite(false); setError('') }}
              className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Users List */}
      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Loading users...</div>
      ) : (
        <div className="space-y-3">
          {users.map((user) => {
            const RoleIcon = ROLE_ICONS[user.role] || User
            return (
              <div
                key={user.id}
                className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-600">
                    {user.full_name?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{user.full_name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[user.role] || 'bg-gray-100 text-gray-600'}`}>
                        <RoleIcon size={10} className="inline mr-1" />
                        {ROLE_LABELS[user.role] || user.role}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{user.email}</div>
                    {user.phone && <div className="text-xs text-gray-400">{user.phone}</div>}
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(user)}
                  className="text-gray-300 hover:text-red-500 transition p-1"
                  title="Remove user"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Info note */}
      <p className="text-xs text-gray-400 mt-6">
        Invited users will receive an email to set their password and log in at{' '}
        <span className="font-medium text-gray-500">elite-crm-ui.vercel.app/login</span>
      </p>
    </div>
  )
}