'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Estimate {
  id: string
  estimate_name: string
  estimate_date: string
  status: 'Draft' | 'Sent' | 'Signed' | 'Declined'
  client_first_name: string
  client_last_name: string
  client_address: string
  client_city: string
  client_state: string
  lead_id: string | null
  created_at: string
  estimate_options?: { subtotal?: number }[]
}

const STATUS_STYLES: Record<string, string> = {
  Draft:    'bg-gray-100 text-gray-700',
  Sent:     'bg-blue-100 text-blue-700',
  Signed:   'bg-green-100 text-green-700',
  Declined: 'bg-red-100 text-red-700',
}

const STATUS_ICONS: Record<string, string> = {
  Draft: '📝', Sent: '📤', Signed: '✅', Declined: '❌',
}

export default function EstimatesPage() {
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const router = useRouter()
  

  useEffect(() => { fetchEstimates() }, [])

  async function fetchEstimates() {
    setLoading(true)
    const { data, error } = await supabase
      .from('estimates')
      .select('*, estimate_options(id)')
      .order('created_at', { ascending: false })
    if (!error && data) setEstimates(data as Estimate[])
    setLoading(false)
  }

  async function createNewEstimate() {
    const { data, error } = await supabase
      .from('estimates')
      .insert({ estimate_name: 'NEW ESTIMATE', status: 'Draft' })
      .select()
      .single()
    if (!error && data) {
      await supabase.from('estimate_options').insert({
        estimate_id: data.id, option_num: 1, option_label: 'Option 1', sort_order: 0
      })
      router.push(`/estimates/${data.id}`)
    }
  }

  async function deleteEstimate(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    if (!confirm('Delete this estimate? This cannot be undone.')) return
    await supabase.from('estimates').delete().eq('id', id)
    setEstimates(prev => prev.filter(e => e.id !== id))
  }

  const filtered = estimates.filter(e => {
    const name = `${e.client_first_name || ''} ${e.client_last_name || ''} ${e.estimate_name || ''}`.toLowerCase()
    const matchSearch = !search || name.includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || e.status === statusFilter
    return matchSearch && matchStatus
  })

  const counts = {
    all: estimates.length,
    Draft: estimates.filter(e => e.status === 'Draft').length,
    Sent: estimates.filter(e => e.status === 'Sent').length,
    Signed: estimates.filter(e => e.status === 'Signed').length,
    Declined: estimates.filter(e => e.status === 'Declined').length,
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estimates</h1>
          <p className="text-sm text-gray-500 mt-0.5">{estimates.length} total estimates</p>
        </div>
        <button
          onClick={createNewEstimate}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <span>+</span> New Estimate
        </button>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {(['all', 'Draft', 'Sent', 'Signed', 'Declined'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
              statusFilter === s
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            {s === 'all' ? 'All' : `${STATUS_ICONS[s]} ${s}`} ({counts[s as keyof typeof counts] ?? estimates.length})
          </button>
        ))}
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by client name or estimate name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
        />
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading estimates...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">No estimates found</p>
          <button onClick={createNewEstimate} className="text-blue-600 text-sm hover:underline">
            Create your first estimate →
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Client</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Estimate</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((est, i) => (
                <tr
                  key={est.id}
                  className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}
                  onClick={() => router.push(`/estimates/${est.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {est.client_first_name || est.client_last_name
                        ? `${est.client_first_name || ''} ${est.client_last_name || ''}`.trim()
                        : <span className="text-gray-400 italic">No client yet</span>
                      }
                    </div>
                    {est.client_address && (
                      <div className="text-xs text-gray-400 mt-0.5">
                        {est.client_address}{est.client_city ? `, ${est.client_city}` : ''}{est.client_state ? ` ${est.client_state}` : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-700">{est.estimate_name}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {est.estimate_date
                      ? new Date(est.estimate_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[est.status]}`}>
                      {STATUS_ICONS[est.status]} {est.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/estimates/${est.id}/preview`}
                        onClick={e => e.stopPropagation()}
                        className="text-xs text-blue-600 hover:underline px-2 py-1 rounded hover:bg-blue-50"
                      >
                        Preview
                      </Link>
                      <Link
                        href={`/estimates/${est.id}`}
                        onClick={e => e.stopPropagation()}
                        className="text-xs text-gray-600 hover:underline px-2 py-1 rounded hover:bg-gray-100"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={(e) => deleteEstimate(est.id, e)}
                        className="text-xs text-red-500 hover:underline px-2 py-1 rounded hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
