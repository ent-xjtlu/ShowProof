import type { ChatSession } from '../domain'
import { TOKEN_KEY } from './workspaceApi'

export type WorkspaceFile = { path: string; name: string; size: number; updatedAt: string; downloadUrl: string; pdfUrl?: string }
export type ApprovalItem = { id: string; companies: string[]; status: string; createdAt: string }
export type GlobalFile = WorkspaceFile & { chatId: string; chatTitle: string }

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
  files: (id: string) => request<{ files: WorkspaceFile[] }>(`/api/chats/${id}/files`),
  allFiles: () => request<{ files: GlobalFile[]; chatCount: number; totalBytes: number }>('/api/files'),
  approvals: (id: string) => request<{ approvals: ApprovalItem[] }>(`/api/chats/${id}/approvals`),
  decide: (id: string, decision: 'approve' | 'reject') => request<{ approval: ApprovalItem }>(`/api/approvals/${id}/decide`, { method: 'POST', body: JSON.stringify({ decision }) }),
}
