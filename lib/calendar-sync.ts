// Call this after saving an appointment on a lead to mirror it to the connected Google
// Calendar (info@eliteworkhomeimprovement.com). One-way only: ComCenter -> Google -- so an
// appointment only ever needs to be typed once. Runs silently in the background and never
// blocks the UI or surfaces an error to the user, same pattern as lib/jn-sync.ts.

export async function pushAppointmentToGoogle(leadId: string): Promise<void> {
  try {
    const res = await fetch('/api/calendar/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      console.warn('[Calendar Sync] Push failed:', data.error)
    }
  } catch (err) {
    console.warn('[Calendar Sync] Error:', err)
  }
}
