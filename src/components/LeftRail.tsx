import { useRef, useState } from 'react'
import type { Turn } from '../types'
import { clock } from '../lib/format'

interface Props {
  turns: Turn[]
  activeTurn: string | null
  onSubmit: (text: string) => void
  onJump: (id: string) => void
}

export function LeftRail({ turns, activeTurn, onSubmit, onJump }: Props) {
  const [text, setText] = useState('')
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const submit = () => {
    const value = text.trim()
    if (!value) return
    onSubmit(value)
    setText('')
    areaRef.current?.focus()
  }

  return (
    <aside className="rail">
      <div className="rail__compose">
        <label className="rail__label" htmlFor="composer">
          新的研究问题
        </label>
        <textarea
          id="composer"
          ref={areaRef}
          className="composer"
          rows={3}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              submit()
            }
          }}
        />
        <div className="rail__submit">
          <span className="rail__hint mono">Ctrl / ⌘ + Enter</span>
          <button type="button" className="btn btn--primary" onClick={submit} disabled={!text.trim()}>
            发送
          </button>
        </div>
      </div>

      <div className="rail__history">
        <div className="rail__section-head">
          <span className="rail__section-label">会话记录</span>
          <span className="rail__count mono">{turns.length}</span>
        </div>
        {turns.length === 0 ? (
          <p className="rail__empty">提交第一个问题后，这里会保留每一次输入。</p>
        ) : (
          <ul className="turns">
            {turns.map((turn, index) => (
              <li key={turn.id}>
                <button
                  type="button"
                  className="turn"
                  data-active={activeTurn === turn.id || undefined}
                  onClick={() => onJump(turn.id)}
                  title="回到这条输入"
                >
                  <span className="turn__idx mono">{String(index + 1).padStart(2, '0')}</span>
                  <span className="turn__body">
                    <span className="turn__text">{turn.text}</span>
                    <span className="turn__time mono">{clock(turn.at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="rail__foot">
        <span className="rail__foot-mark" aria-hidden />
        研究记录保存在本机服务端，可在重新登录后继续查看
      </footer>
    </aside>
  )
}
