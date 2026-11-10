import type { ReactNode } from 'react'

const INLINE =
  /(\*\*[^*]+\*\*)|(`[^`]+`)|(\[[^\]]+\]\([^)\s]+\))|(\[\d{1,2}\])/g

interface InlineProps {
  text: string
  onCitation?: (ref: string) => void
}

export function InlineText({ text, onCitation }: InlineProps): ReactNode {
  const nodes: ReactNode[] = []
  let last = 0
  let key = 0

  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0
    if (index > last) nodes.push(text.slice(last, index))
    const token = match[0]

    if (token.startsWith('**')) {
      nodes.push(<strong key={`b${key++}`}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('`')) {
      nodes.push(<code key={`c${key++}`}>{token.slice(1, -1)}</code>)
    } else if (token.includes('](')) {
      const split = token.indexOf('](')
      const label = token.slice(1, split)
      const href = token.slice(split + 2, -1)
      nodes.push(
        <a key={`a${key++}`} href={href} target="_blank" rel="noreferrer">
          {label}
        </a>,
      )
    } else {
      const ref = token.slice(1, -1)
      if (onCitation) {
        nodes.push(
          <button
            key={`n${key++}`}
            type="button"
            className="cite"
            onClick={() => onCitation(ref)}
            title={`查看引注 ${ref}`}
          >
            {ref}
          </button>,
        )
      } else {
        nodes.push(
          <sup key={`n${key++}`} className="cite-static">
            {ref}
          </sup>,
        )
      }
    }

    last = index + token.length
  }

  if (last < text.length) nodes.push(text.slice(last))
  return <>{nodes}</>
}

interface MarkdownProps {
  source: string
  onCitation?: (ref: string) => void
}

export function Markdown({ source, onCitation }: MarkdownProps): ReactNode {
  // 模型偶尔把换行输出成字面量 \n；在渲染层还原，避免整段挤成一行。
  const normalized = source.replace(/\r\n/g, '\n').replace(/\\n/g, '\n')
  const lines = normalized.split('\n')
  const out: ReactNode[] = []
  let key = 0
  let i = 0
  let paragraph: string[] = []

  const flush = () => {
    if (paragraph.length === 0) return
    const text = paragraph.join(' ')
    paragraph = []
    out.push(
      <p key={`p${key++}`}>
        <InlineText text={text} onCitation={onCitation} />
      </p>,
    )
  }

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim() === '') {
      flush()
      i += 1
      continue
    }

    if (line.trim().startsWith('```')) {
      flush()
      i += 1
      const code: string[] = []
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code.push(lines[i])
        i += 1
      }
      i += 1
      out.push(
        <pre key={`pre${key++}`}>
          <code>{code.join('\n')}</code>
        </pre>,
      )
      continue
    }

    // GFM 表格：| a | b |  +  | --- | --- |
    if (line.trim().startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(lines[i + 1])) {
      flush()
      const splitRow = (row: string) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
      const header = splitRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i]))
        i += 1
      }
      out.push(
        <div className="md__table" key={`tw${key++}`}>
          <table>
            <thead>
              <tr>{header.map((cell, idx) => <th key={idx}><InlineText text={cell} onCitation={onCitation} /></th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, colIndex) => <td key={colIndex}><InlineText text={cell} onCitation={onCitation} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line)
    if (heading) {
      flush()
      const level = heading[1].length
      const content = <InlineText text={heading[2]} onCitation={onCitation} />
      if (level === 1) out.push(<h2 key={`h${key++}`}>{content}</h2>)
      else if (level === 2) out.push(<h3 key={`h${key++}`}>{content}</h3>)
      else out.push(<h4 key={`h${key++}`}>{content}</h4>)
      i += 1
      continue
    }

    if (/^\s*[-*]\s+/.test(line)) {
      flush()
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''))
        i += 1
      }
      out.push(
        <ul key={`ul${key++}`}>
          {items.map((item, idx) => (
            <li key={idx}>
              <InlineText text={item} onCitation={onCitation} />
            </li>
          ))}
        </ul>,
      )
      continue
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      flush()
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i += 1
      }
      out.push(
        <ol key={`ol${key++}`}>
          {items.map((item, idx) => (
            <li key={idx}>
              <InlineText text={item} onCitation={onCitation} />
            </li>
          ))}
        </ol>,
      )
      continue
    }

    if (line.startsWith('>')) {
      flush()
      const quoted: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) {
        quoted.push(lines[i].replace(/^>\s?/, ''))
        i += 1
      }
      out.push(
        <blockquote key={`q${key++}`}>
          <InlineText text={quoted.join(' ')} onCitation={onCitation} />
        </blockquote>,
      )
      continue
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flush()
      out.push(<hr key={`hr${key++}`} />)
      i += 1
      continue
    }

    paragraph.push(line.trim())
    i += 1
  }

  flush()
  return <div className="md">{out}</div>
}
