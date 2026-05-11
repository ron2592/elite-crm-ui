'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

interface LineItem {
  id?: string
  section_name: string
  description: string
  is_exclusion: boolean
  qty: number
  unit_price: number | string
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
interface Photo { id?: string; photo_url: string; caption: string; sort_order: number }
interface DocTemplate { id: string; name: string; description: string; category: string; file_url?: string; is_enabled?: boolean; sort_order?: number }
interface Product { id: string; name: string; description: string; unit_price: number; category: string }
interface Lead { id: string; first_name: string; last_name: string; phone?: string; email?: string; metadata?: any }
interface CustomPage { id?: string; title: string; type: 'pdf' | 'text'; content?: string; file_url?: string; sort_order: number }

const CORE_PAGES = [
  { key: 'cover',      label: 'Cover Page',          icon: '🏠', always: true  },
  { key: 'inspection', label: 'Inspection Photos',    icon: '📷', always: false },
  { key: 'details',    label: 'Estimate Details',     icon: '📋', always: true  },
  { key: 'docs',       label: 'Document Attachments', icon: '📎', always: false },
  { key: 'financing',  label: 'Financing Options',    icon: '💰', always: false },
  { key: 'tc',         label: 'Terms & Conditions',   icon: '📄', always: false },
  { key: 'signing',    label: 'Signing Page',         icon: '✍️', always: true  },
]

export default function EstimateBuilderPage() {
  const params     = useParams()
  const router     = useRouter()
  const estimateId = params.id as string

  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState('cover')
  const [activeOption, setActiveOption]   = useState(0)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [uploadingBadge, setUploadingBadge] = useState(false)

  // Estimate fields
  const [estimateName, setEstimateName] = useState('ROOFING ESTIMATE')
  const [estimateDate, setEstimateDate] = useState(new Date().toISOString().split('T')[0])
  const [status, setStatus]   = useState<'Draft'|'Sent'|'Signed'|'Declined'>('Draft')
  const [leadId, setLeadId]   = useState<string>('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [email, setEmail]         = useState('')
  const [phone, setPhone]         = useState('')
  const [address, setAddress]     = useState('')
  const [city, setCity]           = useState('')
  const [state, setState_]        = useState('')
  const [zip, setZip]             = useState('')
  const [photoUrl, setPhotoUrl]   = useState('')
  const [certBadgeUrl, setCertBadgeUrl] = useState('')
  const [notes, setNotes]         = useState('')

  // Toggles
  const [showInspection, setShowInspection] = useState(true)
  const [showDocs,       setShowDocs]       = useState(true)
  const [showFinancing,  setShowFinancing]  = useState(true)
  const [showTc,         setShowTc]         = useState(true)
  const [finSunlight,    setFinSunlight]    = useState(true)
  const [finUpgrade,     setFinUpgrade]     = useState(false)

  // Data
  const [options,      setOptions]      = useState<Option[]>([{ option_num:1, option_label:'Option 1', sort_order:0, items:[{ section_name:'Scope of Work', description:'', is_exclusion:false, qty:1, unit_price:'', line_total:0, sort_order:0 }] }])
  const [photos,       setPhotos]       = useState<Photo[]>([])
  const [docTemplates, setDocTemplates] = useState<DocTemplate[]>([])
  const [customPages,  setCustomPages]  = useState<CustomPage[]>([])
  const [leads,        setLeads]        = useState<Lead[]>([])
  const [products,     setProducts]     = useState<Product[]>([])
  const [productSuggestions, setProductSuggestions] = useState<Product[]>([])
  const [activeSuggestionFor, setActiveSuggestionFor] = useState<string|null>(null)
  const [tcFileUrl,    setTcFileUrl]    = useState('')
  const [uploadingTc,  setUploadingTc]  = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState<string|null>(null)

  // Lead search
  const [leadSearch, setLeadSearch]       = useState('')
  const [leadDropOpen, setLeadDropOpen]   = useState(false)
  const leadSearchRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (estimateId) loadAll() }, [estimateId])

