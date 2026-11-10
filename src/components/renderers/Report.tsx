import { useEffect, useRef, useState } from 'react'
import type { ClientEvent, DetailView, ACPResult } from '../../types'
import { array, bool, dict, str } from '../../lib/coerce'
import { downloadAuthenticated, downloadText, escapeHtml } from '../../lib/download'
import { InlineText } from '../Markdown'

/** 随内容长高的文本框：报告段落长短不一，固定 rows 会截断文字。 */
function AutoTextarea({
  value,
  rows,
  onChange,
}: {
  value: string
  rows: number
  onChange: (value: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      rows={rows}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

interface Block {
  type: string
  text?: string
  items?: string[]
}

interface Citation {
  ref: string
  label: string
  title: string
  domain: string
  url: string
  excerpt: string
  capturedAt: string
}

export function parseReport(payload: unknown): {
  title: string
  subtitle?: string
  editable: boolean
  blocks: Block[]
  citations: Citation[]
} | null {
  const data = dict(payload)
  const blocks = array(data.blocks).map((raw) => {
    const block = dict(raw)
    const type = str(block.type, 'p')
    const text = str(block.text)
    const items = array(block.items).map((item) => str(item)).filter(Boolean)
    return { type, text, items }
  })
  const citations = array(data.citations).map((raw, index) => {
    const citation = dict(raw)
    return {
      ref: str(citation.ref, String(index + 1)),
      label: str(citation.label),
      title: str(citation.title) || str(citation.label),
      domain: str(citation.domain),
      url: str(citation.url),
      excerpt: str(citation.excerpt),
      capturedAt: str(citation.capturedAt),
    }
  })
  if (blocks.length === 0) return null
  return {
    title: str(data.title, '报告草稿'),
    subtitle: str(data.subtitle) || undefined,
    editable: bool(data.editable),
    blocks,
    citations,
  }
}

const cloneBlocks = (blocks: Block[]): Block[] =>
  blocks.map((block) => ({ ...block, items: block.items ? [...block.items] : undefined }))

const slug = (title: string): string =>
  title.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-+/g, '-').slice(0, 60)

function toMarkdown(title: string, blocks: Block[], citations: Citation[]): string {
  const lines = [`# ${title}`, '']
  for (const block of blocks) {
    if (block.type === 'h2') lines.push(`## ${block.text ?? ''}`, '')
    else if (block.type === 'h3') lines.push(`### ${block.text ?? ''}`, '')
    else if (block.type === 'ul' || block.type === 'ol') {
      const items = block.items ?? []
      items.forEach((item, index) => {
        lines.push(block.type === 'ol' ? `${index + 1}. ${item}` : `- ${item}`)
      })
      lines.push('')
    } else lines.push(block.text ?? '', '')
  }
  if (citations.length > 0) {
    lines.push('## 来源', '')
    for (const citation of citations) {
      lines.push(`${citation.ref}. ${citation.label || citation.title}${citation.url ? ` — ${citation.url}` : ''}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function toHtml(title: string, blocks: Block[], citations: Citation[]): string {
  const body: string[] = []
  const inline = (text: string) => escapeHtml(text).replace(/\[(\d{1,2})\]/g, '<sup>[$1]</sup>')
  for (const block of blocks) {
    if (block.type === 'h2') body.push(`<h2>${inline(block.text ?? '')}</h2>`)
    else if (block.type === 'h3') body.push(`<h3>${inline(block.text ?? '')}</h3>`)
    else if (block.type === 'ul' || block.type === 'ol') {
      const tag = block.type === 'ol' ? 'ol' : 'ul'
      const items = (block.items ?? []).map((item) => `<li>${inline(item)}</li>`).join('')
      body.push(`<${tag}>${items}</${tag}>`)
    } else body.push(`<p>${inline(block.text ?? '')}</p>`)
  }
  if (citations.length > 0) {
    body.push('<h2>来源</h2><ol class="sources">')
    for (const citation of citations) {
      body.push(
        `<li>${escapeHtml(citation.label || citation.title)}${
          citation.url ? ` — <a href="${escapeHtml(citation.url)}">${escapeHtml(citation.url)}</a>` : ''
        }</li>`,
      )
    }
    body.push('</ol>')
  }
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(
    title,
  )}</title><style>
  body{max-width:680px;margin:48px auto;padding:0 24px;font:15px/1.9 "Noto Serif SC",Georgia,serif;color:#17191a}
  h1{font-size:26px;line-height:1.4;margin:0 0 24px}
  h2{font-size:17px;margin:32px 0 8px;font-family:"Noto Sans SC",system-ui,sans-serif}
  p{margin:0 0 14px} ul,ol{margin:0 0 14px;padding-left:22px} li{margin:4px 0}
  sup{color:#9a4f28;font-family:ui-monospace,monospace;font-size:10px}
  .sources{font-size:13px;color:#4e5450}
  </style></head><body><h1>${escapeHtml(title)}</h1>${body.join('')}</body></html>`
}

interface Props {
  result: ACPResult
  dispatch: (event: ClientEvent) => void
  onInspect: (detail: DetailView) => void
}

export function ReportRenderer({ result, dispatch, onInspect }: Props) {
  const parsed = parseReport(result.payload)
  const [blocks, setBlocks] = useState<Block[]>(() => cloneBlocks(parsed?.blocks ?? []))
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<number, string>>({})
  const [saved, setSaved] = useState(false)
  const [exportError, setExportError] = useState('')

  if (!parsed) return null

  const startEdit = () => {
    const next: Record<number, string> = {}
    blocks.forEach((block, index) => {
      next[index] = block.type === 'ul' || block.type === 'ol' ? (block.items ?? []).join('\n') : (block.text ?? '')
    })
    setDraft(next)
    setEditing(true)
  }

  const save = () => {
    const next = blocks.map((block, index) => {
      const value = draft[index] ?? ''
      if (block.type === 'ul' || block.type === 'ol') {
        return { ...block, items: value.split('\n').map((line) => line.trim()).filter(Boolean) }
      }
      return { ...block, text: value }
    })
    setBlocks(next)
    setEditing(false)
    setSaved(true)
    dispatch({
      kind: 'edit',
      resultId: result.id,
      payload: { title: parsed.title, blocks: next },
    })
  }

  const inspectCitation = (ref: string) => {
    const citation = parsed.citations.find((item) => item.ref === ref)
    if (!citation) return
    onInspect({
      id: `cite-${result.id}-${ref}`,
      eyebrow: `引注 ${ref}`,
      title: citation.title || citation.label,
      excerpt: citation.excerpt,
      url: citation.url,
      domain: citation.domain,
      capturedAt: citation.capturedAt,
      sourceLabel: citation.domain,
    })
  }

  const exportMarkdown = () => {
    downloadText(`${slug(parsed.title)}.md`, toMarkdown(parsed.title, blocks, parsed.citations))
  }

  const exportHtml = () => {
    downloadText(
      `${slug(parsed.title)}.html`,
      toHtml(parsed.title, blocks, parsed.citations),
      'text/html;charset=utf-8',
    )
  }

  const exportCsv = async () => {
    const researchId = result.id.split(':')[1]
    if (!researchId) return
    setExportError('')
    try {
      await downloadAuthenticated(`/api/research/${researchId}/report.csv`, `${slug(parsed.title)}-evidence.csv`)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '表格下载失败')
    }
  }

  return (
    <section className="report">
      <header className="report__head">
        <div>
          <h3 className="report__title">{parsed.title}</h3>
          {parsed.subtitle && <p className="report__subtitle">{parsed.subtitle}</p>}
        </div>
        <div className="report__tools">
          {parsed.editable && !editing && (
            <button type="button" className="btn btn--ghost" onClick={startEdit}>
              编辑
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={exportMarkdown}>
            导出 Markdown
          </button>
          <button type="button" className="btn btn--ghost" onClick={exportHtml}>
            导出 HTML
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => void exportCsv()}>
            下载证据表格
          </button>
        </div>
      </header>

      {exportError && <p className="report__saved report__saved--error">{exportError}</p>}

      {saved && !editing && (
        <p className="report__saved mono">修改已回传 ACP</p>
      )}

      <div className="doc">
        {blocks.map((block, index) => {
          if (editing) {
            return (
              <div className="doc__edit" key={index}>
                <span className="doc__edit-label mono">
                  {block.type === 'h2' ? '小标题' : block.type === 'ul' ? '列表（每行一条）' : '段落'}
                </span>
                <AutoTextarea
                  rows={block.type === 'p' ? 3 : block.type === 'ul' ? 4 : 1}
                  value={draft[index] ?? ''}
                  onChange={(value) => setDraft((prev) => ({ ...prev, [index]: value }))}
                />
              </div>
            )
          }

          if (block.type === 'h2') {
            return (
              <h4 className="doc__h2" key={index}>
                {block.text}
              </h4>
            )
          }
          if (block.type === 'h3') {
            return (
              <h5 className="doc__h3" key={index}>
                {block.text}
              </h5>
            )
          }
          if (block.type === 'ul' || block.type === 'ol') {
            const ListTag = block.type === 'ol' ? 'ol' : 'ul'
            return (
              <ListTag className="doc__list" key={index}>
                {(block.items ?? []).map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <InlineText text={item} onCitation={inspectCitation} />
                  </li>
                ))}
              </ListTag>
            )
          }
          return (
            <p className="doc__p" key={index}>
              <InlineText text={block.text ?? ''} onCitation={inspectCitation} />
            </p>
          )
        })}
      </div>

      {editing && (
        <div className="btn-row report__edit-actions">
          <button type="button" className="btn btn--primary" onClick={save}>
            保存修改
          </button>
          <button type="button" className="btn" onClick={() => setEditing(false)}>
            放弃
          </button>
        </div>
      )}

      {parsed.citations.length > 0 && (
        <footer className="report__sources">
          <span className="report__sources-title">来源</span>
          <ol>
            {parsed.citations.map((citation) => (
              <li key={citation.ref}>
                <button type="button" className="cite-row" onClick={() => inspectCitation(citation.ref)}>
                  <span className="cite-row__ref mono">{citation.ref}</span>
                  <span className="cite-row__label">{citation.label || citation.title}</span>
                  <span className="cite-row__domain mono">{citation.domain}</span>
                </button>
              </li>
            ))}
          </ol>
        </footer>
      )}
    </section>
  )
}
