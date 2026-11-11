/** 展会与企业信息助手的传输契约（与 server/exhibition.ts 对齐）。 */

export type ExhibitorRole = 'customer' | 'partner' | 'channel' | 'supplier' | 'competitor' | 'irrelevant'
export type Verdict = 'attend' | 'visit-first' | 'contact-first' | 'confirm' | 'skip'

export interface SearchFilters {
  countries: string[]
  years: number[]
  industries: string[]
  scale: 'any' | 'large' | 'international'
  purpose: 'any' | 'customers' | 'partners'
  note?: string
}

export interface CostParams {
  boothAreaSqm: number
  staffCount: number
  days: number
  originCity: string
  hotelTier: 'economy' | 'standard' | 'premium'
  sponsorshipBudget: number
}

export interface CompanyProfile {
  id: string
  userId: string
  name: string
  website?: string
  description: string
  products: string[]
  customers: string[]
  industry: string
  targetMarkets: string[]
  filters: SearchFilters
  cost: CostParams
  createdAt: string
  updatedAt: string
}

export interface PublicFee {
  label: string
  amount?: number
  currency?: string
  unit?: string
  note?: string
  sourceUrl?: string
}

export interface EvidenceSource {
  id: string
  title: string
  url: string
  type: string
  capturedAt: string
  excerpt: string
  status: 'verified' | 'pending' | 'failed'
}

export interface Exhibitor {
  id: string
  name: string
  website?: string
  country?: string
  booth?: string
  role: ExhibitorRole
  roleNote?: string
  reason: string
  confidence: number
  evidenceIds: string[]
  qcc?: { checkedAt: string; summary: string; risk?: string }
}

export interface CostItem {
  id: string
  label: string
  min: number
  max: number
  note?: string
  sourceUrl?: string
}

export interface CostEstimate {
  currency: 'CNY'
  items: CostItem[]
  totalMin: number
  totalMax: number
  modes: {
    booth: { min: number; max: number }
    visit: { min: number; max: number }
    contact: { min: number; max: number }
  }
  assumptions: string[]
}

export interface ChangeRecord {
  at: string
  type: 'date' | 'deadline' | 'website' | 'exhibitors' | 'fee' | 'status'
  detail: string
}

export interface Exhibition {
  id: string
  userId: string
  discoveryId: string
  status: 'queued' | 'researching' | 'ready' | 'failed'
  error?: string
  name: string
  type?: string
  startDate?: string
  endDate?: string
  city: string
  country: string
  venue?: string
  organizer?: string
  theme?: string
  exhibitScope?: string
  participation?: string
  registrationDeadline?: string
  website?: string
  fitScore: number
  fitReasons: string[]
  mismatchReasons: string[]
  exhibitors: Exhibitor[]
  counts: Record<ExhibitorRole | 'total', number>
  score: number
  verdict: Verdict
  verdictReason: string
  agentVerdict?: string
  actionPlan: string[]
  publicFees: PublicFee[]
  cost: CostEstimate
  sources: EvidenceSource[]
  watched: boolean
  /** 最近一次调查的实时过程，供详情页展示。 */
  activity?: { label: string; detail?: string; at: string }[]
  /** 记录来源：检索发现 / Agent 加入 / 手工录入。 */
  origin?: 'discovery' | 'agent' | 'manual'
  /** Agent 备注（加入理由、后续动作等）。 */
  agentNote?: string
  /** 软删除时间；有值表示在回收站。 */
  archivedAt?: string
  lastCheckedAt?: string
  changes: ChangeRecord[]
  createdAt: string
  updatedAt: string
}

export interface Discovery {
  id: string
  userId: string
  profileId: string
  status: 'running' | 'completed' | 'partial' | 'failed'
  stage: string
  error?: string
  exhibitionIds: string[]
  activity: { label: string; detail?: string; at: string; status: 'running' | 'completed' | 'failed' }[]
  createdAt: string
  updatedAt: string
}

export const ROLE_LABELS: Record<ExhibitorRole, string> = {
  customer: '潜在客户',
  partner: '合作伙伴',
  channel: '渠道商',
  supplier: '供应商',
  competitor: '竞争对手',
  irrelevant: '关系较小',
}

export const VERDICT_LABELS: Record<Verdict, string> = {
  attend: '建议参加',
  'visit-first': '建议先观展',
  'contact-first': '建议提前联系重点企业',
  confirm: '可以参加，但需确认',
  skip: '暂不建议参加',
}

export const SCALE_LABELS: Record<SearchFilters['scale'], string> = {
  any: '不限规模',
  large: '大型展会',
  international: '国际展会',
}

export const PURPOSE_LABELS: Record<SearchFilters['purpose'], string> = {
  any: '不限目的',
  customers: '优先找客户',
  partners: '优先找伙伴',
}

export const HOTEL_LABELS: Record<CostParams['hotelTier'], string> = {
  economy: '经济',
  standard: '标准',
  premium: '高档',
}

/** 直连对话（不拼接提示词，原样转发给 DeepSeek Harness）。 */
export interface ChatEntry {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  at: string
  internal?: boolean
  trace?: { label: string; detail?: string; at: string }[]
}

export interface ChatSession {
  id: string
  userId: string
  title: string
  messages: ChatEntry[]
  activity: { label: string; detail?: string; at: string; status: 'running' | 'completed' | 'failed' }[]
  status: 'idle' | 'running' | 'failed'
  error?: string
  createdAt: string
  updatedAt: string
}