  // Close lead dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (leadSearchRef.current && !leadSearchRef.current.contains(e.target as Node)) {
        setLeadDropOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function loadAll() {
    setLoading(true)
    const [estRes, optsRes, photosRes, templatesRes, attachRes, leadsRes, productsRes] = await Promise.all([
      supabase.from('estimates').select('*').eq('id', estimateId).single(),
      supabase.from('estimate_options').select('*').eq('estimate_id', estimateId).order('sort_order'),
      supabase.from('estimate_photos').select('*').eq('estimate_id', estimateId).order('sort_order'),
      supabase.from('estimate_document_templates').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('estimate_attachments').select('*').eq('estimate_id', estimateId),
      supabase.from('leads').select('id, first_name, last_name, phone, email, metadata').order('created_at', { ascending: false }).limit(500),
      supabase.from('estimate_products').select('*').eq('is_active', true).order('name'),
    ])

    if (estRes.data) {
      const e = estRes.data
      setEstimateName(e.estimate_name || 'ROOFING ESTIMATE')
      setEstimateDate(e.estimate_date || new Date().toISOString().split('T')[0])
      setStatus(e.status || 'Draft')
      setLeadId(e.lead_id || '')
      setFirstName(e.client_first_name || '')
      setLastName(e.client_last_name || '')
      setEmail(e.client_email || '')
      setPhone(e.client_phone || '')
      setAddress(e.client_address || '')
      setCity(e.client_city || '')
      setState_(e.client_state || '')
      setZip(e.client_zip || '')
      setPhotoUrl(e.property_photo_url || '')
      setCertBadgeUrl(e.cert_badge_url || '')
      setNotes(e.notes || '')
      setShowInspection(e.show_inspection ?? true)
      setShowDocs(e.show_attachments ?? true)
      setShowFinancing(e.show_financing ?? true)
      setShowTc(e.show_tc ?? true)
      setFinSunlight(e.financing_sunlight ?? true)
      setFinUpgrade(e.financing_upgrade ?? false)
      setTcFileUrl(e.tc_file_url || '')
      // Set lead search display name
      if (e.lead_id && e.client_first_name) {
        setLeadSearch(`${e.client_first_name} ${e.client_last_name}`.trim())
      }
    }

    if (optsRes.data && optsRes.data.length > 0) {
      const optsWithItems = await Promise.all(optsRes.data.map(async opt => {
        const { data: items } = await supabase.from('estimate_line_items').select('*').eq('option_id', opt.id).order('sort_order')
        return { ...opt, items: (items || []).map((i: any) => ({ ...i, unit_price: i.unit_price === 0 ? '' : i.unit_price })) as LineItem[] }
      }))
      setOptions(optsWithItems as Option[])
    }

    if (photosRes.data) setPhotos(photosRes.data as Photo[])

    if (templatesRes.data) {
      const enabledIds = new Set((attachRes.data || []).filter((a:any) => a.is_enabled).map((a:any) => a.template_id))
      setDocTemplates(templatesRes.data.map(t => ({ ...t, is_enabled: enabledIds.has(t.id) })))
    }

    if (leadsRes.data) setLeads(leadsRes.data as Lead[])
    if (productsRes.data) setProducts(productsRes.data as Product[])
    setLoading(false)
  }

  // Filtered leads for search
  const filteredLeads = leads.filter(l => {
    const name = `${l.first_name} ${l.last_name}`.toLowerCase()
    return !leadSearch || name.includes(leadSearch.toLowerCase())
  }).slice(0, 20)

  function selectLead(lead: Lead) {
    setLeadId(lead.id)
    setLeadSearch(`${lead.first_name} ${lead.last_name}`.trim())
    setLeadDropOpen(false)
    setFirstName(lead.first_name || '')
    setLastName(lead.last_name || '')
    setPhone(lead.phone || '')
    setEmail(lead.email || '')
    const meta = lead.metadata || {}
    setAddress(meta.address || '')
    setCity(meta.city || '')
    setState_(meta.state || '')
    setZip(meta.zip || '')
  }

  function clearLead() {
    setLeadId('')
    setLeadSearch('')
    setLeadDropOpen(false)
  }

