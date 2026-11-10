import { useState } from 'react'
import type { ClientEvent, DetailView, ACPResult } from '../../types'
import { array, bool, dict, str } from '../../lib/coerce'
import { evidenceDetail, parseEvidenceList, type EvidenceData } from '../../lib/evidence'
import { clock } from '../../lib/format'

interface ActionData {
  id: string
  label: string
  kind: string
  needsNote: boolean
}

interface InsightData {
  id: string
  ref: string
  claim: string
  confidence: string
  evidence: EvidenceData[]
  counter: EvidenceData[]
  actions: ActionData[]
}

const CONFIDENCE: Record<string, string> = { high: '高', medium: '中', low: '低' }

export function parseInsights(payload: unknown): {
  title?: string
  note?: string
  insights: InsightData[]
} | null {
  const data = dict(payload)
  const insights = array(data.insights)
    .map((raw, index) => {
      const insight = dict(raw)
      const claim = str(insight.claim)
      if (!claim) return null
      const actions = array(insight.actions)
        .map((item) => {
          const action = dict(item)
          const id = str(action.id)
          if (!id) return null
          return {
            id,
            label: str(action.label, id),
            kind: str(action.kind, id),
            needsNote: bool(action.needsNote),
          }
        })
        .filter((item): item is ActionData => item !== null)
      return {
        id: str(insight.id, `i-${index}`),
        ref: str(insight.ref, `I-${String(index + 1).padStart(2, '0')}`),
        claim,
        confidence: str(insight.confidence, 'medium'),
        evidence: parseEvidenceList(insight.evidence),
        counter: parseEvidenceList(insight.counterEvidence),
        actions,
      }
    })
    .filter((item): item is InsightData => item !== null)

  if (insights.length === 0) return null
  return {
    title: str(data.title) || undefined,
    note: str(data.note) || undefined,
    insights,
  }
}

interface CardProps {
  resultId: string
  insight: InsightData
  dispatch: (event: ClientEvent) => void
  onInspect: (detail: DetailView) => void
}

function InsightCard({ resultId, insight, dispatch, onInspect }: CardProps) {
  const [open, setOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')
  const [decision, setDecision] = useState<'accept' | 'reject' | null>(null)
  const [followed, setFollowed] = useState(false)

  const send = (action: ActionData, extraNote?: string) => {
    dispatch({
      kind: 'action',
      resultId,
      itemId: insight.id,
      actionId: action.id,
      actionLabel: action.label,
      kindOf: action.kind,
      note: extraNote?.trim() || undefined,
    })
  }

  const runAction = (action: ActionData) => {
    if (action.kind === 'accept') {
      send(action)
      setDecision('accept')
      return
    }
    if (action.kind === 'reject') {
      if (action.needsNote && !noteOpen) {
        setNoteOpen(true)
        return
      }
      send(action, note)
      setDecision('reject')
      setNoteOpen(false)
      return
    }
    send(action, note)
    setFollowed(true)
  }

  const counter = insight.counter

  return (
    <article className={decision ? 'insight insight--decided' : 'insight'} data-decision={decision ?? 'none'}>
      <header className="insight__head">
        <span className="insight__ref mono">{insight.ref}</span>
        <span className="confidence" data-level={insight.confidence}>
          置信 {CONFIDENCE[insight.confidence] ?? insight.confidence}
        </span>
        {decision && (
          <span className="stamp" data-kind={decision}>
            {decision === 'accept' ? '已通过' : '已驳回'}
          </span>
        )}
      </header>

      <p className="insight__claim">{insight.claim}</p>

      <div className="insight__refs">
        <span className="insight__refs-label">证据</span>
        {[...insight.evidence, ...counter].map((item) => (
          <button
            key={item.id}
            type="button"
            className="trace-tag"
            onClick={() => onInspect(evidenceDetail(item))}
            title={item.title}
          >
            {item.ref || item.title}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="insight__toggle"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>
          支撑证据 {insight.evidence.length} 条
          {counter.length > 0 ? ` · 反向 ${counter.length} 条` : ''}
        </span>
        <span className="insight__toggle-action">{open ? '收起' : '展开'}</span>
      </button>

      {open && (
        <div className="insight__evidence">
          {[...insight.evidence, ...counter].map((item, index) => {
            const isCounter = index >= insight.evidence.length
            return (
              <button
                key={`${item.id}-${index}`}
                type="button"
                className="ev-mini"
                data-counter={isCounter || undefined}
                onClick={() => onInspect(evidenceDetail(item))}
              >
                <span className="ev-mini__ref mono">{item.ref}</span>
                <span className="ev-mini__body">
                  <span className="ev-mini__title">
                    {isCounter && <span className="ev-mini__flag">反向</span>}
                    {item.title}
                  </span>
                  <span className="ev-mini__meta mono">
                    {item.domain} · {clock(item.capturedAt)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {noteOpen && !decision && (
        <div className="insight__note">
          <label className="field-label" htmlFor={`note-${insight.id}`}>
            批注内容会随驳回一起回传 ACP
          </label>
          <textarea
            id={`note-${insight.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
          />
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                const reject = insight.actions.find((action) => action.kind === 'reject')
                if (reject) runAction(reject)
              }}
            >
              提交批注
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setNoteOpen(false)}>
              取消
            </button>
          </div>
        </div>
      )}

      {decision ? (
        <p className="insight__settled">
          {decision === 'accept'
            ? '已通过，这条结论可以进入报告。'
            : `已驳回${note.trim() ? `：${note.trim()}` : '，未附批注'}。`}
          <span className="mono"> · 已回传 ACP</span>
        </p>
      ) : (
        <footer className="insight__actions">
          {insight.actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={
                action.kind === 'accept'
                  ? 'btn btn--primary'
                  : action.kind === 'reject'
                    ? 'btn'
                    : 'btn btn--ghost'
              }
              onClick={() => runAction(action)}
              disabled={action.kind === 'followup' && followed}
            >
              {action.kind === 'followup' && followed ? '已追加' : action.label}
            </button>
          ))}
        </footer>
      )}
    </article>
  )
}

interface Props {
  result: ACPResult
  dispatch: (event: ClientEvent) => void
  onInspect: (detail: DetailView) => void
}

export function InsightsRenderer({ result, dispatch, onInspect }: Props) {
  const data = parseInsights(result.payload)
  if (!data) return null

  return (
    <section className="insights">
      <header className="insights__head">
        <h3 className="block-title">{data.title ?? '洞察'}</h3>
        <span className="mono groups__count">{data.insights.length} 条</span>
      </header>
      {data.note && <p className="block-note">{data.note}</p>}
      <div className="insights__list">
        {data.insights.map((insight) => (
          <InsightCard
            key={insight.id}
            resultId={result.id}
            insight={insight}
            dispatch={dispatch}
            onInspect={onInspect}
          />
        ))}
      </div>
    </section>
  )
}
