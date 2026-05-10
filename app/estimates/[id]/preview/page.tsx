'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import Link from 'next/link'

export default function EstimatePreviewPage() {
  const params = useParams()
  const estimateId = params.id as string
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [estimate, setEstimate] = useState<any>(null)
  const [options, setOptions] = useState<any[]>([])
  const [photos, setPhotos] = useState<any[]>([])
  const [attachments, setAttachments] = useState<any[]>([])

  useEffect(() => { loadAll() }, [estimateId])

  async function loadAll() {
    setLoading(true)
    const [estRes, optsRes, photosRes, attachRes] = await Promise.all([
      supabase.from('estimates').select('*').eq('id', estimateId).single(),
      supabase.from('estimate_options').select('*').eq('estimate_id', estimateId).order('sort_order'),
      supabase.from('estimate_photos').select('*').eq('estimate_id', estimateId).order('sort_order'),
      supabase.from('estimate_attachments')
        .select('*, template:estimate_document_templates(*)')
        .eq('estimate_id', estimateId)
        .eq('is_enabled', true)
        .order('sort_order'),
    ])
    if (estRes.data) setEstimate(estRes.data)
    if (photosRes.data) setPhotos(photosRes.data)
    if (attachRes.data) setAttachments(attachRes.data)
    if (optsRes.data) {
      const optsWithItems = await Promise.all(
        optsRes.data.map(async (opt) => {
          const { data: items } = await supabase
            .from('estimate_line_items').select('*').eq('option_id', opt.id).order('sort_order')
          return { ...opt, items: items || [] }
        })
      )
      setOptions(optsWithItems)
    }
    setLoading(false)
  }

  const fmtCurrency = (n: number) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtDate = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase() : ''

  function optionTotal(opt: any) {
    return (opt.items || []).filter((i: any) => !i.is_exclusion).reduce((s: number, i: any) => s + (i.qty * i.unit_price), 0)
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading preview...</div>
  if (!estimate) return <div className="p-8 text-gray-400">Estimate not found.</div>

  const clientName = `${estimate.client_first_name || ''} ${estimate.client_last_name || ''}`.trim()
  const clientAddr = [estimate.client_address, estimate.client_city, `${estimate.client_state || ''} ${estimate.client_zip || ''}`.trim()].filter(Boolean).join(', ')

  return (
    <>
      <div className="no-print fixed top-4 right-4 z-50 flex gap-2">
        <Link href={`/estimates/${estimateId}`}
          className="bg-gray-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-600">← Edit</Link>
        <button onClick={() => window.print()}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700">🖨️ Print / Save PDF</button>
      </div>

      <style>{`
        @media print { .no-print { display: none !important; } body { margin: 0; } .page-break { page-break-after: always; } .avoid-break { page-break-inside: avoid; } }
        @page { margin: 0.75in; size: letter; }
        body { font-family: Arial, Helvetica, sans-serif; }
        .elite-blue { color: #1e3a6e; }
        .elite-bg { background-color: #1e3a6e; }
      `}</style>

      <div className="max-w-[800px] mx-auto bg-white text-gray-900 py-8 px-4">

        <div className="page-break">
          <div className="elite-bg flex justify-between items-center px-6 py-4 mb-6">
            <div>
              <div className="text-white font-bold text-lg tracking-wide">ESTIMATE</div>
              <div className="text-blue-200 text-sm">{fmtDate(estimate.estimate_date)}</div>
            </div>
            <div className="text-right">
              <div className="text-white font-bold text-xl tracking-wider">ELITE WORK</div>
              <div className="text-blue-200 text-xs">HOME IMPROVEMENT</div>
            </div>
          </div>
          {estimate.property_photo_url && (
            <div className="mb-6">
              <img src={estimate.property_photo_url} alt="Property" className="w-full h-72 object-cover rounded-lg" />
            </div>
          )}
          <div className="flex justify-between items-end mb-6">
            <div>
              {clientName && <div className="text-2xl font-bold elite-blue mb-1">{clientName.toUpperCase()}</div>}
              {estimate.client_email && <div className="text-gray-600 text-sm">{estimate.client_email}</div>}
              {clientAddr && <div className="text-gray-600 text-sm">{clientAddr}</div>}
            </div>
            <div className="text-center">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center border-4 border-blue-800 text-center p-2">
                <div className="text-[10px] font-bold text-blue-900 leading-tight">GAF<br/>CERTIFIED<br/>PLUS™<br/>RESIDENTIAL</div>
              </div>
            </div>
          </div>
          <div className="elite-bg px-6 py-3 flex justify-end">
            <div className="text-right">
              <div className="text-white text-xs font-bold">info@eliteworkhomeimprovement.com</div>
              <div className="text-blue-200 text-xs">201-699-7959</div>
            </div>
          </div>
        </div>

        {estimate.show_inspection && photos.length > 0 && (
          <div className="page-break mt-8">
            <div className="elite-blue font-bold text-xl mb-4 pb-2 border-b-2 border-blue-800">INSPECTION</div>
            <div className="grid grid-cols-2 gap-4">
              {photos.map((p, i) => (
                <div key={i} className="avoid-break">
                  <img src={p.photo_url} alt={p.caption || ''} className="w-full h-52 object-cover rounded" />
                  {p.caption && <div className="text-xs text-gray-500 mt-1">{p.caption}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {options.map((opt, optIdx) => (
          <div key={optIdx} className="page-break mt-8">
            <div className="elite-blue font-bold text-xl mb-4 pb-2 border-b-2 border-blue-800">{opt.option_label.toUpperCase()}</div>
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="border-b-2 border-gray-300">
                  <th className="text-left py-2 text-xs font-bold text-gray-600 uppercase">Description</th>
                  <th className="text-center py-2 text-xs font-bold text-gray-600 uppercase w-16">Qty</th>
                  <th className="text-right py-2 text-xs font-bold text-gray-600 uppercase w-28">Unit Price</th>
                  <th className="text-right py-2 text-xs font-bold text-gray-600 uppercase w-28">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const sections = [...new Set(opt.items.map((i: any) => i.section_name))]
                  return sections.map((section: any) => {
                    const sectionItems = opt.items.filter((i: any) => i.section_name === section && !i.is_exclusion)
                    const exclusions   = opt.items.filter((i: any) => i.section_name === section && i.is_exclusion)
                    const sectionTotal = sectionItems.reduce((s: number, i: any) => s + (i.qty * i.unit_price), 0)
                    return (
                      <tr key={section} className="border-b border-gray-100 avoid-break">
                        <td className="py-3 pr-4 align-top">
                          <div className="font-semibold text-gray-800 mb-1">{section}</div>
                          <div className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">
                            {sectionItems.map((i: any) => i.description).join('\n')}
                          </div>
                          {exclusions.length > 0 && (
                            <div className="mt-2">
                              <div className="text-xs font-semibold text-gray-500">Exclusions</div>
                              <div className="text-xs text-gray-400">{exclusions.map((i: any) => i.description).join('\n')}</div>
                            </div>
                          )}
                        </td>
                        <td className="py-3 text-center text-sm align-top">{sectionItems.length === 1 ? sectionItems[0].qty : ''}</td>
                        <td className="py-3 text-right text-sm align-top">{sectionItems.length === 1 ? fmtCurrency(sectionItems[0].unit_price) : ''}</td>
                        <td className="py-3 text-right text-sm font-medium align-top">{sectionTotal > 0 ? fmtCurrency(sectionTotal) : ''}</td>
                      </tr>
                    )
                  })
                })()}
              </tbody>
            </table>
            <div className="ml-auto w-64">
              <div className="flex justify-between text-sm py-1 border-b border-gray-200">
                <span className="text-gray-500">Estimate subtotal</span><span>{fmtCurrency(optionTotal(opt))}</span>
              </div>
              <div className="flex justify-between text-base font-bold py-2">
                <span>Total</span><span className="elite-blue">{fmtCurrency(optionTotal(opt))}</span>
              </div>
            </div>
            {estimate.show_financing && (estimate.financing_sunlight || estimate.financing_upgrade) && (
              <div className="mt-4 border border-gray-200 rounded-lg p-3 flex items-center gap-4">
                {estimate.financing_sunlight && <span className="text-orange-500 font-bold text-sm">☀️ Sunlight Financial — Flexible financing available</span>}
                {estimate.financing_upgrade  && <span className="text-blue-600 font-bold text-sm">⚡ Upgrade — Home improvement loans</span>}
              </div>
            )}
            {estimate.notes && <div className="mt-4 text-xs text-gray-500 border-t border-gray-100 pt-3">{estimate.notes}</div>}
          </div>
        ))}

        {estimate.show_tc && (
          <div className="page-break mt-8">
            <div className="elite-blue font-bold text-xl mb-4 pb-2 border-b-2 border-blue-800">TERMS & CONDITIONS</div>
            <div className="text-xs text-gray-700 leading-relaxed space-y-3">
              <p>This Agreement is entered into between <strong>Elite Work Home Improvement LLC</strong> ("Contractor") and the Owner.</p>
              <p><strong>1. Project Description</strong><br />The Contractor shall furnish all labor, materials, equipment, and services necessary to complete the project.</p>
              <p><strong>2. Work Timeline</strong><br />Work begins within ten (10) business days after contract execution.</p>
              <p><strong>3. Compensation Terms</strong><br />One-Third (1/3) due upon signing. Remaining balance due upon completion. Late balances accrue 1.5% monthly.</p>
              <p><strong>4. Modifications to Work</strong><br />Changes must be documented in writing and approved via a formal Change Order.</p>
              <p><strong>5. Guarantees & Warranties</strong><br />Contractor warrants labor as specified. Excludes sealants, coatings, and cosmetic finishes.</p>
              <p><strong>6. Insurance</strong><br />Contractor carries General Liability and Workers' Compensation Insurance.</p>
              <p><strong>7. Cancellation Rights (NJ Law)</strong><br />Owner may cancel within 3 business days. Refunds issued within 30 days.</p>
              <p><strong>8. Resolution of Disputes</strong><br />Disputes resolved through negotiation, then mediation, then binding arbitration under NJ law.</p>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-300">
              <p className="text-xs text-gray-500">I acknowledge that I have read and understand this page. <strong>Initials:</strong> _____________</p>
            </div>
          </div>
        )}

        <div className="mt-8">
          <div className="elite-blue font-bold text-xl mb-4 pb-2 border-b-2 border-blue-800">SIGNING & UPGRADES</div>
          {options.map((opt, i) => (
            <div key={i} className="flex justify-between items-center mb-2 p-3 bg-gray-50 rounded border border-gray-200">
              <span className="font-semibold">{opt.option_label}</span>
              <div className="font-bold text-lg elite-blue">{fmtCurrency(optionTotal(opt))}</div>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-4 mt-4 mb-4">
            <div><div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Name</div><div className="font-semibold">{clientName || '—'}</div></div>
            <div><div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Address</div><div className="text-sm">{clientAddr || '—'}</div></div>
          </div>
          <div className="bg-gray-100 rounded p-3 text-xs text-gray-600 mb-4 font-medium">
            Estimates valid for 30 days / A 30% deposit is required before any project begins
          </div>
          {estimate.show_financing && (estimate.financing_sunlight || estimate.financing_upgrade) && (
            <div className="flex gap-6 mb-6 justify-center">
              {estimate.financing_sunlight && (
                <div className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg">
                  <span className="text-orange-500 text-lg">☀️</span>
                  <div><div className="font-bold text-sm">Sunlight Financial</div><div className="text-xs text-gray-400">Financing available</div></div>
                </div>
              )}
              {estimate.financing_upgrade && (
                <div className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg">
                  <span className="text-blue-500 text-lg">⚡</span>
                  <div><div className="font-bold text-sm">Upgrade Finance</div><div className="text-xs text-gray-400">Financing available</div></div>
                </div>
              )}
            </div>
          )}
          <div className="mt-8 pt-4 border-t border-gray-300">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <div className="text-sm font-semibold mb-6">{clientName || 'Client Name'}:</div>
                <div className="border-b-2 border-gray-800 mb-1" style={{ height: '32px' }} />
                <div className="text-xs text-gray-400">Signature</div>
              </div>
              <div>
                <div className="text-sm font-semibold mb-6">Date:</div>
                <div className="border-b-2 border-gray-800 mb-1" style={{ height: '32px' }} />
                <div className="text-xs text-gray-400">Date</div>
              </div>
            </div>
            <div className="mt-4 text-xs text-gray-500">
              If you cancel this contract within the three day period, you are entitled to a full refund. Refunds must be made within 30 days of the contractor's receipt of the cancellation notice.
            </div>
          </div>
        </div>

        {estimate.show_attachments && attachments.length > 0 && (
          <div className="mt-8 pt-4 border-t border-gray-200 no-print">
            <div className="text-sm font-semibold text-gray-600 mb-2">📎 Attached Documents:</div>
            <ul className="text-xs text-gray-500 space-y-1">
              {attachments.map((a, i) => <li key={i}>• {a.template?.name}</li>)}
            </ul>
          </div>
        )}

      </div>
    </>
  )
}