import { useState } from 'react'
import type { ClientEvent, ACPResult } from '../../types'
import { array, dict, str } from '../../lib/coerce'

type StepStatus = 'done' | 'running' | 'pending' | 'needs_confirm' | 'error'

const STATUS_TEXT: Record<StepStatus, string> = {
  done: '完成',
  running: '进行中',
  pending: '待执行',
  needs_confirm: '需确认',
  error: '失败',
}

interface StepData {
  id: string
  label: string
  status: StepStatus
  meta?: string
  detail?: string
}

const normalizeStatus = (value: unknown): StepStatus => {
  const status = str(value)
  if (status === 'done' || status === 'running' || status === 'error') return status
  if (status === 'needs_confirm' || status === 'needs-confirm' || status === 'confirm') {
    return 'needs_confirm'
  }
  return 'pending'
}

export function parseSteps(payload: unknown): {
  title?: string
  note?: string
  steps: StepData[]
} | null {
  const data = dict(payload)
  const steps = array(data.steps).map((raw, index) => {
    const step = dict(raw)
    return {
      id: str(step.id, `step-${index}`),
      label: str(step.label, '未命名步骤'),
      status: normalizeStatus(step.status),
      meta: str(step.meta) || undefined,
      detail: str(step.detail) || undefined,
    }
  })
  if (steps.length === 0) return null
  return { title: str(data.title) || undefined, note: str(data.note) || undefined, steps }
}

interface Props {
  result: ACPResult
  dispatch: (event: ClientEvent) => void
}

export function StepsRenderer({ result, dispatch }: Props) {
  const data = parseSteps(result.payload)
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const step of data?.steps ?? []) {
      if (step.status === 'needs_confirm' || step.status === 'error') initial[step.id] = true
    }
    return initial
  })
  const [decided, setDecided] = useState<Record<string, 'confirm' | 'skip'>>({})

  if (!data) return null

  const toggle = (id: string) => setOpen((prev) => ({ ...prev, [id]: !prev[id] }))

  const decide = (stepId: string, decision: 'confirm' | 'skip') => {
    setDecided((prev) => ({ ...prev, [stepId]: decision }))
    dispatch({ kind: 'confirm', resultId: result.id, stepId, decision })
  }

  return (
    <section className="steps">
      {data.title && <h3 className="block-title">{data.title}</h3>}
      {data.note && <p className="block-note">{data.note}</p>}
      <ol className="steps__list">
        {data.steps.map((step, index) => {
          const decision = decided[step.id]
          const status: StepStatus = decision
            ? decision === 'confirm'
              ? 'done'
              : 'pending'
            : step.status
          const isOpen = open[step.id] ?? false
          return (
            <li className="step" key={step.id} data-status={status}>
              <button
                type="button"
                className="step__head"
                onClick={() => toggle(step.id)}
                aria-expanded={isOpen}
              >
                <span className="step__idx">{String(index + 1).padStart(2, '0')}</span>
                <span className="status" data-status={status}>
                  <i className="status__mark" aria-hidden />
                  {STATUS_TEXT[status]}
                </span>
                <span className="step__label">{step.label}</span>
                {step.meta && <span className="step__meta">{step.meta}</span>}
                <span className="step__plus" data-open={isOpen} aria-hidden>
                  +
                </span>
              </button>

              {isOpen && (step.detail || step.status === 'needs_confirm') && (
                <div className="step__body">
                  {step.detail && <p>{step.detail}</p>}
                  {decision && (
                    <p className="step__decision">
                      {decision === 'confirm' ? '已确认，ACP 继续执行。' : '已跳过这一步。'}
                    </p>
                  )}
                  {step.status === 'needs_confirm' && !decision && (
                    <div className="step__actions">
                      <p className="step__ask">需要你决定后，ACP 才会继续。</p>
                      <div className="btn-row">
                        <button
                          type="button"
                          className="btn btn--primary"
                          onClick={() => decide(step.id, 'confirm')}
                        >
                          确认继续
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => decide(step.id, 'skip')}
                        >
                          跳过这一步
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
