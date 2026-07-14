'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useParams } from 'next/navigation'
import Link from 'next/link'

// ── TYPES ──────────────────────────────────────────────────────────────────
type LineItem = {
  id?: string
  section_name: string
  description: string
  qty: number
  unit_price: number
  sort_order: number
  is_exclusion: boolean
}

type Option = {
  id?: string
  estimate_id?: string
  option_label: string
  sort_order: number
  items: LineItem[]
}

type Photo = {
  id?: string
  estimate_id?: string
  photo_url: string
  caption: string
  sort_order: number
}

type Lead = {
  id: string
  first_name: string
  last_name: string
  phone?: string
  metadata?: any
}

type Estimate = {
  id: string
  lead_id?: string
  client_first_name: string
  client_last_name: string
  client_email: string
  client_address: string
  client_city: string
  client_state: string
  client_zip: string
  estimate_date: string
  property_photo_url: string
  cert_badge_url: string
  show_inspection: boolean
  show_tc: boolean
  show_financing: boolean
  financing_sunlight: boolean
  financing_upgrade: boolean
  tc_file_url: string
  tc_custom_text: string
  notes: string
  status: string
}

// ── STYLES ─────────────────────────────────────────────────────────────────
const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-gray-600'
const inputSmCls = 'w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 placeholder-gray-600'

// ── DEFAULT T&C ─────────────────────────────────────────────────────────────
const DEFAULT_TC = `This Agreement is entered into between Elite Work Home Improvement LLC ("Contractor") and the Owner.

1. Project Description
The Contractor shall furnish all labor, materials, equipment, and services necessary to complete the project as described in this estimate.

2. Work Timeline
Work begins within ten (10) business days after contract execution, subject to weather and material availability.

3. Compensation Terms
One-Third (1/3) due upon signing. Remaining balance due upon completion. Late balances accrue 1.5% monthly interest.

4. Modifications to Work
Changes must be documented in writing and approved via a formal Change Order prior to execution.

5. Guarantees & Warranties
Contractor warrants all labor as specified. Warranty excludes sealants, coatings, and cosmetic finishes unless stated otherwise.

6. Insurance
Contractor carries General Liability and Workers' Compensation Insurance. Certificates available upon request.

7. Cancellation Rights (NJ Law)
Owner may cancel this contract within 3 business days of signing. Full refunds issued within 30 days of receipt of cancellation notice.

8. Resolution of Disputes
Disputes shall be resolved through negotiation, then mediation, then binding arbitration in accordance with NJ law.`

// ── UI COMPONENTS ───────────────────────────────────────────────────────────
function Section({ title, children, badge }: { title: string; children: React.ReactNode; badge?: string }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="px-6 py-3 border-b border-gray-800 bg-gray-800/50 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">{title}</h2>
        {badge && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900 text-purple-300">{badge}</span>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs text-gray-400 mb-1 font-medium uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => onChange(!checked)}>
      <div className={`relative w-10 h-5 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-700'}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-5' : ''}`} />
      </div>
      <span className="text-sm text-gray-300">{label}</span>
    </div>
  )
}

