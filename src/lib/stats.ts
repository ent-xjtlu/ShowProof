import type { StreamItem } from '../types'
import { array, dict } from './coerce'

export interface SessionStats {
  evidence: number
  insights: number
  reports: number
}

export function sessionStats(items: StreamItem[]): SessionStats {
  const refs = new Set<string>()
  const insightRefs = new Set<string>()
  let reports = 0

  for (const item of items) {
    if (item.kind !== 'result' || !item.result) continue
    const payload = dict(item.result.payload)
    if (item.result.type === 'groups') {
      for (const rawGroup of array(payload.groups)) {
        const group = dict(rawGroup)
        for (const rawItem of array(group.items)) {
          const evidence = dict(rawItem)
          const key = String(evidence.ref ?? evidence.id ?? evidence.url ?? '')
          if (key) refs.add(key)
        }
      }
    }
    if (item.result.type === 'insights') {
      for (const rawInsight of array(payload.insights)) {
        const insight = dict(rawInsight)
        const key = String(insight.ref ?? insight.id ?? insight.claim ?? '')
        if (key) insightRefs.add(key)
      }
    }
    if (item.result.type === 'report') reports += 1
  }

  return { evidence: refs.size, insights: insightRefs.size, reports }
}
