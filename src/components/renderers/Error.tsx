import { bool, dict, str } from '../../lib/coerce'

interface Props {
  payload: unknown
  onRetry: () => void
}

export function ErrorRenderer({ payload, onRetry }: Props) {
  const data = dict(payload)
  const message = str(data.message, 'ACP 返回了一个错误')
  const detail = str(data.detail)
  const retryable = bool(data.retryable)

  return (
    <section className="error-block">
      <header className="error-block__head">
        <span className="status" data-status="error">
          <i className="status__mark" aria-hidden />
          错误
        </span>
        <span className="mono error-block__tag">ACP 返回错误</span>
      </header>
      <p className="error-block__message">{message}</p>
      {detail && <p className="error-block__detail">{detail}</p>}
      {retryable && (
        <div className="btn-row">
          <button type="button" className="btn" onClick={onRetry}>
            重新提交上一个问题
          </button>
        </div>
      )}
    </section>
  )
}
