import { useEffect } from 'react'
import type { DetailView } from '../types'
import { clock } from '../lib/format'
import { Markdown } from './Markdown'

function stamp(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : clock(value, true)
}

interface Props {
  detail: DetailView | null
  open: boolean
  onClose: () => void
}

export function DetailPanel({ detail, open, onClose }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      {open && <button type="button" className="detail__scrim" aria-label="关闭来源面板" onClick={onClose} />}
      <aside className="detail" data-open={open || undefined} aria-hidden={!open}>
        {detail && (
          <>
            <div className="detail__head">
              <span className="detail__eyebrow">{detail.eyebrow ?? '来源与原文'}</span>
              <button type="button" className="detail__close" onClick={onClose} aria-label="关闭">
                ×
              </button>
            </div>

            <div className="detail__body">
              <h2 className="detail__title">{detail.title}</h2>

              <dl className="detail__meta">
                {detail.domain && (
                  <div>
                    <dt>来源</dt>
                    <dd className="mono">{detail.domain}</dd>
                  </div>
                )}
                {detail.capturedAt && (
                  <div>
                    <dt>采集时间</dt>
                    <dd className="mono">{stamp(detail.capturedAt)}</dd>
                  </div>
                )}
                {detail.batch && (
                  <div>
                    <dt>批次</dt>
                    <dd className="mono">{detail.batch}</dd>
                  </div>
                )}
                {detail.sourceLabel && (
                  <div>
                    <dt>类型</dt>
                    <dd>{detail.sourceLabel}</dd>
                  </div>
                )}
              </dl>

              {detail.tags && detail.tags.length > 1 && (
                <div className="detail__tags">
                  {detail.tags.map((tag) => (
                    <span key={tag} className="detail__tag">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {detail.excerpt && (
                <section className="detail__section">
                  <h3 className="detail__label">原文摘录</h3>
                  <blockquote className="detail__quote">{detail.excerpt}</blockquote>
                </section>
              )}

              {detail.body && (
                <section className="detail__section">
                  <h3 className="detail__label">详情</h3>
                  <Markdown source={detail.body} />
                </section>
              )}

              {detail.trace && detail.trace.length > 0 && (
                <section className="detail__section">
                  <h3 className="detail__label">ACP 溯源</h3>
                  <ol className="trace">
                    {detail.trace.map((item, index) => (
                      <li key={`${item.label}-${index}`} className="trace__item">
                        <span className="trace__label mono">{item.label}</span>
                        {item.at && <span className="trace__at mono">{item.at}</span>}
                        {item.detail && <span className="trace__detail">{item.detail}</span>}
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {detail.url && (
                <a className="detail__link" href={detail.url} target="_blank" rel="noreferrer">
                  打开原文
                  <span aria-hidden>↗</span>
                </a>
              )}
            </div>
          </>
        )}

        {!detail && (
          <div className="detail__idle">
            <p>点在证据、洞察编号或报告角标上，这里会显示对应的原文与来源。</p>
          </div>
        )}
      </aside>
    </>
  )
}
