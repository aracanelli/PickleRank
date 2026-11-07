import { useAuthStore } from '@/stores/auth'

export interface ImportResult {
  eventsCreated: number
  gamesImported: number
}

/** Turn a failed import/template response into a sentence an organizer can act on. */
export function importErrorMessage(status: number, detail: unknown, fallback: string): string {
  if (status === 404 || status === 405) return 'History import isn\'t available on this server. Ask whoever runs PickleRank to turn it on.'
  if (status === 401) return 'Sign in again, then retry.'
  if (status === 403) return 'Only league organizers can import history.'
  if (typeof detail === 'string' && detail.trim()) return detail
  // FastAPI validation errors arrive as [{ msg }]
  if (Array.isArray(detail) && detail.length && typeof detail[0]?.msg === 'string') return detail.map(d => d.msg).join(' ')
  return fallback
}

// Raw fetch: the shared api client only sends JSON, and these endpoints use CSV and multipart.
async function request(path: string, init: RequestInit, fallback: string): Promise<Response> {
  const token = await useAuthStore().getToken()
  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}${path}`, {
    ...init,
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(importErrorMessage(res.status, body?.detail ?? body?.message, fallback))
  }
  return res
}

export async function downloadTemplate(groupId: string): Promise<void> {
  const res = await request(`/api/groups/${groupId}/history/import/template`, {}, 'Template didn\'t download. Try again.')
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = 'history_import_template.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function importHistory(groupId: string, file: File): Promise<ImportResult> {
  const body = new FormData()
  body.append('file', file)
  const res = await request(`/api/groups/${groupId}/history/import`, { method: 'POST', body }, 'Import failed. Check the file matches the template and try again.')
  return res.json()
}
