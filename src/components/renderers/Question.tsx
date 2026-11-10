import { useState } from 'react'
import type { ClientEvent, ACPResult } from '../../types'
import { array, dict, str } from '../../lib/coerce'

interface Option {
  value: string
  label: string
}

interface Field {
  id: string
  label: string
  type: 'choice' | 'text'
  options: Option[]
}

export function parseQuestion(payload: unknown): {
  question: string
  rationale?: string
  fields: Field[]
  actions: Array<{ id: string; label: string }>
} | null {
  const data = dict(payload)
  const question = str(data.question)
  if (!question) return null
  const fields = array(data.fields)
    .map((raw, index) => {
      const field = dict(raw)
      const id = str(field.id, `field-${index}`)
      const options = array(field.options)
        .map((item) => {
          const option = dict(item)
          const value = str(option.value)
          return value ? { value, label: str(option.label, value) } : null
        })
        .filter((item): item is Option => item !== null)
      const type = str(field.type) === 'choice' && options.length > 0 ? 'choice' : 'text'
      return {
        id,
        label: str(field.label, id),
        type,
        options,
      } as Field
    })
    .filter((field) => field.type === 'text' || field.options.length > 0)

  const actions = array(data.actions)
    .map((raw) => {
      const action = dict(raw)
      const id = str(action.id)
      return id ? { id, label: str(action.label, '提交') } : null
    })
    .filter((item): item is { id: string; label: string } => item !== null)

  return {
    question,
    rationale: str(data.rationale) || undefined,
    fields,
    actions: actions.length > 0 ? actions : [{ id: 'submit', label: '提交' }],
  }
}

interface Props {
  result: ACPResult
  dispatch: (event: ClientEvent) => void
}

export function QuestionRenderer({ result, dispatch }: Props) {
  const data = parseQuestion(result.payload)
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)

  if (!data) return null

  const required = data.fields.find((field) => field.type === 'choice')
  const ready = !required || Boolean(values[required.id])

  const submit = () => {
    if (!ready || submitted) return
    setSubmitted(true)
    dispatch({ kind: 'answer', resultId: result.id, values })
  }

  const answered = data.fields
    .map((field) => {
      const value = values[field.id]
      if (!value) return null
      if (field.type === 'choice') {
        const option = field.options.find((item) => item.value === value)
        return `${field.label}：${option?.label ?? value}`
      }
      return `${field.label}：${value}`
    })
    .filter((line): line is string => Boolean(line))

  return (
    <section className="question" data-submitted={submitted || undefined}>
      <header className="question__head">
        <span className="question__flag">需要你确认</span>
        <span className="question__rule" aria-hidden />
        <span className="mono question__hint">提问卡片</span>
      </header>

      <p className="question__text">{data.question}</p>
      {data.rationale && <p className="question__why">{data.rationale}</p>}

      {submitted ? (
        <div className="question__answered">
          <p className="question__answered-title">已提交</p>
          <ul>
            {answered.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mono question__answered-meta">回答已回传 ACP，后续结果会追加在下方。</p>
        </div>
      ) : (
        <>
          <div className="question__fields">
            {data.fields.map((field) => (
              <div className="field" key={field.id}>
                <span className="field-label">{field.label}</span>
                {field.type === 'choice' ? (
                  <div className="choice-row">
                    {field.options.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className="choice"
                        aria-pressed={values[field.id] === option.value}
                        onClick={() =>
                          setValues((prev) => ({ ...prev, [field.id]: option.value }))
                        }
                      >
                        <span className="choice__mark" aria-hidden />
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={values[field.id] ?? ''}
                    onChange={(event) =>
                      setValues((prev) => ({ ...prev, [field.id]: event.target.value }))
                    }
                  />
                )}
              </div>
            ))}
          </div>

          <footer className="question__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={submit}
              disabled={!ready}
            >
              {data.actions[0].label}
            </button>
            {!ready && <span className="question__need">选择一个选项后提交</span>}
          </footer>
        </>
      )}
    </section>
  )
}
