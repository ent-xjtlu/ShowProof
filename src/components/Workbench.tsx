import { useEffect, useRef, useState } from 'react'
import type { ClientEvent, DetailView, StreamItem, StreamStatus } from '../types'
import { sessionStats } from '../lib/stats'
import { Entry } from './Entry'
import { EmptyState, Waiting } from './EmptyState'

interface Props {
  items: StreamItem[]
  status: StreamStatus
  dispatch: (event: ClientEvent) => void
  onInspect: (detail: DetailView) => void
  onRetry: () => void
}

export function Workbench({ items, status, dispatch, onInspect, onRetry }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const [stuck, setStuck] = useState(true)
  const stats = sessionStats(items)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const last = items[items.length - 1]
    if (last?.kind === 'user') stickRef.current = true
    if (stickRef.current) el.scrollTop = el.scrollHeight
  }, [items.length, status])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 96
    stickRef.current = near
    setStuck(near)
  }

  const jumpToLatest = () => {
    const el = scrollRef.current
    if (!el) return
    stickRef.current = true
    setStuck(true)
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  return (
    <main className="workbench">
      <header className="workbench__head">
        <div className="workbench__title">
          <h1>研究记录</h1>
          <span className="workbench__sub">按 ACP 返回顺序追加，不覆盖已有结果</span>
        </div>
        <div className="workbench__stats mono">
          <span>证据 {stats.evidence}</span>
          <span className="workbench__sep" aria-hidden />
          <span>洞察 {stats.insights}</span>
          <span className="workbench__sep" aria-hidden />
          <span>报告 {stats.reports}</span>
        </div>
      </header>

      <div className="workbench__scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="stream" aria-live="polite">
          {items.length === 0 && <EmptyState />}
          {items.map((item, index) => (
            <Entry
              key={item.id}
              item={item}
              index={index}
              dispatch={dispatch}
              onInspect={onInspect}
              onRetry={onRetry}
            />
          ))}
          <Waiting status={status} />
        </div>
      </div>

      {!stuck && items.length > 0 && (
        <button type="button" className="jump-latest" onClick={jumpToLatest}>
          回到最新
          <span aria-hidden>↓</span>
        </button>
      )}
    </main>
  )
}
