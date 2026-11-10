import type { ChatSession } from '../domain'
import { TOKEN_KEY } from './workspaceApi'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(path, { ...options, headers })
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = payload as { message?: string; error?: string }
    throw new Error(error.message || error.error || `请求失败（${response.status}）`)
  }
  return payload as T
}

export const chatApi = {
  list: () => request<ChatSession[]>('/api/chats'),
  create: () => request<{ chat: ChatSession }>('/api/chats', { method: 'POST' }),
  get: (id: string) => request<{ chat: ChatSession }>(`/api/chats/${id}`),
  send: (id: string, text: string) => request<{ chat: ChatSession }>(`/api/chats/${id}/messages`, { method: 'POST', body: JSON.stringify({ text }) }),
  cancel: (id: string) => request<{ chat: ChatSession }>(`/api/chats/${id}/cancel`, { method: 'POST' }),
  remove: (id: string) => request<null>(`/api/chats/${id}`, { method: 'DELETE' }),
}
