import type { DetailView, HarnessResult } from '../../types'
import { array, dict, str } from '../../lib/coerce'
import { evidenceDetail, parseEvidenceList } from '../../lib/evidence'
import { clock } from '../../lib/format'

interface GroupData {
  id: string
  label: string
  items: ReturnType<typeof parseEvidenceList>
}

export function parseGroups(payload: unknown): {
  title?: string
  note?: string
  groups: GroupData[]
} | null {
  const data = dict(payload)
  const groups = array(data.groups)
    .map((raw, index) => {
      const group = dict(raw)
      return {
        id: str(group.id, `g-${index}`),
        label: str(group.label, '未命名分组'),
        items: parseEvidenceList(group.items),
      }
    })
    .filter((group) => group.items.length > 0)

  if (groups.length === 0) return null
  return {
    title: str(data.title) || undefined,
    note: str(data.note) || undefined,
    groups,
  }
}

interface Props {
  result: HarnessResult
  onInspect: (detail: DetailView) => void
}

export function GroupsRenderer({ result, onInspect }: Props) {
  const data = parseGroups(result.payload)
  if (!data) return null

  const total = data.groups.reduce((sum, group) => sum + group.items.length, 0)
  const batch = str(result.meta?.batch) || undefined

  return (
    <section className="groups">
      <header className="groups__head">
        <h3 className="block-title">{data.title ?? '采集结果'}</h3>
        <span className="groups__count mono">
          {data.groups.length} 组 / {total} 条
        </span>
      </header>
      {data.note && <p className="block-note">{data.note}</p>}

      {data.groups.map((group) => (
        <div className="group" key={group.id}>
          <div className="group__head">
            <span className="group__label">{group.label}</span>
            <span className="group__line" aria-hidden />
            <span className="group__count mono">{group.items.length}</span>
          </div>
          <ul className="group__items">
            {group.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="ev-row"
                  onClick={() => onInspect(evidenceDetail(item, batch))}
                >
                  <span className="ev-row__ref mono">{item.ref || '—'}</span>
                  <span className="ev-row__main">
                    <span className="ev-row__summary">{item.summary}</span>
                    <span className="ev-row__meta mono">
                      <span>{item.domain}</span>
                      <span className="ev-row__dot" aria-hidden>
                        ·
                      </span>
                      <span>{clock(item.capturedAt)}</span>
                      {item.tags.length > 0 && (
                        <span className="ev-row__tags">
                          {item.tags.map((tag) => (
                            <span className="tag" key={tag}>
                              {tag}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="ev-row__go" aria-hidden>
                    原文
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
