'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Upload, Loader2, CheckCircle2, User } from 'lucide-react'

interface Profile {
  id: string
  full_name: string
  email: string
  company_name: string | null
  logo_url: string | null
  role: string
}

export default function EditProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, company_name, logo_url, role')
        .eq('id', user.id)
        .single()

      if (error) {
        console.error('Error loading profile:', error)
        return
      }

      setProfile(data)
      setFullName(data.full_name || '')
      setCompanyName(data.company_name || '')
      setLogoUrl(data.logo_url || null)
    }

    loadProfile()
  }, [])

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !profile) return

    const maxSize = 2 * 1024 * 1024 // 2MB
    if (file.size > maxSize) {
      setError('Logo must be under 2MB.')
      return
    }

    setUploading(true)
    setError(null)

    const ext = file.name.split('.').pop()
    const filePath = `logos/${profile.id}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('company-assets')
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      setError('Failed to upload logo. Make sure the storage bucket exists.')
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('company-assets')
      .getPublicUrl(filePath)

    setLogoUrl(urlData.publicUrl)
    setUploading(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setError(null)

    try {
      const res = await fetch('/api/profile/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          company_name: companyName.trim(),
          logo_url: logoUrl,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Save failed')
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-gray-400" size={28} />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Edit Profile</h1>
        <p className="text-sm text-gray-400 mt-1">Update your name, company, and branding.</p>
      </div>

      <div className="bg-[#111827] border border-white/10 rounded-xl p-6 space-y-6">

        {/* Logo Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-3">Company Logo</label>
          <div className="flex items-center gap-5">
            <div
              className="w-20 h-20 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center overflow-hidden cursor-pointer hover:border-orange-500/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Company logo"
                  className="w-full h-full object-contain"
                />
              ) : (
                <User size={28} className="text-gray-500" />
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Upload size={14} />
                )}
                {uploading ? 'Uploading...' : 'Upload Logo'}
              </button>
              <p className="text-xs text-gray-500 mt-1.5">PNG or JPG · Max 2MB</p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              onChange={handleLogoUpload}
              className="hidden"
            />
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/10" />

        {/* Full Name */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Full Name
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your full name"
            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-orange-500/60 transition-colors"
          />
        </div>

        {/* Company Name */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Company Name
          </label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. Elite Work Home Improvement"
            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-orange-500/60 transition-colors"
          />
        </div>

        {/* Email (read-only) */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Email <span className="text-gray-500 font-normal">(read-only)</span>
          </label>
          <input
            type="email"
            value={profile.email || ''}
            readOnly
            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-gray-400 text-sm cursor-not-allowed"
          />
        </div>

        {/* Role (read-only) */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Role <span className="text-gray-500 font-normal">(read-only)</span>
          </label>
          <div className="inline-flex items-center px-3 py-1.5 rounded-md bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-medium capitalize">
            {profile.role}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {/* Save Button */}
        <div className="flex items-center gap-4 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || uploading}
            className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : saved ? (
              <CheckCircle2 size={14} />
            ) : null}
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
          </button>

          {saved && (
            <span className="text-sm text-green-400 flex items-center gap-1.5">
              <CheckCircle2 size={14} />
              Profile updated successfully
            </span>
          )}
        </div>
      </div>
    </div>
  )
}