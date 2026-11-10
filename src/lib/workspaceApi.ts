import type { CompanyProfile, Discovery, Exhibition } from '../domain'

export const TOKEN_KEY = 'domel_token'

type ApiError = { message?: string; error?: string }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(path, { ...options, headers })
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = payload as ApiError
    throw new Error(error.message || error.error || `请求失败（${response.status}）`)
  }
  return payload as T
}

export interface CompanyInput {
  name: string
  website?: string
  description: string
  products: string[]
  customers: string[]
  industry: string
  targetMarkets: string[]
  filters: CompanyProfile['filters']
  cost: CompanyProfile['cost']
}

export const workspaceApi = {
  getCompany: () => request<{ profile: CompanyProfile | null }>('/api/company'),
  saveCompany: (input: CompanyInput) => request<{ profile: CompanyProfile }>('/api/company', { method: 'PUT', body: JSON.stringify(input) }),
  listDiscoveries: () => request<Discovery[]>('/api/discoveries'),
  createDiscovery: () => request<{ discovery: Discovery }>('/api/discoveries', { method: 'POST' }),
  getDiscovery: (id: string) => request<{ discovery: Discovery; exhibitions: Exhibition[] }>(`/api/discoveries/${id}`),
  cancelDiscovery: (id: string) => request<{ discovery: Discovery }>(`/api/discoveries/${id}/cancel`, { method: 'POST' }),
  listExhibitions: () => request<Exhibition[]>('/api/exhibitions'),
  getExhibition: (id: string) => request<{ exhibition: Exhibition }>(`/api/exhibitions/${id}`),
  researchExhibition: (id: string) => request<{ exhibition: Exhibition }>(`/api/exhibitions/${id}/research`, { method: 'POST' }),
  refreshExhibition: (id: string) => request<{ exhibition: Exhibition }>(`/api/exhibitions/${id}/refresh`, { method: 'POST' }),
  watchExhibition: (id: string, watched: boolean) => request<{ exhibition: Exhibition }>(`/api/exhibitions/${id}/watch`, { method: 'POST', body: JSON.stringify({ watched }) }),
  verifyExhibitor: (exhibitionId: string, exhibitorId: string) => request<{ ok: boolean; message: string }>(`/api/exhibitions/${exhibitionId}/exhibitors/${exhibitorId}/verify`, { method: 'POST' }),
}

export async function downloadReport(exhibition: Exhibition, kind: 'md' | 'pdf' | 'csv'): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY)
  const response = await fetch(`/api/exhibitions/${exhibition.id}/report.${kind}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({} as ApiError))
    throw new Error(payload.message || payload.error || '导出失败')
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${exhibition.name.replace(/[\\/:*?"<>|]/g, '-')}.${kind}`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
