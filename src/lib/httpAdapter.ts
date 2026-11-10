import type { ClientEvent, HarnessAdapter, HarnessEvent, HarnessResult, HistoryItem, TraceItem } from '../types'

type Source = {
  id: string
  title: string
  url: string
  type: string
  capturedAt: string
  excerpt: string
  status: 'verified' | 'pending' | 'failed'
}

type Insight = {
  id: string
  title: string
  body: string
  confidence: number
  evidenceIds: string[]
  review: 'pending' | 'accepted' | 'rejected'
  reason?: string
}

type Activity = {
  id: string
  label: string
  detail?: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  at: string
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  text: string
  at: string
  status?: 'streaming' | 'completed' | 'failed'
}

type Research = {
  id: string
  query: string
  title: string
  subjectType: 'event' | 'company' | 'question'
  status: 'queued' | 'running' | 'completed' | 'failed'
  error?: string
  createdAt: string
  updatedAt: string
  sources: Source[]
  insights: Insight[]
  activities: Activity[]
  messages: ChatMessage[]
}

type ApiError = { message?: string; error?: string }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('domel_token')
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

function traceFromActivities(activities: Activity[]): TraceItem[] {
  return activities.map((activity) => ({
    label: activity.label,
    detail: activity.detail,
    at: activity.at,
  }))
}

function statusToStep(status: Activity['status']): 'done' | 'running' | 'pending' | 'error' {
  if (status === 'completed') return 'done'
  if (status === 'failed') return 'error'
  if (status === 'running') return 'running'
  return 'pending'
}

function sourceToEvidence(source: Source, index: number) {
  const domain = (() => {
    try {
      return new URL(source.url).hostname.replace(/^www\./, '')
    } catch {
      return source.type || '来源'
    }
  })()
  return {
    id: source.id,
    ref: source.id || `S-${String(index + 1).padStart(2, '0')}`,
    title: source.title || domain,
    summary: source.excerpt?.slice(0, 120) || source.title || domain,
    domain,
    url: source.url,
    capturedAt: source.capturedAt,
    excerpt: source.excerpt,
    tags: [source.status === 'verified' ? '已核验' : source.status],
  }
}

function confidenceLabel(value: number): 'high' | 'medium' | 'low' {
  if (value >= 0.75) return 'high'
  if (value >= 0.5) return 'medium'
  return 'low'
}

function finalAssistantText(research: Research): string {
  return [...research.messages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.status === 'completed' && message.text.trim())?.text
    .trim() || ''
}

function reportPayload(research: Research, finalText: string) {
  const accepted = research.insights.filter((insight) => insight.review === 'accepted')
  const blocks: Array<{ type: string; text?: string; items?: string[] }> = []
  if (finalText) blocks.push({ type: 'p', text: finalText })
  if (accepted.length) {
    blocks.push({ type: 'h2', text: '已接受洞察' })
    for (const insight of accepted) blocks.push({ type: 'p', text: insight.body || insight.title })
  }
  if (!blocks.length) return null
  return {
    title: `${research.title} · 报告草稿`,
    subtitle: `研究问题：${research.query}`,
    editable: false,
    blocks,
    citations: research.sources.map((source, index) => {
      const evidence = sourceToEvidence(source, index)
      return {
        ref: evidence.ref,
        label: evidence.title,
        title: evidence.title,
        domain: evidence.domain,
        url: evidence.url,
        excerpt: evidence.excerpt,
        capturedAt: evidence.capturedAt,
      }
    }),
  }
}

export class HttpHarnessAdapter implements HarnessAdapter {
  readonly name = 'local-acp-service'
  private listeners = new Set<(event: HarnessEvent) => void>()
  private timers = new Map<string, number>()
  private active = new Set<string>()

