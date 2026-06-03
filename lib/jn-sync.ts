// Call this anywhere in the app to push a lead to JobNimbus
// Runs silently in the background — won't block the UI

export async function pushLeadToJN(leadId: string): Promise<void> {
  try {
    const res = await fetch('/api/jn/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId }),
    })

    if (!res.ok) {
      const data = await res.json()
      console.warn('[JN Sync] Push failed:', data.error)
      return
    }

    const data = await res.json()
    console.log(`[JN Sync] ${data.action} contact ${data.jn_contact_id}`)
  } catch (err) {
    // Silent fail — JN sync should never break the main app
    console.warn('[JN Sync] Error:', err)
  }
}