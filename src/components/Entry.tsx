import type { ClientEvent, DetailView, ACPResult, StreamItem } from '../types'
import { clock } from '../lib/format'
import { str } from '../lib/coerce'
import { StepsRenderer, parseSteps } from './renderers/Steps'
import { GroupsRenderer, parseGroups } from './renderers/Groups'
import { InsightsRenderer, parseInsights } from './renderers/Insights'
import { QuestionRenderer, parseQuestion } from './renderers/Question'
import { ReportRenderer, parseReport } from './renderers/Report'
import { TextRenderer } from './renderers/Text'
import { ErrorRenderer } from './renderers/Error'

const TYPE_LABEL: Record<string, string> = {
  steps: '执行过程',
  groups: '采集结果',
  insights: '洞察',
  question: '需要你确认',
  report: '报告草稿',
  markdown: '文本回复',
  error: '错误',
}

function renderable(result: ACPResult): boolean {
  switch (result.type) {
    case 'steps':
      return parseSteps(result.payload) !== null
    case 'groups':
      return parseGroups(result.payload) !== null
    case 'insights':
      return parseInsights(result.payload) !== null
    case 'question':
      return parseQuestion(result.payload) !== null
    case 'report':
      return parseReport(result.payload) !== null
    case 'markdown':
    case 'error':
      return true
    default:
      return false
  }
}

interface Props {
  item: StreamItem
  index: number
  dispatch: (event: ClientEvent) => void
  onInspect: (detail: DetailView) => void
  onRetry: () => void
}

export function Entry({ item, index, dispatch, onInspect, onRetry }: Props) {
  const serial = String(index + 1).padStart(2, '0')
  const id = `entry-${item.id}`

  if (item.kind === 'user') {
    return (
      <article className="entry entry--user" id={id}>
        <div className="entry__rail">
          <span className="entry__idx mono">{serial}</span>
        </div>
        <div className="entry__body">
          <div className="entry__label">
            <span className="entry__kind">你的输入</span>
            <span className="entry__clock mono">{clock(item.at, true)}</span>
            <span className="entry__rule" aria-hidden />
          </div>
          <p className="entry__input">{item.text}</p>
        </div>
      </article>
    )
  }

  if (item.kind === 'notice') {
    return (
      <article className="entry entry--notice" id={id}>
        <div className="entry__rail">
          <span className="entry__idx mono">{serial}</span>
        </div>
        <div className="entry__body">
          <div className="notice" data-level={item.level ?? 'info'} role="status">
            <p className="notice__text">{item.text}</p>
            {item.retryText && (
              <button type="button" className="btn btn--ghost" onClick={onRetry}>
                重试
              </button>
            )}
          </div>
        </div>
      </article>
    )
  }

  const result = item.result
  if (!result) return null

  const trace = result.meta?.trace
  const label = TYPE_LABEL[result.type] ?? `结果 · ${result.type}`
  const known = renderable(result)

  return (
    <article className="entry" id={id} data-type={result.type}>
      <div className="entry__rail">
        <span className="entry__idx mono">{serial}</span>
      </div>
      <div className="entry__body">
        <div className="entry__label">
          <span className="entry__kind">{label}</span>
          <span className="entry__clock mono">{clock(result.createdAt, true)}</span>
          <span className="entry__rule" aria-hidden />
          {trace && trace.length > 0 && (
            <button
              type="button"
              className="entry__trace"
              onClick={() =>
                onInspect({
                  id: `trace-${result.id}`,
                  eyebrow: 'ACP 溯源',
                  title: str(result.meta?.source) || '工具调用与步骤',
                  trace,
                })
              }
            >
              溯源 {trace.length}
            </button>
          )}
        </div>

        {!known && (
          <p className="entry__unknown">
            这个结果类型（{result.type}）暂时没有对应渲染器，已按原始内容显示。
          </p>
        )}

        {!known && <TextRenderer payload={result.payload} />}
        {known && result.type === 'steps' && (
          <StepsRenderer result={result} dispatch={dispatch} />
        )}
        {known && result.type === 'groups' && (
          <GroupsRenderer result={result} onInspect={onInspect} />
        )}
        {known && result.type === 'insights' && (
          <InsightsRenderer result={result} dispatch={dispatch} onInspect={onInspect} />
        )}
        {known && result.type === 'question' && (
          <QuestionRenderer result={result} dispatch={dispatch} />
        )}
        {known && result.type === 'report' && (
          <ReportRenderer result={result} dispatch={dispatch} onInspect={onInspect} />
        )}
        {known && result.type === 'markdown' && <TextRenderer payload={result.payload} />}
        {known && result.type === 'error' && (
          <ErrorRenderer payload={result.payload} onRetry={onRetry} />
        )}
      </div>
    </article>
  )
}
