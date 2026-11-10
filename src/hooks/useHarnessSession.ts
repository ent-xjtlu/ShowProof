import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ClientEvent,
  DetailView,
  ACPEvent,
  ACPResult,
  StreamItem,
  StreamStatus,
  Turn,
} from '../types'
import { harnessAdapter } from '../lib/harness'
import { nowIso, uid } from '../lib/format'

function upsertResult(items: StreamItem[], result: ACPResult): StreamItem[] {
  const index = items.findIndex((item) => item.kind === 'result' && item.result?.id === result.id)
  if (index === -1) {
    return [...items, { id: `r-${result.id}`, kind: 'result', at: result.createdAt, result }]
  }
  const next = items.slice()
  next[index] = { ...next[index], result, at: result.createdAt }
  return next
}

export function useACPSession() {
  const [items, setItems] = useState<StreamItem[]>([])
  const [status, setStatus] = useState<StreamStatus>('idle')
  const [turns, setTurns] = useState<Turn[]>([])
  const [activeTurn, setActiveTurn] = useState<string | null>(null)
  const [detail, setDetail] = useState<DetailView | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const lastText = useRef('')

  useEffect(() => {
    const unsubscribe = harnessAdapter.subscribe((event: ACPEvent) => {
      if (event.kind === 'status') {
        setStatus(event.status)
        return
      }
      if (event.kind === 'error') {
        setStatus('error')
        const detailText = event.detail ? `　${event.detail}` : ''
        setItems((prev) => [
          ...prev,
          {
            id: uid('notice'),
            kind: 'notice',
            at: nowIso(),
            text: `${event.message}${detailText}`,
            level: 'error',
            retryText: lastText.current,
          },
        ])
        return
      }
      setItems((prev) => upsertResult(prev, event.result))
    })
    return unsubscribe
  }, [])

  const dispatch = useCallback((event: ClientEvent) => {
    try {
      harnessAdapter.send(event)
    } catch (error) {
      const reason = error instanceof Error && error.message ? `：${error.message}` : ''
      setStatus('error')
      setItems((prev) => [
        ...prev,
        {
          id: uid('notice'),
          kind: 'notice',
          at: nowIso(),
          text: `这个操作没有送达 ACP${reason}`,
          level: 'error',
        },
      ])
    }
  }, [])

  const send = useCallback((raw: string) => {
    const text = raw.trim()
    if (!text) return
    lastText.current = text
    const turnId = uid('turn')
    const at = nowIso()
    setTurns((prev) => [...prev, { id: turnId, text, at }])
    setActiveTurn(turnId)
    setItems((prev) => [...prev, { id: turnId, kind: 'user', at, text }])
    setStatus('working')
    try {
      harnessAdapter.send({ kind: 'message', text })
    } catch (error) {
      const reason = error instanceof Error && error.message ? `：${error.message}` : ''
      setStatus('error')
      setItems((prev) => [
        ...prev,
        {
          id: uid('notice'),
          kind: 'notice',
          at: nowIso(),
          text: `输入没有送达 ACP${reason}`,
          level: 'error',
          retryText: text,
        },
      ])
    }
  }, [])

  const retry = useCallback(() => {
    if (lastText.current) send(lastText.current)
  }, [send])

  const reset = useCallback(() => {
    harnessAdapter.reset?.()
    setItems([])
    setTurns([])
    setActiveTurn(null)
    setDetail(null)
    setDetailOpen(false)
    setStatus('idle')
    lastText.current = ''
  }, [])

  const loadHistory = useCallback(async () => {
    if (!harnessAdapter.loadHistory) return
    try {
      const history = await harnessAdapter.loadHistory()
      setItems((previous) => {
        const existing = new Set(previous.filter((item) => item.kind === 'user').map((item) => item.id))
        const restored = history.map((item) => ({ id: item.id, kind: 'user' as const, at: item.createdAt, text: item.query })).filter((item) => !existing.has(item.id))
        return [...restored, ...previous]
      })
      setTurns(history.map((item) => ({ id: item.id, text: item.query, at: item.createdAt })).reverse())
      setActiveTurn(history[0]?.id || null)
      setStatus('idle')
    } catch {
      // The login screen remains usable when history cannot be restored.
    }
  }, [])

  const jump = useCallback((id: string) => {
    setActiveTurn(id)
    document.getElementById(`entry-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  return {
    items,
    status,
    turns,
    activeTurn,
    detail,
    detailOpen,
    send,
    dispatch,
    retry,
    reset,
    loadHistory,
    jump,
    inspect: useCallback((view: DetailView) => {
      setDetail(view)
      setDetailOpen(true)
    }, []),
    toggleDetail: () => setDetailOpen((value) => !value),
    closeDetail: () => setDetailOpen(false),
  }
}

export const useHarnessSession = useACPSession
