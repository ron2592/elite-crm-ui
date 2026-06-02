'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'

interface Product {
  id: string
  name: string
  description: string
  unit_price: number
  category: string
  is_active: boolean
  sort_order: number
}

const CATEGORIES = ['roofing', 'gutters', 'siding', 'windows', 'decks', 'interior', 'painting', 'general']

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading]   = useState(true)
  const [editId, setEditId]     = useState<string|null>(null)
  const [showAdd, setShowAdd]   = useState(false)
  const [saving, setSaving]     = useState(false)

  const empty = { name: '', description: '', unit_price: 0, category: 'roofing', is_active: true, sort_order: 0 }
  const [form, setForm] = useState(empty)

  useEffect(() => { fetchProducts() }, [])

  async function fetchProducts() {
    setLoading(true)
    const { data } = await supabase.from('estimate_products').select('*').order('category').order('name')
    if (data) setProducts(data)
    setLoading(false)
  }

  async function saveProduct() {
    setSaving(true)
    if (editId) {
      await supabase.from('estimate_products').update({ name: form.name, description: form.description, unit_price: form.unit_price, category: form.category, is_active: form.is_active }).eq('id', editId)
    } else {
      await supabase.from('estimate_products').insert({ ...form })
    }
    setEditId(null)
    setShowAdd(false)
    setForm(empty)
    await fetchProducts()
    setSaving(false)
  }

  async function deleteProduct(id: string) {
    if (!confirm('Delete this product?')) return
    await supabase.from('estimate_products').delete().eq('id', id)
    setProducts(prev => prev.filter(p => p.id !== id))
  }

  async function toggleActive(id: string, val: boolean) {
    await supabase.from('estimate_products').update({ is_active: val }).eq('id', id)
    setProducts(prev => prev.map(p => p.id === id ? { ...p, is_active: val } : p))
  }

  function startEdit(p: Product) {
    setEditId(p.id)
    setForm({ name: p.name, description: p.description, unit_price: p.unit_price, category: p.category, is_active: p.is_active, sort_order: p.sort_order })
    setShowAdd(false)
  }

  function cancelEdit() { setEditId(null); setShowAdd(false); setForm(empty) }

  const grouped = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = products.filter(p => p.category === cat)
    return acc
  }, {} as Record<string, Product[]>)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/estimates" className="text-sm text-gray-400 hover:text-gray-600">← Estimates</Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Products & Services</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your estimate line item library. Start typing a name in the estimate to auto-fill.</p>
        </div>
        <button onClick={() => { setShowAdd(true); setEditId(null); setForm(empty) }} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          + Add Product
        </button>
      </div>

      {/* Add/Edit form */}
      {(showAdd || editId) && (
        <div className="bg-white border border-blue-200 rounded-xl p-5 mb-6">
          <h3 className="font-semibold text-gray-800 mb-4">{editId ? 'Edit Product' : 'New Product'}</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Product / Service Name</label>
              <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Roof Replacement" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
                {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Default Unit Price ($)</label>
              <input type="number" value={form.unit_price} onChange={e => setForm(f => ({...f, unit_price: parseFloat(e.target.value)||0}))} placeholder="0.00" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Default Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} rows={4} placeholder="Detailed scope of work, materials, and inclusions..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-y" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={saveProduct} disabled={saving || !form.name} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
            <button onClick={cancelEdit} className="text-gray-500 px-4 py-2 rounded-lg text-sm hover:bg-gray-100">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading products...</div>
      ) : (
        <div className="space-y-6">
          {CATEGORIES.filter(cat => grouped[cat]?.length > 0).map(cat => (
            <div key={cat}>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </h3>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {grouped[cat].map((p, i) => (
                  <div key={p.id} className={`p-4 ${i < grouped[cat].length - 1 ? 'border-b border-gray-100' : ''} ${!p.is_active ? 'opacity-50' : ''}`}>
                    {editId === p.id ? null : (
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-gray-900 text-sm">{p.name}</span>
                            {p.unit_price > 0 && <span className="text-xs text-gray-400">${p.unit_price.toLocaleString()}</span>}
                          </div>
                          <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{p.description}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => toggleActive(p.id, !p.is_active)} className={`text-xs px-2 py-0.5 rounded-full ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {p.is_active ? 'Active' : 'Inactive'}
                          </button>
                          <button onClick={() => startEdit(p)} className="text-xs text-blue-600 hover:underline px-2 py-1 rounded hover:bg-blue-50">Edit</button>
                          <button onClick={() => deleteProduct(p.id)} className="text-xs text-red-400 hover:underline px-2 py-1 rounded hover:bg-red-50">Delete</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {products.length === 0 && !showAdd && (
            <div className="text-center py-16 text-gray-400">
              <p className="mb-2">No products yet.</p>
              <button onClick={() => setShowAdd(true)} className="text-blue-600 text-sm hover:underline">Add your first product →</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
