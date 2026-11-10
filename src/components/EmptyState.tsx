import type { StreamStatus } from '../types'

const FLOW = [
  ['提出问题', '一句话写明展会、企业或市场问题'],
  ['检索与采集', 'ACP 决定检索路径，抓取并保存正文'],
  ['证据', '每条结论挂到来源、时间与原文摘录'],
  ['洞察', '跨来源比对后生成结论'],
  ['审核', '你决定哪条结论成立'],
  ['报告', '只使用已通过的内容'],
] as const

export function EmptyState() {
  return (
    <div className="empty">
      <h2 className="empty__title">先问一个问题。</h2>
      <p className="empty__lead">
        检索、取证、结论都由 ACP 完成；你只负责判断哪条结论可以进报告。左侧输入框一直可用，
        随时可以追问或改口径。
      </p>

      <ol className="flow">
        {FLOW.map(([title, detail], index) => (
          <li className="flow__item" key={title}>
            <span className="flow__idx mono">{String(index + 1).padStart(2, '0')}</span>
            <span className="flow__title">{title}</span>
            <span className="flow__detail">{detail}</span>
          </li>
        ))}
      </ol>

    </div>
  )
}

export function Waiting({ status }: { status: StreamStatus }) {
  if (status !== 'working') return null
  return (
    <div className="waiting" role="status">
      <span className="waiting__bars" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <span className="waiting__text">ACP 正在处理</span>
      <span className="waiting__hint">可以继续输入新问题，不会打断当前检索</span>
    </div>
  )
}