  subscribe(listener: (event: HarnessEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async loadHistory(): Promise<HistoryItem[]> {
    const researches = await request<Research[]>('/api/research')
    for (const research of [...researches].reverse()) this.emitSnapshot(research)
    return researches.map((research) => ({ id: research.id, query: research.query, createdAt: research.createdAt, updatedAt: research.updatedAt, status: research.status }))
  }

  reset(): void {
    for (const timer of this.timers.values()) window.clearInterval(timer)
    this.timers.clear()
    this.active.clear()
  }

  send(event: ClientEvent): void {
    if (event.kind === 'message') {
      void this.createResearch(event.text)
      return
    }
    if (event.kind === 'action') {
      void this.handleAction(event)
      return
    }
    if (event.kind === 'confirm') {
      this.emit({ kind: 'status', status: 'idle', note: '已记录你的选择。' })
      return
    }
    if (event.kind === 'answer') {
      this.emit({ kind: 'status', status: 'idle', note: '已提交回答。' })
    }
  }

  private emit(event: HarnessEvent): void {
    for (const listener of this.listeners) listener(event)
  }

  private updateStatus(): void {
    this.emit({ kind: 'status', status: this.active.size ? 'working' : 'idle' })
  }

  private async createResearch(query: string): Promise<void> {
    try {
      this.emit({ kind: 'status', status: 'working' })
      const research = await request<Research>('/api/research', {
        method: 'POST',
        body: JSON.stringify({ query }),
      })
      this.emitSnapshot(research)
      this.startPolling(research.id)
    } catch (error) {
      this.emit({ kind: 'status', status: 'error' })
      this.emit({ kind: 'error', message: error instanceof Error ? error.message : '研究任务创建失败', retryable: true })
    }
  }

  private startPolling(researchId: string): void {
    if (this.timers.has(researchId)) return
    this.active.add(researchId)
    const tick = async () => {
      try {
        const research = await request<Research>(`/api/research/${researchId}`)
        this.emitSnapshot(research)
        if (research.status === 'completed' || research.status === 'failed') this.stopPolling(researchId)
      } catch (error) {
        this.emit({ kind: 'error', message: error instanceof Error ? error.message : '研究状态获取失败', retryable: true })
        this.stopPolling(researchId)
      }
    }
    void tick()
    const timer = window.setInterval(() => void tick(), 1600)
    this.timers.set(researchId, timer)
    this.updateStatus()
  }

  private stopPolling(researchId: string): void {
    const timer = this.timers.get(researchId)
    if (timer !== undefined) window.clearInterval(timer)
    this.timers.delete(researchId)
    this.active.delete(researchId)
    this.updateStatus()
  }

  private async handleAction(event: Extract<ClientEvent, { kind: 'action' }>): Promise<void> {
    const researchId = event.resultId.split(':')[1]
    if (!researchId) return
    try {
      if (event.kindOf === 'accept' || event.kindOf === 'reject') {
        const research = await request<Research>(`/api/research/${researchId}/insights/${event.itemId}/review`, {
          method: 'POST',
          body: JSON.stringify({ review: event.kindOf === 'accept' ? 'accepted' : 'rejected', reason: event.note }),
        })
        this.emitSnapshot(research)
        return
      }
      if (event.kindOf === 'followup') {
        const query = event.note?.trim() || event.actionLabel
        const research = await request<Research>(`/api/research/${researchId}/followup`, {
          method: 'POST',
          body: JSON.stringify({ query }),
        })
        this.emitSnapshot(research)
        this.startPolling(research.id)
      }
    } catch (error) {
      this.emit({ kind: 'status', status: 'error' })
      this.emit({ kind: 'error', message: error instanceof Error ? error.message : '操作未送达服务端', retryable: true })
    }
  }

  private emitSnapshot(research: Research): void {
    const trace = traceFromActivities(research.activities)
    const steps: HarnessResult = {
      id: `steps:${research.id}`,
      type: 'steps',
      createdAt: research.updatedAt || research.createdAt,
      meta: { trace, source: '本地 ACP 服务' },
      payload: {
        title: '执行过程',
        note: research.status === 'failed' ? research.error : `任务状态：${research.status === 'completed' ? '已完成' : '处理中'}`,
        steps: research.activities.map((activity) => ({
          id: activity.id,
          label: activity.label,
          detail: activity.detail,
          status: statusToStep(activity.status),
          meta: activity.at,
        })),
      },
    }
    this.emit({ kind: 'result', result: steps })

    if (research.sources.length) {
      this.emit({
        kind: 'result',
        result: {
          id: `groups:${research.id}`,
          type: 'groups',
          createdAt: research.updatedAt || research.createdAt,
          meta: { trace, batch: research.id, source: '本地 ACP 服务' },
          payload: {
            title: '采集结果',
            note: `${research.sources.length} 条来源已保存，可点击查看原文摘录。`,
            groups: [{ id: 'sources', label: '来源与证据', items: research.sources.map(sourceToEvidence) }],
          },
        },
      })
    }

    if (research.insights.length) {
      const sourceById = new Map(research.sources.map((source, index) => [source.id, sourceToEvidence(source, index)]))
      this.emit({
        kind: 'result',
        result: {
          id: `insights:${research.id}`,
          type: 'insights',
          createdAt: research.updatedAt || research.createdAt,
          meta: { trace, source: '本地 ACP 服务' },
          payload: {
            title: '洞察审核',
            note: '审核状态会同步回服务端；通过的结论才会进入报告。',
            insights: research.insights.map((insight, index) => ({
              id: insight.id,
              ref: `I-${String(index + 1).padStart(2, '0')}`,
              claim: insight.body || insight.title,
              confidence: confidenceLabel(insight.confidence),
              evidence: insight.evidenceIds.map((id) => sourceById.get(id)).filter(Boolean),
              actions: insight.review === 'pending' ? [
                { id: 'accept', label: '通过', kind: 'accept' },
                { id: 'reject', label: '驳回', kind: 'reject', needsNote: true },
              ] : [],
            })),
          },
        },
      })
    }

    const finalText = finalAssistantText(research)
    if (finalText) {
      this.emit({
        kind: 'result',
        result: {
          id: `markdown:${research.id}`,
          type: 'markdown',
          createdAt: research.updatedAt || research.createdAt,
          meta: { trace, source: 'Agent 回复' },
          payload: finalText,
        },
      })
    }

    if (research.status === 'completed' && research.insights.some((insight) => insight.review === 'accepted')) {
      const payload = reportPayload(research, finalText)
      if (payload) {
        this.emit({
          kind: 'result',
          result: {
            id: `report:${research.id}`,
            type: 'report',
            createdAt: research.updatedAt || research.createdAt,
            meta: { trace, source: '已接受洞察' },
            payload,
          },
        })
      }
    }

    if (research.status === 'failed') {
      this.emit({
        kind: 'result',
        result: {
          id: `error:${research.id}`,
          type: 'error',
          createdAt: research.updatedAt || research.createdAt,
          payload: { message: research.error || '研究任务失败', retryable: true },
        },
      })
    }
  }
}

