'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface LineItem {
  id?: string
  section_name: string
  description: string
  is_exclusion: boolean
  qty: number
  unit_price: number
  line_total: number
  sort_order: number
}
interface Option {
  id?: string
  option_num: number
  option_label: string
  sort_order: number
  items: LineItem[]
}
interface Photo {
  id?: string
  photo_url: string
  caption: string
  sort_order: number
}
interface DocTemplate {
  id: string
  name: string
  description: string
  category: string
  is_enabled?: boolean
}

const PAGES = [
  { key: 'cover',       label: 'Cover Page',          icon: '🏠', always: true  },
  { key: 'inspection',  label: 'Inspection Photos',    icon: '📷', always: false },
  { key: 'details',     label: 'Estimate Details',     icon: '📋', always: true  },
  { key: 'attachments', label: 'Document Attachments', icon: '📎', always: false },
  { key: 'financing',   label: 'Financing Options',    icon: '💰', always: false },
  { key: 'tc',          label: 'Terms & Conditions',   icon: '📄', always: false },
  { key: 'signing',     label: 'Signing Page',         icon: '✍️', always: true  },
]

export default function EstimateBuilderPage() {
  const params   = useParams()
  const router   = useRouter()
  const supabase = createClient()
  const estimateId = params.id as string

  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState('cover')
  const [activeOption, setActiveOption]   = useState(0)

  const [estimateName, setEstimateName] = useState('ROOFING ESTIMATE')
  const [estimateDate, setEstimateDate] = useState(new Date().toISOString().split('T')[0])
  const [status, setStatus]   = useState<'Draft'|'Sent'|'Signed'|'Declined'>('Draft')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [email, setEmail]         = useState('')
  const [phone, setPhone]         = useState('')
  const [address, setAddress]     = useState('')
  const [city, setCity]           = useState('')
  const [state, setState_]        = useState('')
  const [zip, setZip]             = useState('')
  const [photoUrl, setPhotoUrl]   = useState('')
  const [notes, setNotes]         = useState('')

  const [showInspection,  setShowInspection]  = useState(true)
  const [showAttachments, setShowAttachments] = useState(true)
  const [showFinancing,   setShowFinancing]   = useState(true)
  const [showTc,          setShowTc]          = useState(true)
  const [finSunlight, setFinSunlight] = useState(true)
  const [finUpgrade,  setFinUpgrade]  = useState(false)

  const [options, setOptions] = useState<Option[]>([{
    option_num: 1, option_label: 'Option 1', sort_order: 0,
    items: [{ section_name: 'Scope of Work', description: '', is_exclusion: false, qty: 1, unit_price: 0, line_total: 0, sort_order: 0 }]
  }])
  const [photos, setPhotos]           = useState<Photo[]>([])
  const [docTemplates, setDocTemplates] = useState<DocTemplate[]>([])

  useEffect(() => { if (estimateId) loadEstimate() }, [estimateId])

  async function loadEstimate() {
    setLoading(true)
    const [estRes, optsRes, photosRes, templatesRes, attachRes] = await Promise.all([
      supabase.from('estimates').select('*').eq('id', estimateId).single(),
      supabase.from('estimate_options').select('*').eq('estimate_id', estimateId).order('sort_order'),
      supabase.from('estimate_photos').select('*').eq('estimate_id', estimateId).order('sort_order'),
      supabase.from('estimate_document_templates').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('estimate_attachments').select('*').eq('estimate_id', estimateId),
    ])
    if (estRes.data) {
      const e = estRes.data
      setEstimateName(e.estimate_name || 'ROOFING ESTIMATE')
      setEstimateDate(e.estimate_date || new Date().toISOString().split('T')[0])
      setStatus(e.status || 'Draft')
      setFirstName(e.client_first_name || '')
      setLastName(e.client_last_name || '')
      setEmail(e.client_email || '')
      setPhone(e.client_phone || '')
      setAddress(e.client_address || '')
      setCity(e.client_city || '')
      setState_(e.client_state || '')
      setZip(e.client_zip || '')
      setPhotoUrl(e.property_photo_url || '')
      setNotes(e.notes || '')
      setShowInspection(e.show_inspection ?? true)
      setShowAttachments(e.show_attachments ?? true)
      setShowFinancing(e.show_financing ?? true)
      setShowTc(e.show_tc ?? true)
      setFinSunlight(e.financing_sunlight ?? true)
      setFinUpgrade(e.financing_upgrade ?? false)
    }
    if (optsRes.data && optsRes.data.length > 0) {
      const optionsWithItems = await Promise.all(
        optsRes.data.map(async (opt) => {
          const { data: items } = await supabase
            .from('estimate_line_items').select('*').eq('option_id', opt.id).order('sort_order')
          return { ...opt, items: (items || []) as LineItem[] }
        })
      )
      setOptions(optionsWithItems as Option[])
    }
    if (photosRes.data) setPhotos(photosRes.data as Photo[])
    if (templatesRes.data) {
      const enabledIds = new Set((attachRes.data || []).filter((a: any) => a.is_enabled).map((a: any) => a.template_id))
      setDocTemplates(templatesRes.data.map(t => ({ ...t, is_enabled: enabledIds.has(t.id) })))
    }
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    await supabase.from('estimates').upsert({
      id: estimateId, estimate_name: estimateName, estimate_date: estimateDate, status,
      client_first_name: firstName, client_last_name: lastName, client_email: email,
      client_phone: phone, client_address: address, client_city: city, client_state: state,
      client_zip: zip, property_photo_url: photoUrl, notes,
      show_inspection: showInspection, show_attachments: showAttachments,
      show_financing: showFinancing, show_tc: showTc,
      financing_sunlight: finSunlight, financing_upgrade: finUpgrade,
      updated_at: new Date().toISOString(),
    })
    for (const opt of options) {
      let optId = opt.id
      if (!optId) {
        const { data: newOpt } = await supabase.from('estimate_options').insert({
          estimate_id: estimateId, option_num: opt.option_num,
          option_label: opt.option_label, sort_order: opt.sort_order,
        }).select().single()
        optId = newOpt?.id
      } else {
        await supabase.from('estimate_options').update({
          option_label: opt.option_label, sort_order: opt.sort_order,
        }).eq('id', optId)
      }
      if (!optId) continue
      await supabase.from('estimate_line_items').delete().eq('option_id', optId)
      for (let i = 0; i < opt.items.length; i++) {
        const item = opt.items[i]
        await supabase.from('estimate_line_items').insert({
          option_id: optId, estimate_id: estimateId,
          section_name: item.section_name, description: item.description,
          is_exclusion: item.is_exclusion, qty: item.qty, unit_price: item.unit_price,
          line_total: item.qty * item.unit_price, sort_order: i,
        })
      }
    }
    await supabase.from('estimate_attachments').delete().eq('estimate_id', estimateId)
    for (const t of docTemplates) {
      await supabase.from('estimate_attachments').insert({
        estimate_id: estimateId, template_id: t.id,
        is_enabled: t.is_enabled || false, sort_order: (t as any).sort_order || 0,
      })
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function addOption() {
    const num = options.length + 1
    setOptions(prev => [...prev, {
      option_num: num, option_label: `Option ${num}`, sort_order: prev.length,
      items: [{ section_name: 'Scope of Work', description: '', is_exclusion: false, qty: 1, unit_price: 0, line_total: 0, sort_order: 0 }]
    }])
    setActiveOption(options.length)
  }

  function addLineItem(optIdx: number) {
    setOptions(prev => {
      const next = [...prev]
      next[optIdx] = { ...next[optIdx], items: [...next[optIdx].items,
        { section_name: 'Scope of Work', description: '', is_exclusion: false, qty: 1, unit_price: 0, line_total: 0, sort_order: next[optIdx].items.length }
      ]}
      return next
    })
  }

  function updateItem(optIdx: number, itemIdx: number, field: keyof LineItem, value: any) {
    setOptions(prev => {
      const next = [...prev]
      const items = [...next[optIdx].items]
      items[itemIdx] = { ...items[itemIdx], [field]: value,
        line_total: field === 'qty' ? value * items[itemIdx].unit_price
                  : field === 'unit_price' ? items[itemIdx].qty * value
                  : items[itemIdx].line_total
      }
      next[optIdx] = { ...next[optIdx], items }
      return next
    })
  }

  function removeItem(optIdx: number, itemIdx: number) {
    setOptions(prev => {
      const next = [...prev]
      next[optIdx] = { ...next[optIdx], items: next[optIdx].items.filter((_, i) => i !== itemIdx) }
      return next
    })
  }

  function optionTotal(optIdx: number) {
    return options[optIdx]?.items.filter(i => !i.is_exclusion)
      .reduce((sum, i) => sum + (i.qty * i.unit_price), 0) || 0
  }

  function toggleDoc(id: string) {
    setDocTemplates(prev => prev.map(t => t.id === id ? { ...t, is_enabled: !t.is_enabled } : t))
  }

  function addPhotoUrl(url: string) {
    if (!url) return
    setPhotos(prev => [...prev, { photo_url: url, caption: '', sort_order: prev.length }])
  }

  function removePhoto(idx: number) {
    setPhotos(prev => prev.filter((_, i) => i !== idx))
  }

  function scrollTo(key: string) {
    setActiveSection(key)
    document.getElementById(`section-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading estimate...</div>

  const fmtCurrency = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-y-auto">
        <div className="p-4 border-b border-gray-100">
          <Link href="/estimates" className="text-xs text-gray-400 hover:text-gray-600">← Estimates</Link>
          <div className="mt-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              status === 'Draft' ? 'bg-gray-100 text-gray-700' :
              status === 'Sent'  ? 'bg-blue-100 text-blue-700' :
              status === 'Signed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>{status}</span>
          </div>
        </div>
        <div className="p-3 border-b border-gray-100">
          <label className="text-[10px] text-gray-400 uppercase tracking-wide mb-1 block">Status</label>
          <select value={status} onChange={e => setStatus(e.target.value as any)}
            className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none">
            {['Draft','Sent','Signed','Declined'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="p-3 flex-1">
          <label className="text-[10px] text-gray-400 uppercase tracking-wide mb-2 block">Pages</label>
          <div className="space-y-1">
            {PAGES.map(pg => {
              const isOn = pg.always ||
                (pg.key === 'inspection' && showInspection) ||
                (pg.key === 'attachments' && showAttachments) ||
                (pg.key === 'financing' && showFinancing) ||
                (pg.key === 'tc' && showTc)
              return (
                <div key={pg.key}
                  className={`flex items-center justify-between rounded px-2 py-1.5 cursor-pointer transition-colors ${
                    activeSection === pg.key ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'
                  }`}
                  onClick={() => scrollTo(pg.key)}>
                  <span className="text-xs flex items-center gap-1.5">
                    <span>{pg.icon}</span>
                    <span className={!isOn ? 'text-gray-300' : ''}>{pg.label}</span>
                  </span>
                  {!pg.always && (
                    <button onClick={e => {
                      e.stopPropagation()
                      if (pg.key === 'inspection')  setShowInspection(v => !v)
                      if (pg.key === 'attachments') setShowAttachments(v => !v)
                      if (pg.key === 'financing')   setShowFinancing(v => !v)
                      if (pg.key === 'tc')          setShowTc(v => !v)
                    }} className={`w-8 h-4 rounded-full transition-colors shrink-0 ${isOn ? 'bg-blue-600' : 'bg-gray-200'}`}>
                      <div className={`w-3 h-3 bg-white rounded-full mx-auto transition-transform ${isOn ? 'translate-x-2' : '-translate-x-1.5'}`} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <div className="p-3 border-t border-gray-100">
          <Link href={`/estimates/${estimateId}/preview`} target="_blank"
            className="w-full block text-center text-xs bg-gray-900 text-white px-3 py-2 rounded-lg hover:bg-gray-700">
            Preview / Print PDF
          </Link>
        </div>
      </aside>

      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <input value={estimateName} onChange={e => setEstimateName(e.target.value.toUpperCase())}
            className="text-lg font-bold text-gray-900 border-none bg-transparent focus:outline-none focus:bg-gray-50 rounded px-1" />
          <div className="flex items-center gap-3">
            {saved && <span className="text-xs text-green-600 font-medium">✓ Saved</span>}
            <button onClick={save} disabled={saving}
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        <div className="max-w-3xl mx-auto p-6 space-y-8">

          <section id="section-cover" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center gap-2">
              <span>🏠</span><h2 className="font-semibold text-gray-800">Cover Page</h2>
              <span className="ml-auto text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">Always on</span>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Estimate Name</label>
                  <input value={estimateName} onChange={e => setEstimateName(e.target.value.toUpperCase())}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Date</label>
                  <input type="date" value={estimateDate} onChange={e => setEstimateDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                </div>
              </div>
              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Client Information</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-gray-500 mb-1 block">First Name</label>
                    <input value={firstName} onChange={e => setFirstName(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" /></div>
                  <div><label className="text-xs text-gray-500 mb-1 block">Last Name</label>
                    <input value={lastName} onChange={e => setLastName(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" /></div>
                  <div><label className="text-xs text-gray-500 mb-1 block">Email</label>
                    <input value={email} onChange={e => setEmail(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" /></div>
                  <div><label className="text-xs text-gray-500 mb-1 block">Phone</label>
                    <input value={phone} onChange={e => setPhone(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" /></div>
                  <div className="col-span-2"><label className="text-xs text-gray-500 mb-1 block">Address</label>
                    <input value={address} onChange={e => setAddress(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" /></div>
                  <div><label className="text-xs text-gray-500 mb-1 block">City</label>
                    <input value={city} onChange={e => setCity(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-xs text-gray-500 mb-1 block">State</label>
                      <input value={state} onChange={e => setState_(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" /></div>
                    <div><label className="text-xs text-gray-500 mb-1 block">Zip</label>
                      <input value={zip} onChange={e => setZip(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" /></div>
                  </div>
                </div>
              </div>
              <div className="border-t border-gray-100 pt-4">
                <label className="text-xs text-gray-500 mb-1 block">Property Photo URL</label>
                <input value={photoUrl} onChange={e => setPhotoUrl(e.target.value)}
                  placeholder="https://... paste image URL"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                {photoUrl && <img src={photoUrl} alt="Property" className="mt-2 w-full h-48 object-cover rounded-lg"
                  onError={e => (e.currentTarget.style.display='none')} />}
              </div>
            </div>
          </section>

          {showInspection && (
            <section id="section-inspection" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center gap-2">
                <span>📷</span><h2 className="font-semibold text-gray-800">Inspection Photos</h2>
                <span className="ml-auto text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Toggleable</span>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {photos.map((photo, i) => (
                    <div key={i} className="relative border border-gray-200 rounded-lg overflow-hidden">
                      <img src={photo.photo_url} alt="" className="w-full h-40 object-cover"
                        onError={e => (e.currentTarget.style.display='none')} />
                      <div className="p-2">
                        <input value={photo.caption} placeholder="Caption (optional)"
                          onChange={e => setPhotos(prev => { const n=[...prev]; n[i]={...n[i],caption:e.target.value}; return n })}
                          className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none" />
                      </div>
                      <button onClick={() => removePhoto(i)}
                        className="absolute top-1.5 right-1.5 bg-red-500 text-white w-5 h-5 rounded-full text-xs flex items-center justify-center">×</button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input id="photo-url-input" placeholder="Paste photo URL and click Add"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                  <button onClick={() => { const inp=document.getElementById('photo-url-input') as HTMLInputElement; addPhotoUrl(inp.value); inp.value='' }}
                    className="bg-gray-900 text-white text-xs px-4 py-2 rounded-lg hover:bg-gray-700">+ Add Photo</button>
                </div>
              </div>
            </section>
          )}

          <section id="section-details" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center gap-2">
              <span>📋</span><h2 className="font-semibold text-gray-800">Estimate Details</h2>
              <span className="ml-auto text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">Always on</span>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-5">
                {options.map((opt, i) => (
                  <button key={i} onClick={() => setActiveOption(i)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      activeOption === i ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                    }`}>{opt.option_label}</button>
                ))}
                <button onClick={addOption}
                  className="px-3 py-1.5 text-xs text-gray-500 border border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:text-blue-600">+ Option</button>
              </div>
              {options[activeOption] && (
                <div>
                  <div className="grid grid-cols-12 gap-2 mb-2 text-xs text-gray-400 font-medium uppercase tracking-wide">
                    <div className="col-span-5">Description</div><div className="col-span-2">Section</div>
                    <div className="col-span-1">Qty</div><div className="col-span-2">Unit Price</div>
                    <div className="col-span-1 text-right">Total</div><div className="col-span-1"></div>
                  </div>
                  {options[activeOption].items.map((item, itemIdx) => (
                    <div key={itemIdx} className={`grid grid-cols-12 gap-2 mb-2 p-2 rounded-lg ${item.is_exclusion ? 'bg-orange-50 border border-orange-100' : 'bg-gray-50'}`}>
                      <div className="col-span-5">
                        <textarea value={item.description} rows={2}
                          onChange={e => updateItem(activeOption, itemIdx, 'description', e.target.value)}
                          placeholder={item.is_exclusion ? 'Exclusion description...' : 'Scope of work description...'}
                          className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none resize-none bg-white" />
                        <label className="flex items-center gap-1 mt-1 cursor-pointer">
                          <input type="checkbox" checked={item.is_exclusion} className="w-3 h-3"
                            onChange={e => updateItem(activeOption, itemIdx, 'is_exclusion', e.target.checked)} />
                          <span className="text-[10px] text-gray-400">Exclusion</span>
                        </label>
                      </div>
                      <div className="col-span-2">
                        <input value={item.section_name} placeholder="Section"
                          onChange={e => updateItem(activeOption, itemIdx, 'section_name', e.target.value)}
                          className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none bg-white" />
                      </div>
                      <div className="col-span-1">
                        <input type="number" value={item.qty}
                          onChange={e => updateItem(activeOption, itemIdx, 'qty', parseFloat(e.target.value)||0)}
                          className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none bg-white text-right" />
                      </div>
                      <div className="col-span-2">
                        <input type="number" value={item.unit_price}
                          onChange={e => updateItem(activeOption, itemIdx, 'unit_price', parseFloat(e.target.value)||0)}
                          className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none bg-white text-right" />
                      </div>
                      <div className="col-span-1 text-xs text-right font-medium text-gray-700 flex items-center justify-end">
                        {fmtCurrency(item.qty * item.unit_price)}
                      </div>
                      <div className="col-span-1 flex items-center justify-center">
                        <button onClick={() => removeItem(activeOption, itemIdx)}
                          className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                      </div>
                    </div>
                  ))}
                  <button onClick={() => addLineItem(activeOption)} className="mt-2 text-xs text-blue-600 hover:underline">+ Add Line Item</button>
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500">Estimate subtotal</span>
                      <span className="font-medium">{fmtCurrency(optionTotal(activeOption))}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold">
                      <span>Total</span><span className="text-blue-700">{fmtCurrency(optionTotal(activeOption))}</span>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <label className="text-xs text-gray-500 mb-1 block">Notes</label>
                    <textarea value={notes} rows={3} onChange={e => setNotes(e.target.value)}
                      placeholder="Add any notes for the client..."
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none" />
                  </div>
                </div>
              )}
            </div>
          </section>

          {showAttachments && (
            <section id="section-attachments" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center gap-2">
                <span>📎</span><h2 className="font-semibold text-gray-800">Document Attachments</h2>
                <span className="ml-auto text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Toggleable</span>
              </div>
              <div className="p-5">
                <p className="text-xs text-gray-500 mb-4">Toggle which documents to include in this estimate.</p>
                <div className="space-y-3">
                  {docTemplates.map(t => (
                    <div key={t.id} className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${t.is_enabled ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{t.category === 'certification' ? '🏅' : '📄'}</span>
                        <div>
                          <div className="text-sm font-medium text-gray-800">{t.name}</div>
                          <div className="text-xs text-gray-400">{t.description}</div>
                        </div>
                      </div>
                      <button onClick={() => toggleDoc(t.id)}
                        className={`w-10 h-5 rounded-full transition-colors shrink-0 ${t.is_enabled ? 'bg-blue-600' : 'bg-gray-200'}`}>
                        <div className={`w-4 h-4 bg-white rounded-full mx-auto transition-transform ${t.is_enabled ? 'translate-x-2.5' : '-translate-x-2.5'}`} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {showFinancing && (
            <section id="section-financing" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center gap-2">
                <span>💰</span><h2 className="font-semibold text-gray-800">Financing Options</h2>
                <span className="ml-auto text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Toggleable</span>
              </div>
              <div className="p-5">
                <p className="text-xs text-gray-500 mb-4">Select financing partners to show. Informational only.</p>
                <div className="grid grid-cols-2 gap-4">
                  <div onClick={() => setFinSunlight(v => !v)}
                    className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-colors ${finSunlight ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`}>
                    <div>
                      <div className="font-semibold text-gray-800">☀️ Sunlight Financial</div>
                      <div className="text-xs text-gray-400 mt-0.5">Flexible solar & home financing</div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 ${finSunlight ? 'bg-orange-500 border-orange-500' : 'border-gray-300'}`}>
                      {finSunlight && <div className="w-2 h-2 bg-white rounded-full m-auto mt-0.5" />}
                    </div>
                  </div>
                  <div onClick={() => setFinUpgrade(v => !v)}
                    className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-colors ${finUpgrade ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
                    <div>
                      <div className="font-semibold text-gray-800">⚡ Upgrade Finance</div>
                      <div className="text-xs text-gray-400 mt-0.5">Home improvement financing</div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 ${finUpgrade ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                      {finUpgrade && <div className="w-2 h-2 bg-white rounded-full m-auto mt-0.5" />}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {showTc && (
            <section id="section-tc" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center gap-2">
                <span>📄</span><h2 className="font-semibold text-gray-800">Terms & Conditions</h2>
                <span className="ml-auto text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Toggleable</span>
              </div>
              <div className="p-5">
                <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-600 leading-relaxed space-y-3 max-h-64 overflow-y-auto border border-gray-200">
                  <p><strong>1. Project Description</strong><br />The Contractor shall furnish all labor, materials, equipment, and services necessary to complete the project.</p>
                  <p><strong>2. Work Timeline</strong><br />Work begins within ten (10) business days after contract execution.</p>
                  <p><strong>3. Compensation Terms</strong><br />One-Third (1/3) due upon signing. Remaining balance due upon completion. Late balances accrue 1.5% monthly.</p>
                  <p><strong>4. Modifications</strong><br />Changes must be documented in writing via a formal Change Order.</p>
                  <p><strong>5. Warranties</strong><br />Contractor warrants labor as specified. Excludes sealants, coatings, and cosmetic finishes.</p>
                  <p><strong>6. Cancellation (NJ Law)</strong><br />Owner may cancel within 3 business days. Refunds issued within 30 days.</p>
                  <p><strong>7. Insurance</strong><br />Contractor carries General Liability and Workers' Compensation Insurance.</p>
                </div>
              </div>
            </section>
          )}

          <section id="section-signing" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center gap-2">
              <span>✍️</span><h2 className="font-semibold text-gray-800">Signing Page</h2>
              <span className="ml-auto text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">Always on</span>
            </div>
            <div className="p-5">
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <p className="text-xs text-gray-500 mb-3">Auto-generated in preview. Includes:</p>
                <ul className="text-xs text-gray-500 space-y-1">
                  {options.map((opt, i) => <li key={i}>✓ {opt.option_label}: {fmtCurrency(optionTotal(i))}</li>)}
                  <li>✓ Client name & address</li>
                  {finSunlight && <li>✓ Sunlight Financial</li>}
                  {finUpgrade  && <li>✓ Upgrade Finance</li>}
                  <li>✓ Signature line + 3-day cancellation notice</li>
                </ul>
              </div>
            </div>
          </section>

          <div className="flex justify-end pb-8">
            <button onClick={save} disabled={saving}
              className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 font-medium disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Estimate'}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}