import type { DetailView } from '../types'
import { array, dict, str, strings } from './coerce'

export interface EvidenceData {
  id: string
  ref: string
  title: string
  summary: string
  domain: string
  url: string
  capturedAt: string
  excerpt: string
  tags: string[]
  batch?: string
}

/** payload 的字段名不做强约束：能认出来的就用，认不出来留空。 */
export function parseEvidence(raw: unknown): EvidenceData | null {
  const data = dict(raw)
  const ref = str(data.ref)
  const title = str(data.title) || str(data.domain) || ref
  const excerpt = str(data.excerpt)
  if (!ref && !title && !excerpt) return null
  return {
    id: str(data.id) || ref || title,
    ref,
    title,
    summary: str(data.summary) || excerpt.slice(0, 96),
    domain: str(data.domain),
    url: str(data.url),
    capturedAt: str(data.capturedAt),
    excerpt,
    tags: strings(data.tags),
    batch: str(data.batch) || undefined,
  }
}

export function parseEvidenceList(raw: unknown): EvidenceData[] {
  return array(raw)
    .map(parseEvidence)
    .filter((item): item is EvidenceData => item !== null)
}

export function evidenceDetail(item: EvidenceData, fallbackBatch?: string): DetailView {
  return {
    id: `ev-${item.id}`,
    eyebrow: item.ref ? `证据 ${item.ref}` : '证据',
    title: item.title,
    excerpt: item.excerpt,
    url: item.url,
    domain: item.domain,
    capturedAt: item.capturedAt,
    batch: item.batch ?? fallbackBatch,
    tags: item.tags,
    sourceLabel: item.tags[0],
  }
}
