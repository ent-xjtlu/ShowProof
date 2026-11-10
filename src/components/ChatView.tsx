import { useEffect, useRef, useState } from 'react'
import type { ChatSession } from '../domain'
import { clock } from '../lib/format'
import { Markdown } from './Markdown'

interface Props {
  chats: ChatSession[]
  active: ChatSession | null
  busy: boolean
  error?: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onSend: (text: string) => void
  onCancel: () => void
  onDelete: (id: string) => void
}

export function ChatView({ chats, active, busy, error, onSelect, onCreate, onSend, onCancel, onDelete }: Props) {
  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [active?.messages.length, active?.status])

  const send = () => {
    const value = text.trim()
    if (!value || busy) return
    onSend(value)
    setText('')
    areaRef.current?.focus()
  }

  const lastActivity = active?.activity.length ? active.activity[active.activity.length - 1] : null

  return (
    <section className="chatdesk">
      <aside className="chatlist">
        <header className="chatlist__head">
          <span className="eyebrow mono">CHAT · 对话</span>
          <button type="button" className="btn btn--ghost chatlist__new" onClick={onCreate}>＋ 新对话</button>
        </header>
        <p className="chatlist__note">直连 DeepSeek Harness，不拼接任何提示词。</p>
        <ul className="chatlist__items">
          {chats.map((chat) => (
            <li key={chat.id}>
              <div className="chatlist__item" data-active={active?.id === chat.id || undefined}>
                <button type="button" className="chatlist__open" onClick={() => onSelect(chat.id)}>
                  <span className="chatlist__title">{chat.title}</span>
                  <span className="chatlist__meta mono">{chat.status === 'running' ? '进行中' : clock(chat.updatedAt)}</span>
                </button>
                <button type="button" className="chatlist__del" aria-label="删除对话" onClick={() => onDelete(chat.id)}>×</button>
              </div>
            </li>
          ))}
          {!chats.length && <li className="chatlist__empty">还没有对话，点「新对话」开始。</li>}
        </ul>
      </aside>

      <div className="chatpane">
        {!active ? (
          <div className="chatpane__empty">
            <p className="eyebrow mono">DIRECT AGENT · 直连</p>
            <h1 className="panel__title">直接和 Harness 对话</h1>
            <p className="panel__lede">消息原样发送到 DeepSeek Harness ACP 会话，不注入系统提示词、不改写内容。支持联网搜索、网页抓取与工具调用。</p>
            <button type="button" className="btn btn--primary" onClick={onCreate}>开始新对话 <span aria-hidden>↗</span></button>
          </div>
        ) : (
          <>
            <header className="chatpane__head">
              <div>
                <h1 className="chatpane__title">{active.title}</h1>
                <p className="chatpane__status mono">
                  {active.status === 'running' ? 'Agent 正在处理…' : active.status === 'failed' ? `失败：${active.error || ''}` : '空闲'}
                </p>
              </div>
              {active.status === 'running' && <button type="button" className="btn btn--ghost" onClick={onCancel}>停止</button>}
            </header>

            <div className="chatpane__scroll" ref={scrollRef}>
              {active.messages.length === 0 && <p className="chatpane__hint">直接输入问题，消息会原样发给 Harness。</p>}
              {active.messages.map((message) => (
                <article key={message.id} className="msg" data-role={message.role}>
                  <div className="msg__meta mono">
                    <span>{message.role === 'user' ? '你' : message.role === 'assistant' ? 'Harness' : '系统'}</span>
                    <span>{clock(message.at)}</span>
                  </div>
                  {message.role === 'assistant' && message.trace && message.trace.length > 0 && (
                    <details className="msg__trace">
                      <summary>执行过程（{message.trace.length} 步）</summary>
                      <ol>
                        {message.trace.map((step, index) => (
                          <li key={`${step.at}-${index}`}>
                            <span className="msg__trace-label">{step.label}</span>
                            <span className="msg__trace-time mono">{clock(step.at)}</span>
                            {step.detail && <span className="msg__trace-detail">{step.detail}</span>}
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                  {message.role === 'assistant' ? <Markdown source={message.text} /> : <p className="msg__text">{message.text}</p>}
                </article>
              ))}
              {active.status === 'running' && (
                <div className="live-trace">
                  <div className="live-trace__head">
                    <span className="waiting__bars" aria-hidden><i /><i /><i /></span>
                    <span>{lastActivity ? lastActivity.label : '等待 Agent 响应…'}</span>
                  </div>
                  <ol>
                    {active.activity.slice(-8).map((step, index) => (
                      <li key={`${step.at}-${index}`}>
                        <span className="live-trace__label">{step.label}</span>
                        <span className="live-trace__time mono">{step.at.slice(11, 19)}</span>
                        {step.detail && <span className="live-trace__detail">{step.detail}</span>}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            {error && <p className="chatpane__error" role="alert">{error}</p>}

            <div className="chatpane__compose">
              <textarea
                ref={areaRef}
                className="input input--area chatpane__input"
                rows={3}
                value={text}
                placeholder="输入消息，Ctrl / ⌘ + Enter 发送"
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault()
                    send()
                  }
                }}
              />
              <div className="chatpane__send">
                <span className="mono chatpane__hint-text">不拼接提示词 · 原样转发</span>
                <button type="button" className="btn btn--primary" onClick={send} disabled={!text.trim() || busy}>
                  {busy ? '等待回复…' : '发送'}
                  <span aria-hidden>↗</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