// ── MAIN ────────────────────────────────────────────────────────────────────
export default function EstimateBuilderPage() {
  const params = useParams()
  const estimateId = params.id as string

  const [loading, setLoading]             = useState(true)
  const [saving, setSaving]               = useState(false)
  const [saved, setSaved]                 = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadingTcPdf, setUploadingTcPdf] = useState(false)
  const [activeOptionIdx, setActiveOptionIdx] = useState(0)
  const [tcMode, setTcMode]               = useState<'default' | 'custom' | 'pdf'>('default')

  // Lead search
  const [leadQuery, setLeadQuery]         = useState('')
  const [leadResults, setLeadResults]     = useState<Lead[]>([])
  const [showLeadDrop, setShowLeadDrop]   = useState(false)
  const [linkedLead, setLinkedLead]       = useState<Lead | null>(null)
  const leadRef = useRef<HTMLDivElement>(null)

  const photoInputRef    = useRef<HTMLInputElement>(null)
  const propertyPhotoRef = useRef<HTMLInputElement>(null)
  const tcFileRef        = useRef<HTMLInputElement>(null)

  const [estimate, setEstimate] = useState<Estimate>({
    id: estimateId,
    client_first_name: '', client_last_name: '', client_email: '',
    client_address: '', client_city: '', client_state: 'NJ', client_zip: '',
    estimate_date: new Date().toISOString().split('T')[0],
    property_photo_url: '', cert_badge_url: '',
    show_inspection: true, show_tc: true, show_financing: false,
    financing_sunlight: false, financing_upgrade: false,
    tc_file_url: '', tc_custom_text: '', notes: '', status: 'draft',
  })
  const [options, setOptions] = useState<Option[]>([])
  const [photos, setPhotos]   = useState<Photo[]>([])

  // Close dropdown on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (leadRef.current && !leadRef.current.contains(e.target as Node)) setShowLeadDrop(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  // ── LOAD ────────────────────────────────────────────────────────────────
  useEffect(() => { loadAll() }, [estimateId])

  async function loadAll() {
    setLoading(true)
    try {
      const [estRes, optsRes, photosRes] = await Promise.all([
        supabase.from('estimates').select('*').eq('id', estimateId).single(),
        supabase.from('estimate_options').select('*').eq('estimate_id', estimateId).order('sort_order'),
        supabase.from('estimate_photos').select('*').eq('estimate_id', estimateId).order('sort_order'),
      ])

      if (estRes.data) {
        setEstimate(estRes.data)
        if (estRes.data.tc_file_url)       setTcMode('pdf')
        else if (estRes.data.tc_custom_text) setTcMode('custom')
        else                                setTcMode('default')

        if (estRes.data.lead_id) {
          const { data: lead } = await supabase
            .from('leads').select('id, first_name, last_name, lead_name, phone, metadata')
            .eq('id', estRes.data.lead_id).single()
          if (lead) { setLinkedLead(lead); setLeadQuery(lead.lead_name || `${lead.first_name} ${lead.last_name}`.trim()) }
        }
      }

      if (photosRes.data) setPhotos(photosRes.data)

      if (optsRes.data && optsRes.data.length > 0) {
        const optsWithItems = await Promise.all(optsRes.data.map(async opt => {
          const { data: items } = await supabase
            .from('estimate_line_items').select('*').eq('option_id', opt.id).order('sort_order')
          return { ...opt, items: items || [] }
        }))
        setOptions(optsWithItems)
      } else {
        setOptions([{ option_label: 'Option A', sort_order: 0, items: [] }])
      }
    } catch (err) { console.error('[Builder] Load error:', err) }
    setLoading(false)
  }

  // ── LEAD SEARCH ──────────────────────────────────────────────────────────
  const searchLeads = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setLeadResults([]); return }
    const { data } = await supabase
      .from('leads')
      .select('id, first_name, last_name, lead_name, phone, metadata')
      // lead_name included -- a lot of older leads never got last_name parsed out of it, so
      // searching by last name alone (e.g. "Giles") would otherwise silently miss them.
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,lead_name.ilike.%${q}%`)
      .limit(8)
    setLeadResults(data || [])
  }, [])

  useEffect(() => {
    if (linkedLead) return
    const t = setTimeout(() => searchLeads(leadQuery), 220)
    return () => clearTimeout(t)
  }, [leadQuery, linkedLead, searchLeads])

  function selectLead(lead: Lead) {
    const m = lead.metadata || {}
    setEstimate(v => ({
      ...v,
      lead_id: lead.id,
      client_first_name: lead.first_name || '',
      client_last_name:  lead.last_name  || '',
      client_email:      m.email   || v.client_email,
      client_address:    m.address || v.client_address,
      client_city:       m.city    || v.client_city,
      client_state:      m.state   || v.client_state || 'NJ',
      client_zip:        m.zip     || v.client_zip,
    }))
    setLinkedLead(lead)
    setLeadQuery((lead as any).lead_name || `${lead.first_name} ${lead.last_name}`.trim())
    setShowLeadDrop(false)
    setLeadResults([])
  }

  function unlinkLead() {
    setLinkedLead(null)
    setLeadQuery('')
    setEstimate(v => ({ ...v, lead_id: undefined }))
  }

  // ── SAVE ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    try {
      const { error: estErr } = await supabase.from('estimates').upsert({ ...estimate, id: estimateId })
      if (estErr) throw estErr

      const updatedOptions = [...options]
      for (let i = 0; i < updatedOptions.length; i++) {
        const opt = updatedOptions[i]
        let optId = opt.id

        if (optId) {
          await supabase.from('estimate_options').update({ option_label: opt.option_label, sort_order: i }).eq('id', optId)
        } else {
          const { data: newOpt } = await supabase.from('estimate_options')
            .insert({ estimate_id: estimateId, option_label: opt.option_label, sort_order: i })
            .select().single()
          optId = newOpt?.id
          updatedOptions[i] = { ...opt, id: optId }
        }
        if (!optId) continue

        await supabase.from('estimate_line_items').delete().eq('option_id', optId)
        if (opt.items.length > 0) {
          await supabase.from('estimate_line_items').insert(
            opt.items.map((item, j) => ({
              option_id: optId, section_name: item.section_name, description: item.description,
              qty: item.qty, unit_price: item.unit_price, sort_order: j, is_exclusion: item.is_exclusion,
            }))
          )
        }
      }

      for (const p of photos) {
        if (p.id) await supabase.from('estimate_photos').update({ caption: p.caption }).eq('id', p.id)
      }

      setOptions(updatedOptions)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      console.error('[Builder] Save error:', err)
      alert('Save failed — check console.')
    }
    setSaving(false)
  }

  // ── PHOTO UPLOAD ─────────────────────────────────────────────────────────
  async function uploadPhoto(file: File, type: 'inspection' | 'property') {
    setUploadingPhoto(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `estimates/${estimateId}/${type}_${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('estimate-photos').upload(path, file)
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('estimate-photos').getPublicUrl(path)
      if (type === 'property') {
        setEstimate(e => ({ ...e, property_photo_url: publicUrl }))
      } else {
        const newP = { estimate_id: estimateId, photo_url: publicUrl, caption: '', sort_order: photos.length }
        const { data: saved } = await supabase.from('estimate_photos').insert(newP).select().single()
        if (saved) setPhotos(p => [...p, saved])
      }
    } catch { alert('Upload failed') }
    setUploadingPhoto(false)
  }

  async function uploadTcPdf(file: File) {
    setUploadingTcPdf(true)
    try {
      const path = `estimates/${estimateId}/tc_${Date.now()}.pdf`
      const { error } = await supabase.storage.from('estimate-photos').upload(path, file, { contentType: 'application/pdf' })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('estimate-photos').getPublicUrl(path)
      setEstimate(e => ({ ...e, tc_file_url: publicUrl, tc_custom_text: '' }))
    } catch { alert('PDF upload failed') }
    setUploadingTcPdf(false)
  }

  async function deletePhoto(id: string) {
    await supabase.from('estimate_photos').delete().eq('id', id)
    setPhotos(p => p.filter(ph => ph.id !== id))
  }

  // ── OPTION HELPERS ────────────────────────────────────────────────────────
  function addOption() {
    const labels = ['Option A', 'Option B', 'Option C', 'Option D']
    const idx = options.length
    setOptions(o => [...o, { option_label: labels[idx] || `Option ${idx + 1}`, sort_order: idx, items: [] }])
    setActiveOptionIdx(idx)
  }

  async function deleteOption(idx: number) {
    if (options.length === 1) return
    const opt = options[idx]
    if (opt.id) {
      await supabase.from('estimate_line_items').delete().eq('option_id', opt.id)
      await supabase.from('estimate_options').delete().eq('id', opt.id)
    }
    setOptions(o => o.filter((_, i) => i !== idx))
    setActiveOptionIdx(Math.max(0, idx - 1))
  }

  function addLineItem(optIdx: number) {
    setOptions(opts => opts.map((opt, i) => i !== optIdx ? opt : {
      ...opt, items: [...opt.items, { section_name: '', description: '', qty: 1, unit_price: 0, sort_order: opt.items.length, is_exclusion: false }]
    }))
  }

  function updateLineItem(optIdx: number, itemIdx: number, field: string, value: any) {
    setOptions(opts => opts.map((opt, i) => i !== optIdx ? opt : {
      ...opt, items: opt.items.map((item, j) => j !== itemIdx ? item : { ...item, [field]: value })
    }))
  }

  function deleteLineItem(optIdx: number, itemIdx: number) {
    setOptions(opts => opts.map((opt, i) => i !== optIdx ? opt : {
      ...opt, items: opt.items.filter((_, j) => j !== itemIdx)
    }))
  }

  function optionTotal(opt: Option) {
    return opt.items.filter(i => !i.is_exclusion).reduce((s, i) => s + i.qty * i.unit_price, 0)
  }

  const fmt = (n: number) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const clientName = `${estimate.client_first_name} ${estimate.client_last_name}`.trim()

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-950">
      <div className="text-gray-400 text-sm">Loading estimate builder...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">

      {/* TOP BAR */}
      <div className="sticky top-0 z-50 bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/estimates" className="text-gray-400 hover:text-white text-sm">← Estimates</Link>
          <span className="text-gray-700">|</span>
          <span className="text-white font-semibold text-sm">{clientName || 'New Estimate'}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
            estimate.status === 'signed'   ? 'bg-green-900 text-green-300' :
            estimate.status === 'sent'     ? 'bg-blue-900 text-blue-300' :
            estimate.status === 'declined' ? 'bg-red-900 text-red-300' :
            'bg-gray-700 text-gray-400'}`}>{estimate.status}</span>
          {linkedLead && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900 text-purple-300 flex items-center gap-1">
              🔗 Linked to lead
              <button onClick={unlinkLead} className="ml-1 opacity-60 hover:opacity-100">×</button>
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Link href={`/estimates/${estimateId}/preview`}
            className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
            👁 Preview
          </Link>
          <button onClick={handleSave} disabled={saving}
            className={`px-5 py-2 text-sm rounded-lg font-semibold transition-all ${
              saved  ? 'bg-green-600 text-white' :
              saving ? 'bg-blue-800 text-blue-300 cursor-not-allowed' :
                       'bg-blue-600 hover:bg-blue-500 text-white'}`}>
            {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* 1. CLIENT INFO */}
        <Section title="Client Info" badge={linkedLead ? '🔗 Lead Linked' : undefined}>

          {/* Lead Search */}
          <div className="mb-5" ref={leadRef}>
            <Field label="Search & Link to Lead">
              <div className="relative">
                <input className={`${inputCls} pr-8`}
                  placeholder="Type client name to search leads and autofill..."
                  value={leadQuery}
                  onChange={e => { setLeadQuery(e.target.value); setLinkedLead(null); setShowLeadDrop(true) }}
                  onFocus={() => leadQuery.length >= 2 && setShowLeadDrop(true)} />
                {leadQuery && (
                  <button onClick={unlinkLead}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-lg">×</button>
                )}
                {showLeadDrop && leadResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl overflow-hidden">
                    {leadResults.map(lead => (
                      <button key={lead.id} onClick={() => selectLead(lead)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-700 transition-colors border-b border-gray-700/50 last:border-0">
                        <div className="text-sm font-medium text-white">{(lead as any).lead_name || `${lead.first_name} ${lead.last_name}`}</div>
                        {lead.phone && <div className="text-xs text-gray-400 mt-0.5">{lead.phone}</div>}
                        {lead.metadata?.address && <div className="text-xs text-gray-500">{lead.metadata.address}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Field>
            {linkedLead && (
              <p className="text-xs text-purple-400 mt-1.5">
                ✓ Info auto-filled from lead —{' '}
                <Link href={`/leads?id=${linkedLead.id}`} className="underline hover:text-purple-300">View lead record →</Link>
              </p>
            )}
          </div>

          <div className="border-t border-gray-800 pt-5 grid grid-cols-2 gap-4">
            <Field label="First Name">
              <input className={inputCls} value={estimate.client_first_name} placeholder="John"
                onChange={e => setEstimate(v => ({ ...v, client_first_name: e.target.value }))} />
            </Field>
            <Field label="Last Name">
              <input className={inputCls} value={estimate.client_last_name} placeholder="Smith"
                onChange={e => setEstimate(v => ({ ...v, client_last_name: e.target.value }))} />
            </Field>
            <Field label="Email">
              <input className={inputCls} type="email" value={estimate.client_email} placeholder="client@email.com"
                onChange={e => setEstimate(v => ({ ...v, client_email: e.target.value }))} />
            </Field>
            <Field label="Estimate Date">
              <input className={inputCls} type="date" value={estimate.estimate_date}
                onChange={e => setEstimate(v => ({ ...v, estimate_date: e.target.value }))} />
            </Field>
            <Field label="Street Address" className="col-span-2">
              <input className={inputCls} value={estimate.client_address} placeholder="123 Main St"
                onChange={e => setEstimate(v => ({ ...v, client_address: e.target.value }))} />
            </Field>
            <Field label="City">
              <input className={inputCls} value={estimate.client_city} placeholder="Hackensack"
                onChange={e => setEstimate(v => ({ ...v, client_city: e.target.value }))} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="State">
                <input className={inputCls} value={estimate.client_state} placeholder="NJ"
                  onChange={e => setEstimate(v => ({ ...v, client_state: e.target.value }))} />
              </Field>
              <Field label="ZIP">
                <input className={inputCls} value={estimate.client_zip} placeholder="07601"
                  onChange={e => setEstimate(v => ({ ...v, client_zip: e.target.value }))} />
              </Field>
            </div>
          </div>
        </Section>

        {/* 2. ESTIMATE SETTINGS */}
        <Section title="Estimate Settings">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <Toggle label="Show Inspection Photos page" checked={estimate.show_inspection}
                onChange={v => setEstimate(e => ({ ...e, show_inspection: v }))} />
              <Toggle label="Show Terms & Conditions page" checked={estimate.show_tc}
                onChange={v => setEstimate(e => ({ ...e, show_tc: v }))} />
              <Toggle label="Show Financing Options" checked={estimate.show_financing}
                onChange={v => setEstimate(e => ({ ...e, show_financing: v }))} />
            </div>
            {estimate.show_financing && (
              <div className="pl-4 border-l border-gray-700 space-y-4">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Active Partners</p>
                <Toggle label="☀️ Sunlight Financial" checked={estimate.financing_sunlight}
                  onChange={v => setEstimate(e => ({ ...e, financing_sunlight: v }))} />
                <Toggle label="🟢 Upgrade Finance" checked={estimate.financing_upgrade}
                  onChange={v => setEstimate(e => ({ ...e, financing_upgrade: v }))} />
              </div>
            )}
          </div>
          <div className="mt-5 pt-5 border-t border-gray-800">
            <Field label="Estimate Status">
              <select className={inputCls} value={estimate.status}
                onChange={e => setEstimate(v => ({ ...v, status: e.target.value }))}>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="viewed">Viewed</option>
                <option value="signed">Signed</option>
                <option value="declined">Declined</option>
              </select>
            </Field>
          </div>
        </Section>

        {/* 3. PROPERTY PHOTO */}
        <Section title="Property Photo — Cover Page">
          {estimate.property_photo_url ? (
            <div className="relative group">
              <img src={estimate.property_photo_url} alt="Property" className="w-full h-56 object-cover rounded-lg" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                <button onClick={() => setEstimate(e => ({ ...e, property_photo_url: '' }))}
                  className="bg-red-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-red-700">Remove Photo</button>
              </div>
            </div>
          ) : (
            <div onClick={() => propertyPhotoRef.current?.click()}
              className="border-2 border-dashed border-gray-700 rounded-lg h-40 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-gray-800/30 transition-all">
              <div className="text-3xl text-gray-600 mb-2">🏠</div>
              <div className="text-gray-400 text-sm">Click to upload property photo</div>
              <div className="text-gray-600 text-xs mt-1">Appears on the cover page of the estimate</div>
            </div>
          )}
          <input ref={propertyPhotoRef} type="file" accept="image/*" className="hidden"
            onChange={e => { if (e.target.files?.[0]) uploadPhoto(e.target.files[0], 'property') }} />
        </Section>

        {/* 4. ESTIMATE OPTIONS */}
        <Section title="Estimate Options">
          <div className="flex gap-2 mb-6 flex-wrap">
            {options.map((opt, idx) => (
              <button key={idx} onClick={() => setActiveOptionIdx(idx)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeOptionIdx === idx
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}>
                {opt.option_label || `Option ${idx + 1}`}
              </button>
            ))}
            {options.length < 4 && (
              <button onClick={addOption}
                className="px-4 py-2 rounded-lg text-sm text-gray-500 border border-dashed border-gray-700 hover:border-gray-500 hover:text-gray-300 transition-all">
                + Add Option
              </button>
            )}
          </div>

          {options[activeOptionIdx] && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <input className={`${inputCls} max-w-xs font-semibold`}
                  value={options[activeOptionIdx].option_label} placeholder="Option A"
                  onChange={e => setOptions(opts => opts.map((o, i) =>
                    i !== activeOptionIdx ? o : { ...o, option_label: e.target.value }))} />
                <div className="ml-auto text-right">
                  <div className="text-xs text-gray-500">Option Total</div>
                  <div className="text-white font-bold text-lg">{fmt(optionTotal(options[activeOptionIdx]))}</div>
                </div>
                {options.length > 1 && (
                  <button onClick={() => deleteOption(activeOptionIdx)}
                    className="text-xs text-red-500 hover:text-red-400 px-2 py-1 rounded border border-red-800 hover:border-red-600 transition-colors">
                    Delete Option
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {options[activeOptionIdx].items.length > 0 && (
                  <div className="grid gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 mb-1"
                    style={{ gridTemplateColumns: '160px 1fr 60px 110px 90px 28px' }}>
                    <span>Section</span><span>Description</span>
                    <span className="text-center">Qty</span>
                    <span className="text-right">Unit Price</span>
                    <span className="text-right">Total</span><span></span>
                  </div>
                )}

                {options[activeOptionIdx].items.map((item, itemIdx) => (
                  <div key={itemIdx}
                    className={`rounded-lg p-3 ${item.is_exclusion
                      ? 'bg-orange-950/30 border border-dashed border-orange-900'
                      : 'bg-gray-800 border border-gray-700'}`}>
                    <div className="grid gap-2 items-start"
                      style={{ gridTemplateColumns: '160px 1fr 60px 110px 90px 28px' }}>
                      <input className={inputSmCls} placeholder="Section name" value={item.section_name}
                        onChange={e => updateLineItem(activeOptionIdx, itemIdx, 'section_name', e.target.value)} />
                      <textarea className={`${inputSmCls} resize-none`} rows={2}
                        placeholder="Description / scope of work" value={item.description}
                        onChange={e => updateLineItem(activeOptionIdx, itemIdx, 'description', e.target.value)} />
                      <input className={`${inputSmCls} text-center`} type="number" min="0" step="0.01" value={item.qty}
                        onChange={e => updateLineItem(activeOptionIdx, itemIdx, 'qty', parseFloat(e.target.value) || 0)} />
                      <input className={`${inputSmCls} text-right`} type="number" min="0" step="0.01" value={item.unit_price}
                        onChange={e => updateLineItem(activeOptionIdx, itemIdx, 'unit_price', parseFloat(e.target.value) || 0)} />
                      <div className="text-right text-xs font-semibold text-gray-300 pt-2">
                        {item.is_exclusion ? <span className="text-orange-500">excl.</span> : fmt(item.qty * item.unit_price)}
                      </div>
                      <button onClick={() => deleteLineItem(activeOptionIdx, itemIdx)}
                        className="text-gray-600 hover:text-red-400 text-xl leading-none pt-1 transition-colors">×</button>
                    </div>
                    <div className="flex items-center gap-2 mt-2 pl-1">
                      <input type="checkbox" id={`excl-${itemIdx}`} checked={item.is_exclusion}
                        onChange={e => updateLineItem(activeOptionIdx, itemIdx, 'is_exclusion', e.target.checked)}
                        className="accent-orange-500 cursor-pointer" />
                      <label htmlFor={`excl-${itemIdx}`}
                        className="text-xs text-gray-500 cursor-pointer select-none hover:text-gray-300">
                        Mark as exclusion (not included in price)
                      </label>
                    </div>
                  </div>
                ))}

                <button onClick={() => addLineItem(activeOptionIdx)}
                  className="w-full py-3 border border-dashed border-gray-700 rounded-lg text-sm text-gray-500 hover:border-blue-600 hover:text-blue-400 transition-all hover:bg-blue-950/20">
                  + Add Line Item
                </button>
              </div>
            </div>
          )}
        </Section>

        {/* 5. INSPECTION PHOTOS */}
        <Section title="Inspection Photos">
          <div className="grid grid-cols-3 gap-4">
            {photos.map((photo, idx) => (
              <div key={idx} className="relative group">
                <img src={photo.photo_url} alt={photo.caption || ''} className="w-full h-36 object-cover rounded-lg" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                  <button onClick={() => photo.id && deletePhoto(photo.id)}
                    className="bg-red-600 text-white text-xs px-3 py-1.5 rounded hover:bg-red-700">Remove</button>
                </div>
                <input
                  className="mt-1.5 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
                  placeholder="Caption (optional)" value={photo.caption}
                  onChange={e => setPhotos(ps => ps.map((p, i) => i !== idx ? p : { ...p, caption: e.target.value }))} />
              </div>
            ))}
            <div onClick={() => !uploadingPhoto && photoInputRef.current?.click()}
              className="border-2 border-dashed border-gray-700 rounded-lg h-36 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-gray-800/30 transition-all">
              {uploadingPhoto
                ? <div className="text-gray-400 text-xs">Uploading...</div>
                : <><div className="text-3xl text-gray-600">+</div><div className="text-xs text-gray-500 mt-1">Add Photo</div></>}
            </div>
          </div>
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => { if (e.target.files?.[0]) uploadPhoto(e.target.files[0], 'inspection') }} />
        </Section>

        {/* 6. TERMS & CONDITIONS */}
        <Section title="Terms & Conditions">
          {/* Mode selector */}
          <div className="flex gap-2 mb-5">
            {(['default', 'custom', 'pdf'] as const).map(mode => (
              <button key={mode} onClick={() => setTcMode(mode)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tcMode === mode ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                {mode === 'default' ? '📄 Default Text' : mode === 'custom' ? '✏️ Custom Text' : '📎 Upload PDF'}
              </button>
            ))}
          </div>

          {/* DEFAULT */}
          {tcMode === 'default' && (
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <p className="text-xs text-gray-500 mb-3 font-semibold uppercase tracking-wide">Default T&C — printed as-is</p>
              <pre className="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap font-sans">{DEFAULT_TC}</pre>
              <p className="text-xs text-gray-600 mt-3 border-t border-gray-700 pt-2">
                Switch to "Custom Text" to edit, or "Upload PDF" to use your own document.
              </p>
            </div>
          )}

          {/* CUSTOM TEXT */}
          {tcMode === 'custom' && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Write your own T&C. Replaces the default text on the estimate.</p>
              <textarea
                className={`${inputCls} resize-y font-mono text-xs leading-relaxed`}
                rows={18}
                placeholder="Enter your custom Terms & Conditions..."
                value={estimate.tc_custom_text || DEFAULT_TC}
                onChange={e => setEstimate(v => ({ ...v, tc_custom_text: e.target.value, tc_file_url: '' }))} />
            </div>
          )}

          {/* PDF UPLOAD */}
          {tcMode === 'pdf' && (
            <div>
              <p className="text-xs text-gray-500 mb-3">Upload a PDF. It will be embedded in the estimate and printed as a full page.</p>
              {estimate.tc_file_url ? (
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">📎</div>
                    <div>
                      <div className="text-sm text-white font-medium">T&C PDF uploaded</div>
                      <a href={estimate.tc_file_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:underline">View PDF →</a>
                    </div>
                  </div>
                  <button onClick={() => setEstimate(e => ({ ...e, tc_file_url: '' }))}
                    className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 border border-red-800 rounded hover:border-red-600">
                    Remove
                  </button>
                </div>
              ) : (
                <div onClick={() => !uploadingTcPdf && tcFileRef.current?.click()}
                  className="border-2 border-dashed border-gray-700 rounded-lg h-28 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-gray-800/30 transition-all">
                  {uploadingTcPdf
                    ? <div className="text-gray-400 text-sm">Uploading PDF...</div>
                    : <>
                        <div className="text-2xl text-gray-600 mb-1">📎</div>
                        <div className="text-gray-400 text-sm">Click to upload T&C PDF</div>
                        <div className="text-gray-600 text-xs mt-1">Will be embedded in the estimate preview</div>
                      </>}
                </div>
              )}
              <input ref={tcFileRef} type="file" accept="application/pdf" className="hidden"
                onChange={e => { if (e.target.files?.[0]) uploadTcPdf(e.target.files[0]) }} />
            </div>
          )}
        </Section>

        {/* 7. NOTES */}
        <Section title="Notes (printed on estimate)">
          <textarea className={`${inputCls} resize-none`} rows={4}
            placeholder="Any notes to include at the bottom of each option page..."
            value={estimate.notes}
            onChange={e => setEstimate(v => ({ ...v, notes: e.target.value }))} />
        </Section>

        {/* BOTTOM BAR */}
        <div className="flex justify-between items-center pb-16">
          <Link href="/estimates" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            ← Back to Estimates
          </Link>
          <div className="flex gap-3">
            <Link href={`/estimates/${estimateId}/preview`}
              className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors">
              👁 Preview PDF
            </Link>
            <button onClick={handleSave} disabled={saving}
              className={`px-8 py-3 rounded-lg font-semibold transition-all ${
                saved  ? 'bg-green-600 text-white' :
                saving ? 'bg-blue-800 text-blue-300 cursor-not-allowed' :
                         'bg-blue-600 hover:bg-blue-500 text-white'}`}>
              {saved ? '✓ Saved!' : saving ? 'Saving...' : 'Save Estimate'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}