  // Upload helpers
  async function uploadCoverPhoto(file: File) {
    setUploadingCover(true)
    const ext = file.name.split('.').pop()
    const path = `${estimateId}/cover-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('estimate-uploads').upload(path, file, { upsert: true })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('estimate-uploads').getPublicUrl(path)
      setPhotoUrl(publicUrl)
    }
    setUploadingCover(false)
  }

  async function uploadCertBadge(file: File) {
    setUploadingBadge(true)
    const ext = file.name.split('.').pop()
    const path = `${estimateId}/badge-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('estimate-uploads').upload(path, file, { upsert: true })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('estimate-uploads').getPublicUrl(path)
      setCertBadgeUrl(publicUrl)
    }
    setUploadingBadge(false)
  }

  async function uploadInspectionPhotos(files: FileList) {
    setUploadingPhoto(true)
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()
      const path = `${estimateId}/inspect-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('estimate-uploads').upload(path, file)
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('estimate-uploads').getPublicUrl(path)
        setPhotos(prev => [...prev, { photo_url: publicUrl, caption: '', sort_order: prev.length }])
      }
    }
    setUploadingPhoto(false)
  }

  async function uploadTcPdf(file: File) {
    setUploadingTc(true)
    const path = `${estimateId}/tc-${Date.now()}.pdf`
    const { error } = await supabase.storage.from('estimate-uploads').upload(path, file, { upsert: true })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('estimate-uploads').getPublicUrl(path)
      setTcFileUrl(publicUrl)
    }
    setUploadingTc(false)
  }

  async function uploadDocFile(templateId: string, file: File) {
    setUploadingDoc(templateId)
    const path = `docs/${templateId}-${Date.now()}.pdf`
    const { error } = await supabase.storage.from('estimate-uploads').upload(path, file, { upsert: true })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('estimate-uploads').getPublicUrl(path)
      await supabase.from('estimate_document_templates').update({ file_url: publicUrl }).eq('id', templateId)
      setDocTemplates(prev => prev.map(t => t.id === templateId ? { ...t, file_url: publicUrl } : t))
    }
    setUploadingDoc(null)
  }

  // Product autocomplete
  function handleProductSearch(optIdx: number, itemIdx: number, value: string) {
    updateItem(optIdx, itemIdx, 'section_name', value)
    if (value.length >= 2) {
      const matches = products.filter(p => p.name.toLowerCase().includes(value.toLowerCase()))
      setProductSuggestions(matches.slice(0, 6))
      setActiveSuggestionFor(`${optIdx}-${itemIdx}`)
    } else {
      setProductSuggestions([])
      setActiveSuggestionFor(null)
    }
  }

  function applyProduct(optIdx: number, itemIdx: number, product: Product) {
    setOptions(prev => {
      const next = [...prev]
      const items = [...next[optIdx].items]
      items[itemIdx] = { ...items[itemIdx], section_name: product.name, description: product.description, unit_price: product.unit_price || '', line_total: items[itemIdx].qty * product.unit_price }
      next[optIdx] = { ...next[optIdx], items }
      return next
    })
    setProductSuggestions([])
    setActiveSuggestionFor(null)
  }

  function addCustomPage(type: 'pdf' | 'text') {
    setCustomPages(prev => [...prev, { title: type === 'pdf' ? 'New Document' : 'New Text Page', type, content: '', sort_order: prev.length }])
    setTimeout(() => scrollTo(`custom-${customPages.length}`), 100)
  }

  async function save() {
    setSaving(true)
    await supabase.from('estimates').upsert({
      id: estimateId, lead_id: leadId || null,
      estimate_name: estimateName, estimate_date: estimateDate, status,
      client_first_name: firstName, client_last_name: lastName,
      client_email: email, client_phone: phone, client_address: address,
      client_city: city, client_state: state, client_zip: zip,
      property_photo_url: photoUrl, cert_badge_url: certBadgeUrl, notes,
      show_inspection: showInspection, show_attachments: showDocs,
      show_financing: showFinancing, show_tc: showTc,
      financing_sunlight: finSunlight, financing_upgrade: finUpgrade,
      tc_file_url: tcFileUrl, updated_at: new Date().toISOString(),
    })

    for (const opt of options) {
      let optId = opt.id
      if (!optId) {
        const { data: newOpt } = await supabase.from('estimate_options').insert({ estimate_id: estimateId, option_num: opt.option_num, option_label: opt.option_label, sort_order: opt.sort_order }).select().single()
        optId = newOpt?.id
      } else {
        await supabase.from('estimate_options').update({ option_label: opt.option_label, sort_order: opt.sort_order }).eq('id', optId)
      }
      if (!optId) continue
      await supabase.from('estimate_line_items').delete().eq('option_id', optId)
      for (let i = 0; i < opt.items.length; i++) {
        const item = opt.items[i]
        const price = parseFloat(String(item.unit_price)) || 0
        await supabase.from('estimate_line_items').insert({ option_id: optId, estimate_id: estimateId, section_name: item.section_name, description: item.description, is_exclusion: item.is_exclusion, qty: item.qty, unit_price: price, line_total: item.qty * price, sort_order: i })
      }
    }

    await supabase.from('estimate_attachments').delete().eq('estimate_id', estimateId)
    for (const t of docTemplates) {
      await supabase.from('estimate_attachments').insert({ estimate_id: estimateId, template_id: t.id, is_enabled: t.is_enabled || false, sort_order: t.sort_order || 0 })
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function addOption() {
    const num = options.length + 1
    setOptions(prev => [...prev, { option_num: num, option_label: `Option ${num}`, sort_order: prev.length, items: [{ section_name: 'Scope of Work', description: '', is_exclusion: false, qty: 1, unit_price: '', line_total: 0, sort_order: 0 }] }])
    setActiveOption(options.length)
  }

  function addLineItem(optIdx: number) {
    setOptions(prev => {
      const next = [...prev]
      next[optIdx] = { ...next[optIdx], items: [...next[optIdx].items, { section_name: '', description: '', is_exclusion: false, qty: 1, unit_price: '', line_total: 0, sort_order: next[optIdx].items.length }] }
      return next
    })
  }

  function updateItem(optIdx: number, itemIdx: number, field: keyof LineItem, value: any) {
    setOptions(prev => {
      const next = [...prev]
      const items = [...next[optIdx].items]
      const current = items[itemIdx]
      const qty   = field === 'qty'        ? (parseFloat(value) || 0) : (parseFloat(String(current.qty)) || 0)
      const price = field === 'unit_price' ? (parseFloat(value) || 0) : (parseFloat(String(current.unit_price)) || 0)
      items[itemIdx] = { ...current, [field]: value, line_total: qty * price }
      next[optIdx] = { ...next[optIdx], items }
      return next
    })
  }

  function removeItem(optIdx: number, itemIdx: number) {
    setOptions(prev => { const next = [...prev]; next[optIdx] = { ...next[optIdx], items: next[optIdx].items.filter((_, i) => i !== itemIdx) }; return next })
  }

  function optionTotal(optIdx: number) {
    return options[optIdx]?.items.filter(i => !i.is_exclusion).reduce((sum, i) => sum + (parseFloat(String(i.qty)) || 0) * (parseFloat(String(i.unit_price)) || 0), 0) || 0
  }

  function toggleDoc(id: string) {
    setDocTemplates(prev => prev.map(t => t.id === id ? { ...t, is_enabled: !t.is_enabled } : t))
  }

  function removePhoto(idx: number) {
    setPhotos(prev => prev.filter((_, i) => i !== idx))
  }

  function scrollTo(key: string) {
    setActiveSection(key)
    document.getElementById(`section-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading estimate...</div>

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-y-auto">
        <div className="p-4 border-b border-gray-100">
          <Link href="/estimates" className="text-xs text-gray-400 hover:text-gray-600">← Estimates</Link>
          <div className="mt-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status === 'Draft' ? 'bg-gray-100 text-gray-700' : status === 'Sent' ? 'bg-blue-100 text-blue-700' : status === 'Signed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{status}</span>
          </div>
        </div>

        <div className="p-3 border-b border-gray-100">
          <label className="text-[10px] text-gray-400 uppercase tracking-wide mb-1 block">Status</label>
          <select value={status} onChange={e => setStatus(e.target.value as any)} className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none">
            {['Draft','Sent','Signed','Declined'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="p-3 flex-1">
          <label className="text-[10px] text-gray-400 uppercase tracking-wide mb-2 block">Pages</label>
          <div className="space-y-1">
            {CORE_PAGES.map(pg => {
              const isOn = pg.always || (pg.key === 'inspection' && showInspection) || (pg.key === 'docs' && showDocs) || (pg.key === 'financing' && showFinancing) || (pg.key === 'tc' && showTc)
              return (
                <div key={pg.key} className={`flex items-center justify-between rounded px-2 py-1.5 cursor-pointer transition-colors ${activeSection === pg.key ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}`} onClick={() => scrollTo(pg.key)}>
                  <span className="text-xs flex items-center gap-1.5">
                    <span>{pg.icon}</span>
                    <span className={!isOn ? 'text-gray-300' : ''}>{pg.label}</span>
                  </span>
                  {!pg.always && (
                    <button onClick={e => { e.stopPropagation(); if (pg.key==='inspection') setShowInspection(v=>!v); if (pg.key==='docs') setShowDocs(v=>!v); if (pg.key==='financing') setShowFinancing(v=>!v); if (pg.key==='tc') setShowTc(v=>!v) }}
                      className={`w-8 h-4 rounded-full transition-colors shrink-0 ${isOn ? 'bg-blue-600' : 'bg-gray-200'}`}>
                      <div className={`w-3 h-3 bg-white rounded-full mx-auto transition-transform ${isOn ? 'translate-x-2' : '-translate-x-1.5'}`} />
                    </button>
                  )}
                </div>
              )
            })}
            {customPages.map((cp, i) => (
              <div key={i} className={`flex items-center justify-between rounded px-2 py-1.5 cursor-pointer transition-colors ${activeSection === `custom-${i}` ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}`} onClick={() => scrollTo(`custom-${i}`)}>
                <span className="text-xs flex items-center gap-1.5">
                  <span>{cp.type === 'pdf' ? '📎' : '📝'}</span>
                  <span className="truncate max-w-[90px]">{cp.title}</span>
                </span>
                <button onClick={e => { e.stopPropagation(); setCustomPages(prev => prev.filter((_,j) => j!==i)) }} className="text-gray-300 hover:text-red-400 text-sm">×</button>
              </div>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Add Page</p>
            <button onClick={() => addCustomPage('pdf')} className="w-full text-left text-xs text-gray-500 hover:text-blue-600 px-2 py-1.5 rounded hover:bg-blue-50 flex items-center gap-2">
              <span>📎</span> PDF Document
            </button>
            <button onClick={() => addCustomPage('text')} className="w-full text-left text-xs text-gray-500 hover:text-blue-600 px-2 py-1.5 rounded hover:bg-blue-50 flex items-center gap-2">
              <span>📝</span> Text Page
            </button>
          </div>

          <div className="mt-3 pt-3 border-t border-gray-100">
            <Link href="/estimates/products" className="w-full text-left text-xs text-gray-500 hover:text-blue-600 px-2 py-1.5 rounded hover:bg-blue-50 flex items-center gap-2">
              <span>🛠️</span> Manage Products
            </Link>
          </div>
        </div>

        <div className="p-3 border-t border-gray-100">
          <Link href={`/estimates/${estimateId}/preview`} target="_blank" className="w-full block text-center text-xs bg-gray-900 text-white px-3 py-2 rounded-lg hover:bg-gray-700">
            Preview / Print PDF
          </Link>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <input value={estimateName} onChange={e => setEstimateName(e.target.value.toUpperCase())} className="text-lg font-bold text-gray-900 border-none bg-transparent focus:outline-none focus:bg-gray-50 rounded px-1" />
          <div className="flex items-center gap-3">
            {saved && <span className="text-xs text-green-600 font-medium">✓ Saved</span>}
            <button onClick={save} disabled={saving} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>

        <div className="max-w-3xl mx-auto p-6 space-y-8">

          {/* ── COVER PAGE ── */}
          <section id="section-cover" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center gap-2">
              <span>🏠</span><h2 className="font-semibold text-gray-800">Cover Page</h2>
              <span className="ml-auto text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">Always on</span>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Estimate Name</label>
                  <input value={estimateName} onChange={e => setEstimateName(e.target.value.toUpperCase())} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Date</label>
                  <input type="date" value={estimateDate} onChange={e => setEstimateDate(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                </div>
              </div>

              {/* Searchable lead selector */}
              <div className="border border-blue-100 bg-blue-50 rounded-lg p-3">
                <label className="text-xs font-medium text-blue-700 mb-2 block">Auto-fill from existing lead</label>
                <div ref={leadSearchRef} className="relative">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={leadSearch}
                      onChange={e => { setLeadSearch(e.target.value); setLeadDropOpen(true); if (!e.target.value) setLeadId('') }}
                      onFocus={() => setLeadDropOpen(true)}
                      placeholder="Search lead by name..."
                      className="flex-1 text-sm border border-blue-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 bg-white"
                    />
                    {leadId && (
                      <button onClick={clearLead} className="text-xs text-gray-400 hover:text-red-500 px-2">✕ Clear</button>
                    )}
                  </div>
                  {leadDropOpen && (
                    <div className="absolute top-full left-0 right-0 z-30 bg-white border border-gray-200 rounded-lg shadow-xl mt-1 max-h-56 overflow-y-auto">
                      {filteredLeads.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-gray-400">No leads found</div>
                      ) : filteredLeads.map(l => (
                        <button key={l.id} onMouseDown={() => selectLead(l)} className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-none flex items-center justify-between">
                          <span className="font-medium text-gray-800">{l.first_name} {l.last_name}</span>
                          <span className="text-xs text-gray-400">{l.email || l.phone || ''}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-blue-500 mt-1.5">Client info will auto-fill but can still be edited below.</p>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Client Information</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-gray-500 mb-1 block">First Name</label><input value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" /></div>
                  <div><label className="text-xs text-gray-500 mb-1 block">Last Name</label><input value={lastName} onChange={e => setLastName(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" /></div>
                  <div><label className="text-xs text-gray-500 mb-1 block">Email</label><input value={email} onChange={e => setEmail(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" /></div>
                  <div><label className="text-xs text-gray-500 mb-1 block">Phone</label><input value={phone} onChange={e => setPhone(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" /></div>
                  <div className="col-span-2"><label className="text-xs text-gray-500 mb-1 block">Address</label><input value={address} onChange={e => setAddress(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" /></div>
                  <div><label className="text-xs text-gray-500 mb-1 block">City</label><input value={city} onChange={e => setCity(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-xs text-gray-500 mb-1 block">State</label><input value={state} onChange={e => setState_(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" /></div>
                    <div><label className="text-xs text-gray-500 mb-1 block">Zip</label><input value={zip} onChange={e => setZip(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" /></div>
                  </div>
                </div>
              </div>

              {/* Property photo */}
              <div className="border-t border-gray-100 pt-4">
                <label className="text-xs text-gray-500 mb-2 block">Property Photo</label>
                <div className="flex gap-3 items-start">
                  <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-lg p-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                    <span className="text-2xl mb-1">📷</span>
                    <span className="text-xs text-gray-500">{uploadingCover ? 'Uploading...' : 'Click to upload'}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadCoverPhoto(e.target.files[0])} />
                  </label>
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 mb-1 block">Or paste URL</label>
                    <input value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} placeholder="https://..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                  </div>
                </div>
                {photoUrl && <img src={photoUrl} alt="Property" className="mt-3 w-full h-48 object-cover rounded-lg" onError={e => (e.currentTarget.style.display='none')} />}
              </div>

              {/* Cert badge upload */}
              <div className="border-t border-gray-100 pt-4">
                <label className="text-xs text-gray-500 mb-2 block">Certification Badge (GAF, etc.)</label>
                <div className="flex gap-3 items-center">
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-lg p-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors w-32">
                    <span className="text-xl mb-1">🏅</span>
                    <span className="text-[10px] text-gray-400 text-center">{uploadingBadge ? 'Uploading...' : certBadgeUrl ? 'Replace badge' : 'Upload badge'}</span>
                    <input type="file" accept="image/*,.png,.jpg,.svg" className="hidden" onChange={e => e.target.files?.[0] && uploadCertBadge(e.target.files[0])} />
                  </label>
                  {certBadgeUrl ? (
                    <div className="flex items-center gap-3">
                      <img src={certBadgeUrl} alt="Badge" className="w-20 h-20 object-contain rounded border border-gray-100" />
                      <div>
                        <p className="text-xs text-green-600 font-medium">✓ Badge uploaded</p>
                        <p className="text-xs text-gray-400 mt-0.5">Shows on cover page</p>
                        <button onClick={() => setCertBadgeUrl('')} className="text-xs text-red-400 hover:underline mt-1">Remove</button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">No badge uploaded. The default GAF text badge will show on the cover page.</p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ── INSPECTION PHOTOS ── */}
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
                      <img src={photo.photo_url} alt="" className="w-full h-40 object-cover" onError={e => (e.currentTarget.style.display='none')} />
                      <div className="p-2">
                        <input value={photo.caption} placeholder="Caption (optional)" onChange={e => setPhotos(prev => { const n=[...prev]; n[i]={...n[i],caption:e.target.value}; return n })} className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none" />
                      </div>
                      <button onClick={() => removePhoto(i)} className="absolute top-1.5 right-1.5 bg-red-500 text-white w-5 h-5 rounded-full text-xs flex items-center justify-center">×</button>
                    </div>
                  ))}
                </div>
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-lg p-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                  <span className="text-3xl mb-2">🖼️</span>
                  <span className="text-sm text-gray-600 font-medium">{uploadingPhoto ? 'Uploading...' : 'Upload photos'}</span>
                  <span className="text-xs text-gray-400 mt-1">Select one or multiple images at once</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={e => e.target.files && uploadInspectionPhotos(e.target.files)} />
                </label>
              </div>
            </section>
          )}

          {/* ── ESTIMATE DETAILS ── */}
          <section id="section-details" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center gap-2">
              <span>📋</span><h2 className="font-semibold text-gray-800">Estimate Details</h2>
              <span className="ml-auto text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">Always on</span>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-5">
                {options.map((opt, i) => (
                  <button key={i} onClick={() => setActiveOption(i)} className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${activeOption === i ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>{opt.option_label}</button>
                ))}
                <button onClick={addOption} className="px-3 py-1.5 text-xs text-gray-500 border border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:text-blue-600">+ Option</button>
              </div>

              {options[activeOption] && (
                <div>
                  {options[activeOption].items.map((item, itemIdx) => (
                    <div key={itemIdx} className={`mb-4 p-3 rounded-lg border relative ${item.is_exclusion ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200'}`}>
                      <div className="flex items-start gap-2 mb-2">
                        {/* Product name with autocomplete */}
                        <div className="relative flex-1">
                          <label className="text-[10px] text-gray-400 mb-0.5 block uppercase tracking-wide">Product / Service</label>
                          <input
                            value={item.section_name}
                            onChange={e => handleProductSearch(activeOption, itemIdx, e.target.value)}
                            onFocus={() => { if (item.section_name.length >= 2) { const m = products.filter(p => p.name.toLowerCase().includes(item.section_name.toLowerCase())); setProductSuggestions(m.slice(0,6)); setActiveSuggestionFor(`${activeOption}-${itemIdx}`) }}}
                            onBlur={() => setTimeout(() => setActiveSuggestionFor(null), 200)}
                            placeholder="Type to search products..."
                            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none bg-white focus:border-blue-400"
                          />
                          {activeSuggestionFor === `${activeOption}-${itemIdx}` && productSuggestions.length > 0 && (
                            <div className="absolute top-full left-0 right-0 z-20 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 overflow-hidden">
                              {productSuggestions.map(p => (
                                <button key={p.id} onMouseDown={() => applyProduct(activeOption, itemIdx, p)} className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-none">
                                  <div className="font-medium text-gray-800">{p.name}</div>
                                  <div className="text-xs text-gray-400 truncate">{p.description?.slice(0,80)}</div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Qty + Price */}
                        <div className="w-16">
                          <label className="text-[10px] text-gray-400 mb-0.5 block uppercase tracking-wide">Qty</label>
                          <input type="number" value={item.qty} min="1"
                            onChange={e => updateItem(activeOption, itemIdx, 'qty', parseFloat(e.target.value)||1)}
                            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none bg-white text-right" />
                        </div>
                        <div className="w-28">
                          <label className="text-[10px] text-gray-400 mb-0.5 block uppercase tracking-wide">Unit Price</label>
                          <input type="number" value={item.unit_price} placeholder="0.00" min="0"
                            onChange={e => updateItem(activeOption, itemIdx, 'unit_price', e.target.value)}
                            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none bg-white text-right" />
                        </div>
                        <div className="w-24 pt-5 text-right">
                          <span className="text-sm font-semibold text-gray-800">{fmt((parseFloat(String(item.qty))||0) * (parseFloat(String(item.unit_price))||0))}</span>
                        </div>
                        <div className="pt-5">
                          <button onClick={() => removeItem(activeOption, itemIdx)} className="text-red-400 hover:text-red-600 text-xl leading-none">×</button>
                        </div>
                      </div>

                      {/* Description — full width, tall textarea */}
                      <div>
                        <label className="text-[10px] text-gray-400 mb-0.5 block uppercase tracking-wide">Description</label>
                        <textarea
                          value={item.description}
                          onChange={e => updateItem(activeOption, itemIdx, 'description', e.target.value)}
                          rows={4}
                          placeholder="Full description of work scope, materials, and any exclusions..."
                          className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none resize-y bg-white focus:border-blue-400 leading-relaxed"
                        />
                      </div>

                      <label className="flex items-center gap-1.5 mt-1 cursor-pointer">
                        <input type="checkbox" checked={item.is_exclusion} onChange={e => updateItem(activeOption, itemIdx, 'is_exclusion', e.target.checked)} className="w-3 h-3" />
                        <span className="text-xs text-gray-400">Mark as exclusion</span>
                      </label>
                    </div>
                  ))}

                  <button onClick={() => addLineItem(activeOption)} className="text-xs text-blue-600 hover:underline">+ Add Line Item</button>

                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex justify-between text-sm mb-1"><span className="text-gray-500">Estimate subtotal</span><span className="font-medium">{fmt(optionTotal(activeOption))}</span></div>
                    <div className="flex justify-between text-base font-bold"><span>Total</span><span className="text-blue-700">{fmt(optionTotal(activeOption))}</span></div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <label className="text-xs text-gray-500 mb-1 block">Notes</label>
                    <textarea value={notes} rows={3} onChange={e => setNotes(e.target.value)} placeholder="Add any notes for the client..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none" />
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ── DOCUMENT ATTACHMENTS ── */}
          {showDocs && (
            <section id="section-docs" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center gap-2">
                <span>📎</span><h2 className="font-semibold text-gray-800">Document Attachments</h2>
                <span className="ml-auto text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Toggleable</span>
              </div>
              <div className="p-5">
                <p className="text-xs text-gray-500 mb-4">Toggle documents to include. Click Replace PDF to update any outdated file.</p>
                <div className="space-y-3">
                  {docTemplates.map(t => (
                    <div key={t.id} className={`p-3 rounded-lg border transition-colors ${t.is_enabled ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{t.category === 'certification' ? '🏅' : '📄'}</span>
                          <div>
                            <div className="text-sm font-medium text-gray-800">{t.name}</div>
                            <div className="text-xs text-gray-400">{t.description}</div>
                          </div>
                        </div>
                        <button onClick={() => toggleDoc(t.id)} className={`w-10 h-5 rounded-full transition-colors shrink-0 ${t.is_enabled ? 'bg-blue-600' : 'bg-gray-200'}`}>
                          <div className={`w-4 h-4 bg-white rounded-full mx-auto transition-transform ${t.is_enabled ? 'translate-x-2.5' : '-translate-x-2.5'}`} />
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        {t.file_url && <a href={t.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">View PDF</a>}
                        <label className="text-xs text-gray-400 hover:text-blue-600 cursor-pointer border border-dashed border-gray-200 hover:border-blue-400 rounded px-2 py-1 transition-colors">
                          {uploadingDoc === t.id ? 'Uploading...' : '↑ Replace PDF'}
                          <input type="file" accept=".pdf" className="hidden" onChange={e => e.target.files?.[0] && uploadDocFile(t.id, e.target.files[0])} />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ── FINANCING ── */}
          {showFinancing && (
            <section id="section-financing" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center gap-2">
                <span>💰</span><h2 className="font-semibold text-gray-800">Financing Options</h2>
                <span className="ml-auto text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Toggleable</span>
              </div>
              <div className="p-5">
                <p className="text-xs text-gray-500 mb-4">Select financing partners to show. Informational only.</p>
                <div className="grid grid-cols-2 gap-4">
                  <div onClick={() => setFinSunlight(v => !v)} className={`flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-colors ${finSunlight ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white text-sm font-bold">S</div>
                        <div className="font-semibold text-gray-800 text-sm">Sunlight Financial</div>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 ${finSunlight ? 'bg-orange-500 border-orange-500' : 'border-gray-300'}`}>
                        {finSunlight && <div className="w-2 h-2 bg-white rounded-full m-auto mt-0.5" />}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">Flexible solar & home improvement financing</div>
                    <div className="mt-2 text-xs text-orange-600 font-medium">In-person or via our team</div>
                  </div>
                  <div onClick={() => setFinUpgrade(v => !v)} className={`flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-colors ${finUpgrade ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white text-sm font-bold">U</div>
                        <div className="font-semibold text-gray-800 text-sm">Upgrade Finance</div>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 ${finUpgrade ? 'bg-green-600 border-green-600' : 'border-gray-300'}`}>
                        {finUpgrade && <div className="w-2 h-2 bg-white rounded-full m-auto mt-0.5" />}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">7.99%–12.99% | 0% for 12 months option</div>
                    <a href="https://upgrade.com/h/sOOQuFJCUS" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="mt-2 text-xs text-green-700 font-medium hover:underline">Apply online →</a>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ── TERMS & CONDITIONS ── */}
          {showTc && (
            <section id="section-tc" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center gap-2">
                <span>📄</span><h2 className="font-semibold text-gray-800">Terms & Conditions</h2>
                <span className="ml-auto text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Toggleable</span>
              </div>
              <div className="p-5">
                <p className="text-xs text-gray-500 mb-3">Upload a T&C PDF per state or client type.</p>
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-lg p-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors mb-3">
                  <span className="text-3xl mb-2">📋</span>
                  <span className="text-sm text-gray-600 font-medium">{uploadingTc ? 'Uploading...' : tcFileUrl ? 'Replace T&C PDF' : 'Upload T&C PDF'}</span>
                  <span className="text-xs text-gray-400 mt-1">Different T&C per state (NJ, NY, CT, etc.)</span>
                  <input type="file" accept=".pdf" className="hidden" onChange={e => e.target.files?.[0] && uploadTcPdf(e.target.files[0])} />
                </label>
                {tcFileUrl ? (
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <span>✅</span>
                    <span className="text-xs text-green-700 font-medium">T&C PDF uploaded</span>
                    <a href={tcFileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline ml-auto">View PDF</a>
                    <button onClick={() => setTcFileUrl('')} className="text-xs text-red-400 hover:underline">Remove</button>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 border border-gray-200">
                    No PDF uploaded — default Elite Work T&C text will show in the preview.
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── SIGNING PAGE ── */}
          <section id="section-signing" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center gap-2">
              <span>✍️</span><h2 className="font-semibold text-gray-800">Signing Page</h2>
              <span className="ml-auto text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">Always on</span>
            </div>
            <div className="p-5">
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <p className="text-xs text-gray-500 mb-2">Auto-generated in preview. Includes:</p>
                <ul className="text-xs text-gray-500 space-y-1">
                  {options.map((opt, i) => <li key={i}>✓ {opt.option_label}: {fmt(optionTotal(i))}</li>)}
                  <li>✓ Client name & address</li>
                  {finSunlight && <li>✓ Sunlight Financial</li>}
                  {finUpgrade  && <li>✓ Upgrade Finance (with apply link)</li>}
                  <li>✓ Signature line + 3-day cancellation notice</li>
                </ul>
              </div>
            </div>
          </section>

          {/* ── CUSTOM PAGES ── */}
          {customPages.map((cp, i) => (
            <section key={i} id={`section-custom-${i}`} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center gap-2">
                <span>{cp.type === 'pdf' ? '📎' : '📝'}</span>
                <input value={cp.title} onChange={e => setCustomPages(prev => { const n=[...prev]; n[i]={...n[i],title:e.target.value}; return n })} className="font-semibold text-gray-800 bg-transparent border-none focus:outline-none focus:bg-gray-100 rounded px-1 flex-1" />
                <span className="ml-auto text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">Custom</span>
              </div>
              <div className="p-5">
                {cp.type === 'pdf' ? (
                  <div>
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-lg p-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                      <span className="text-3xl mb-2">📎</span>
                      <span className="text-sm text-gray-600">{cp.file_url ? 'Replace PDF' : 'Upload PDF'}</span>
                      <input type="file" accept=".pdf" className="hidden" onChange={async e => {
                        if (!e.target.files?.[0]) return
                        const file = e.target.files[0]
                        const path = `${estimateId}/custom-${i}-${Date.now()}.pdf`
                        const { error } = await supabase.storage.from('estimate-uploads').upload(path, file)
                        if (!error) {
                          const { data: { publicUrl } } = supabase.storage.from('estimate-uploads').getPublicUrl(path)
                          setCustomPages(prev => { const n=[...prev]; n[i]={...n[i],file_url:publicUrl}; return n })
                        }
                      }} />
                    </label>
                    {cp.file_url && <a href={cp.file_url} target="_blank" rel="noopener noreferrer" className="mt-2 block text-xs text-blue-600 hover:underline">View uploaded PDF</a>}
                  </div>
                ) : (
                  <textarea value={cp.content} onChange={e => setCustomPages(prev => { const n=[...prev]; n[i]={...n[i],content:e.target.value}; return n })} rows={8} placeholder="Type your custom page content here..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none" />
                )}
              </div>
            </section>
          ))}

          <div className="flex justify-end pb-8">
            <button onClick={save} disabled={saving} className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 font-medium disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Estimate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}