'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function NewEstimatePage() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function create() {
      const { data } = await supabase
        .from('estimates')
        .insert({ estimate_name: 'NEW ESTIMATE', status: 'Draft' })
        .select()
        .single()
      if (data) {
        await supabase.from('estimate_options').insert({
          estimate_id: data.id, option_num: 1, option_label: 'Option 1', sort_order: 0
        })
        router.replace(`/estimates/${data.id}`)
      }
    }
    create()
  }, [])

  return <div className="flex items-center justify-center h-64 text-gray-400">Creating estimate...</div>
}