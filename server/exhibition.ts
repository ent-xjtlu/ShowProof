/**
 * 展会与企业信息助手：领域模型、Agent 输出契约、费用估算与报告生成。
 *
 * 这里只放纯函数，方便单测；网络抓取、ACP 调用与持久化留在 server/index.ts。
 */

export type ExhibitorRole = 'customer' | 'partner' | 'channel' | 'supplier' | 'competitor' | 'irrelevant'

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
  /** 计划赞助金额（元）；0 表示不赞助。 */
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

export type Verdict = 'attend' | 'visit-first' | 'contact-first' | 'confirm' | 'skip'

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
  confirm: '可以参加，但需要进一步确认',
  skip: '暂不建议参加',
}

export const DEFAULT_FILTERS: SearchFilters = {
  countries: [],
  years: [],
  industries: [],
  scale: 'any',
  purpose: 'any',
}

export const DEFAULT_COST: CostParams = {
  boothAreaSqm: 18,
  staffCount: 4,
  days: 3,
  originCity: '',
  hotelTier: 'standard',
  sponsorshipBudget: 0,
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const asString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(asString).filter(Boolean) : typeof value === 'string' && value.trim() ? [value.trim()] : []
const asNumber = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(asString(value).replace(/[^0-9.+-]/g, ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

function asIsoDate(value: unknown): string | undefined {
  const text = asString(value)
  if (!text) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const match = text.match(/(\d{4})[年./-](\d{1,2})[月./-](\d{1,2})/)
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
  return undefined
}

/** 从 Agent 回复里取出第一个完整 JSON 对象（容忍代码围栏、前后说明文字）。 */
export function extractJsonObject(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '')
  const start = cleaned.indexOf('{')
  if (start < 0) throw new Error('JSON_NOT_FOUND')
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < cleaned.length; index += 1) {
    const char = cleaned[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        const body = cleaned.slice(start, index + 1)
        try {
          return JSON.parse(body)
        } catch {
          try {
            return JSON.parse(body.replace(/,\s*([}\]])/g, '$1'))
          } catch {
            throw new Error('JSON_PARSE_FAILED')
          }
        }
      }
    }
  }
  throw new Error('JSON_INCOMPLETE')
}

function normalizeRole(value: unknown): { role: ExhibitorRole; note?: string } {
  const raw = asString(value).toLowerCase()
  if (!raw) return { role: 'irrelevant' }
  const table: Array<[ExhibitorRole, string[]]> = [
    ['customer', ['customer', 'buyer', 'client', '客户', '采购', '买家', '用户', '终端']],
    ['partner', ['partner', '合作', '伙伴', '联盟', '生态']],
    ['channel', ['channel', 'distributor', 'dealer', 'agent', '渠道', '代理', '经销', '集成商']],
    ['supplier', ['supplier', 'vendor', '供应', '原料', '零部件', '代工']],
    ['competitor', ['competitor', 'rival', '竞争', '竞品']],
    ['irrelevant', ['irrelevant', 'other', '无关', '其他', '关系较小']],
  ]
  for (const [role, keys] of table) {
    if (keys.some((key) => raw.includes(key))) return { role }
  }
  return { role: 'irrelevant', note: asString(value).slice(0, 20) }
}

export interface DiscoveredExhibition {
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
  publicFees: PublicFee[]
  sources: Array<{ title: string; url: string; excerpt?: string }>
}

export interface DetailedExhibition {
  exhibitors: Array<{
    name: string
    website?: string
    country?: string
    booth?: string
    role: ExhibitorRole
    roleNote?: string
    reason: string
    confidence: number
  }>
  agentVerdict?: string
  verdictReason: string
  actionPlan: string[]
  notableUpdates: string[]
  publicFees: PublicFee[]
  overview: { venue?: string; organizer?: string; theme?: string; exhibitScope?: string; participation?: string; registrationDeadline?: string; website?: string }
  sources: Array<{ title: string; url: string; excerpt?: string }>
}

export function normalizeFees(value: unknown): PublicFee[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item): PublicFee | null => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const label = asString(record.label)
      if (!label) return null
      const amount = asNumber(record.amount, -1)
      return {
        label,
        amount: amount >= 0 ? amount : undefined,
        currency: asString(record.currency) || undefined,
        unit: asString(record.unit) || undefined,
        note: asString(record.note) || undefined,
        sourceUrl: asString(record.sourceUrl) || undefined,
      }
    })
    .filter((item): item is PublicFee => Boolean(item))
    .slice(0, 12)
}

export function normalizeSources(value: unknown): Array<{ title: string; url: string; excerpt?: string }> {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const list: Array<{ title: string; url: string; excerpt?: string }> = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const url = asString(record.url)
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue
    seen.add(url)
    list.push({ title: asString(record.title) || url, url, excerpt: asString(record.excerpt) || undefined })
  }
  return list.slice(0, 10)
}

export function normalizeDiscoveryPayload(payload: unknown): DiscoveredExhibition[] {
  if (!payload || typeof payload !== 'object') throw new Error('DISCOVERY_PAYLOAD_INVALID')
  const list = (payload as Record<string, unknown>).exhibitions
  if (!Array.isArray(list)) throw new Error('DISCOVERY_LIST_MISSING')
  const exhibitions: DiscoveredExhibition[] = []
  const seen = new Set<string>()
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const name = asString(record.name)
    if (!name || seen.has(name.toLowerCase())) continue
    const website = asString(record.website)
    const startDate = asIsoDate(record.startDate)
    const endDate = asIsoDate(record.endDate)
    seen.add(name.toLowerCase())
    exhibitions.push({
      name,
      type: asString(record.type) || undefined,
      startDate,
      endDate,
      city: asString(record.city),
      country: asString(record.country),
      venue: asString(record.venue) || undefined,
      organizer: asString(record.organizer) || undefined,
      theme: asString(record.theme) || undefined,
      exhibitScope: asString(record.exhibitScope) || undefined,
      participation: asString(record.participation) || undefined,
      registrationDeadline: asIsoDate(record.registrationDeadline),
      website: /^https?:\/\//i.test(website) ? website : undefined,
      fitScore: clamp(Math.round(asNumber(record.fitScore, 55)), 0, 100),
      fitReasons: asStringArray(record.fitReasons).slice(0, 5),
      mismatchReasons: asStringArray(record.mismatchReasons).slice(0, 5),
      publicFees: normalizeFees(record.publicFees),
      sources: normalizeSources(record.sources),
    })
  }
  if (!exhibitions.length) throw new Error('DISCOVERY_EMPTY')
  return exhibitions.slice(0, 60)
}

export function normalizeDetailPayload(payload: unknown): DetailedExhibition {
  if (!payload || typeof payload !== 'object') throw new Error('DETAIL_PAYLOAD_INVALID')
  const record = payload as Record<string, unknown>
  const overviewRaw = record.overview && typeof record.overview === 'object' ? (record.overview as Record<string, unknown>) : {}
  const exhibitorsRaw = Array.isArray(record.exhibitors) ? record.exhibitors : []
  const seen = new Set<string>()
  const exhibitors: DetailedExhibition['exhibitors'] = []
  for (const item of exhibitorsRaw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const name = asString(row.name)
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    const role = normalizeRole(row.role)
    exhibitors.push({
      name,
      website: /^https?:\/\//i.test(asString(row.website)) ? asString(row.website) : undefined,
      country: asString(row.country) || undefined,
      booth: asString(row.booth) || undefined,
      role: role.role,
      roleNote: role.note,
      reason: asString(row.reason),
      confidence: clamp(asNumber(row.confidence, 0.5), 0, 1),
    })
  }
  if (!exhibitors.length) throw new Error('DETAIL_NO_EXHIBITORS')
  return {
    exhibitors,
    agentVerdict: asString(record.verdict) || undefined,
    verdictReason: asString(record.verdictReason),
    actionPlan: asStringArray(record.actionPlan).slice(0, 8),
    notableUpdates: asStringArray(record.notableUpdates).slice(0, 5),
    publicFees: normalizeFees(record.publicFees),
    overview: {
      venue: asString(overviewRaw.venue) || undefined,
      organizer: asString(overviewRaw.organizer) || undefined,
      theme: asString(overviewRaw.theme) || undefined,
      exhibitScope: asString(overviewRaw.exhibitScope) || undefined,
      participation: asString(overviewRaw.participation) || undefined,
      registrationDeadline: asIsoDate(overviewRaw.registrationDeadline),
      website: /^https?:\/\//i.test(asString(overviewRaw.website)) ? asString(overviewRaw.website) : undefined,
    },
    sources: normalizeSources(record.sources),
  }
}

export function computeCounts(exhibitors: Exhibitor[]): Record<ExhibitorRole | 'total', number> {
  const counts: Record<ExhibitorRole | 'total', number> = {
    customer: 0,
    partner: 0,
    channel: 0,
    supplier: 0,
    competitor: 0,
    irrelevant: 0,
    total: exhibitors.length,
  }
  for (const exhibitor of exhibitors) counts[exhibitor.role] += 1
  return counts
}

/** 综合模型给出的匹配分与企业构成，算一个可解释的总分。 */
export function scoreExhibition(fitScore: number, counts: Record<ExhibitorRole | 'total', number>): number {
  const customerPoints = Math.min(counts.customer, 10) * 3
  const partnerPoints = Math.min(counts.partner + counts.channel, 4) * 2.5
  const competitorPenalty = Math.min(counts.competitor, 10) * 0.5
  return clamp(Math.round(clamp(fitScore, 0, 100) * 0.5 + customerPoints + partnerPoints - competitorPenalty), 0, 100)
}

export function deriveVerdict(score: number, counts: Record<ExhibitorRole | 'total', number>): Verdict {
  if (score >= 70 && counts.customer >= 4) return 'attend'
  if (counts.customer >= 2) return 'visit-first'
  if (counts.partner + counts.channel >= 3) return 'contact-first'
  if (score >= 40) return 'confirm'
  return 'skip'
}

const FX_TO_CNY: Record<string, number> = { CNY: 1, RMB: 1, USD: 7.2, EUR: 7.8, GBP: 9.2, JPY: 0.05, HKD: 0.92 }
const REGION_OVERSEAS = 'overseas'

function isMainland(country: string): boolean {
  const text = country.toLowerCase()
  if (!text) return true
  return /中国|china|^cn$|中华人民共和国|mainland/.test(text)
}

function regionOf(country: string): 'domestic' | 'overseas' {
  return isMainland(country) ? 'domestic' : REGION_OVERSEAS
}

function daysBetween(startDate?: string, endDate?: string): number | undefined {
  if (!startDate) return undefined
  const start = new Date(`${startDate}T00:00:00Z`).getTime()
  const end = new Date(`${endDate || startDate}T00:00:00Z`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return undefined
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1)
}

function feeToCny(fee: PublicFee, boothAreaSqm: number): number | undefined {
  if (fee.amount === undefined || fee.amount <= 0) return undefined
  const currency = (fee.currency || 'CNY').toUpperCase()
  const rate = FX_TO_CNY[currency]
  if (!rate) return undefined
  const unit = (fee.unit || '').toLowerCase()
  const perSqm = /㎡|平米|平方米|sqm|m2/.test(unit)
  return Math.round(fee.amount * rate * (perSqm ? boothAreaSqm : 1))
}

/**
 * 确定性费用估算：能找到公开价格的项用公开价格，其余用按地区/档位给出的行业区间。
 * 所有数字都是估算范围，不是主办方报价。
 */
export function estimateCosts(
  profile: CompanyProfile,
  exhibition: Pick<Exhibition, 'country' | 'city' | 'startDate' | 'endDate' | 'publicFees'>,
): CostEstimate {
  const params = profile.cost
  const area = clamp(params.boothAreaSqm || DEFAULT_COST.boothAreaSqm, 6, 500)
  const staff = clamp(params.staffCount || DEFAULT_COST.staffCount, 1, 60)
  const days = clamp(daysBetween(exhibition.startDate, exhibition.endDate) ?? params.days ?? DEFAULT_COST.days, 1, 14)
  const domestic = regionOf(exhibition.country) === 'domestic'
  const tier = params.hotelTier === 'economy' ? 0.7 : params.hotelTier === 'premium' ? 1.6 : 1
  const rates = domestic
    ? { booth: [800, 1500], registration: [0, 2000], travel: [1200, 3500], hotel: [350, 800], staff: [300, 800], shipping: [800, 3000], promotion: [500, 3000], service: [0, 2000] }
    : { booth: [2500, 6000], registration: [0, 3000], travel: [5000, 15000], hotel: [900, 2000], staff: [800, 2000], shipping: [5000, 20000], promotion: [1000, 5000], service: [1500, 6000] }

  const local = Boolean(params.originCity.trim()) && params.originCity.trim().toLowerCase() === exhibition.city.trim().toLowerCase()
  const travel = local ? [200, 800] : rates.travel
  const rooms = Math.max(1, Math.ceil(staff / 2))
  const nights = Math.max(1, days)
  const items: CostItem[] = []
  const assumptions: string[] = []

  const boothFee = exhibition.publicFees.map((fee) => feeToCny(fee, area)).find((value): value is number => value !== undefined)
  items.push({
    id: 'booth',
    label: '展位费',
    min: boothFee ?? Math.round(area * rates.booth[0]),
    max: boothFee ? Math.round(boothFee * 1.25) : Math.round(area * rates.booth[1]),
    note: boothFee ? `按公开价格测算（${area}㎡）` : `按 ${rates.booth[0]}–${rates.booth[1]} 元/㎡ 的行业区间估算（${area}㎡）`,
    sourceUrl: boothFee ? exhibition.publicFees.find((fee) => feeToCny(fee, area) === boothFee)?.sourceUrl : undefined,
  })
  items.push({ id: 'registration', label: '报名费', min: rates.registration[0], max: rates.registration[1], note: '主办方通常收取的注册/资料费区间' })
  const sponsorship = clamp(params.sponsorshipBudget || 0, 0, 10_000_000)
  items.push({ id: 'sponsorship', label: '赞助费', min: sponsorship, max: sponsorship, note: sponsorship > 0 ? '按计划赞助预算' : '未计划赞助，可按需追加' })
  items.push({ id: 'travel', label: '交通费', min: travel[0] * staff, max: travel[1] * staff, note: `${staff} 人往返${local ? '（同城）' : domestic ? '（国内）' : '（国际）'}` })
  items.push({ id: 'lodging', label: '住宿费', min: Math.round(rooms * nights * rates.hotel[0] * tier), max: Math.round(rooms * nights * rates.hotel[1] * tier), note: `${rooms} 间 × ${nights} 晚，${params.hotelTier === 'standard' ? '标准' : params.hotelTier === 'economy' ? '经济' : '高档'}档` })
  items.push({ id: 'staff', label: '人员费用', min: staff * days * rates.staff[0], max: staff * days * rates.staff[1], note: `${staff} 人 × ${days} 天，含差旅补贴` })
  items.push({ id: 'shipping', label: '产品运输费', min: rates.shipping[0], max: rates.shipping[1], note: '展品运输与报关/进场费区间' })
  items.push({ id: 'promotion', label: '宣传材料费', min: rates.promotion[0], max: rates.promotion[1], note: '展板、样册、礼品等' })
  items.push({ id: 'service', label: '翻译/现场服务费', min: rates.service[0], max: rates.service[1], note: domestic ? '可选项，按需支出' : '海外展会建议预留' })
  assumptions.push(`按 ${params.originCity || '企业所在地'} 出发、${staff} 人、${days} 天展期估算；币种统一为人民币。`)
  if (!boothFee) assumptions.push('展位费未找到公开报价，使用行业区间，实际以主办方报价为准。')
  assumptions.push('交通、住宿、人工为区间估算，未包含汇率波动与当地税费。')

  const sum = (list: CostItem[], ids: string[]) => list.filter((item) => ids.includes(item.id)).reduce((acc, item) => ({ min: acc.min + item.min, max: acc.max + item.max }), { min: 0, max: 0 })
  const allIds = items.map((item) => item.id)
  const booth = sum(items, allIds)
  const visit = sum(items, ['registration', 'travel', 'lodging', 'staff'])
  // 单独拜访按 2 天 2 晚估算，不含展位、运输、宣传与报名费。
  const contactNights = 2
  const contactDays = 2
  const contact = {
    min: travel[0] * staff + Math.round(rooms * contactNights * rates.hotel[0] * tier) + staff * contactDays * rates.staff[0],
    max: travel[1] * staff + Math.round(rooms * contactNights * rates.hotel[1] * tier) + staff * contactDays * rates.staff[1],
  }
  assumptions.push('“只拜访重点企业”按 2 天 2 晚、不含展位与宣传费用估算。')
  return { currency: 'CNY', items, totalMin: booth.min, totalMax: booth.max, modes: { booth, visit, contact }, assumptions }
}

/** 对比两次调查结果，产出可展示的变化记录。 */
export function diffExhibition(previous: Exhibition, next: Pick<Exhibition, 'startDate' | 'endDate' | 'registrationDeadline' | 'website' | 'publicFees' | 'exhibitors' | 'counts'>, at: string): ChangeRecord[] {
  const changes: ChangeRecord[] = []
  if (previous.startDate !== next.startDate || previous.endDate !== next.endDate) {
    changes.push({ at, type: 'date', detail: `展期由 ${previous.startDate || '未知'}–${previous.endDate || '未知'} 变为 ${next.startDate || '未知'}–${next.endDate || '未知'}` })
  }
  if (previous.registrationDeadline !== next.registrationDeadline) {
    changes.push({ at, type: 'deadline', detail: `报名截止由 ${previous.registrationDeadline || '未知'} 变为 ${next.registrationDeadline || '未知'}` })
  }
  if (previous.website !== next.website) {
    changes.push({ at, type: 'website', detail: `官网地址发生变化：${previous.website || '无'} → ${next.website || '无'}` })
  }
  const beforeNames = new Set(previous.exhibitors.map((item) => item.name.toLowerCase()))
  const afterNames = new Set(next.exhibitors.map((item) => item.name.toLowerCase()))
  const added = [...afterNames].filter((name) => !beforeNames.has(name))
  const removed = [...beforeNames].filter((name) => !afterNames.has(name))
  if (added.length || removed.length) {
    changes.push({ at, type: 'exhibitors', detail: `参展企业名单更新：新增 ${added.length} 家，移出 ${removed.length} 家${added.length ? `（新增如 ${next.exhibitors.find((item) => item.name.toLowerCase() === added[0])?.name}）` : ''}` })
  }
  const beforeMax = previous.publicFees.reduce((max, fee) => Math.max(max, fee.amount || 0), 0)
  const afterMax = next.publicFees.reduce((max, fee) => Math.max(max, fee.amount || 0), 0)
  if (beforeMax !== afterMax) changes.push({ at, type: 'fee', detail: `公开费用记录发生变化：${beforeMax} → ${afterMax}` })
  return changes
}

function money(value: number): string {
  return `¥${Math.round(value).toLocaleString('zh-CN')}`
}

/** 生成单展会 Markdown 报告（导出 PDF/CSV 之外的主报告）。 */
export function buildExhibitionReport(exhibition: Exhibition, profile: CompanyProfile): string {
  const byRole = (role: ExhibitorRole) => exhibition.exhibitors.filter((item) => item.role === role)
  const customerList = byRole('customer')
  const partnerList = byRole('partner')
  const channelList = byRole('channel')
  const supplierList = byRole('supplier')
  const competitorList = byRole('competitor')
  const lines: string[] = []
  const dateRange = exhibition.startDate ? `${exhibition.startDate}${exhibition.endDate && exhibition.endDate !== exhibition.startDate ? ` 至 ${exhibition.endDate}` : ''}` : '待确认'

  lines.push(`# ${exhibition.name} · 参展价值报告`, '')
  lines.push(`> 针对「${profile.name}」生成。结论：**${VERDICT_LABELS[exhibition.verdict]}**（综合评分 ${exhibition.score}/100）。`, '')
  lines.push('## 一、展会基本情况', '')
  lines.push('| 项目 | 内容 |', '| --- | --- |')
  lines.push(`| 展会名称 | ${exhibition.name} |`)
  if (exhibition.type) lines.push(`| 展会类型 | ${exhibition.type} |`)
  lines.push(`| 展期 | ${dateRange} |`)
  lines.push(`| 城市 / 国家 | ${[exhibition.city, exhibition.country].filter(Boolean).join('，') || '待确认'} |`)
  if (exhibition.venue) lines.push(`| 展馆 | ${exhibition.venue} |`)
  if (exhibition.organizer) lines.push(`| 主办方 | ${exhibition.organizer} |`)
  if (exhibition.theme) lines.push(`| 展会主题 | ${exhibition.theme} |`)
  if (exhibition.exhibitScope) lines.push(`| 展品范围 | ${exhibition.exhibitScope} |`)
  if (exhibition.participation) lines.push(`| 参展/观展方式 | ${exhibition.participation} |`)
  if (exhibition.registrationDeadline) lines.push(`| 报名截止 | ${exhibition.registrationDeadline} |`)
  if (exhibition.website) lines.push(`| 官网 | ${exhibition.website} |`)

  lines.push('', '## 二、推荐理由与判断', '')
  if (exhibition.verdictReason) lines.push(exhibition.verdictReason, '')
  if (exhibition.fitReasons.length) lines.push('**匹配点**', ...exhibition.fitReasons.map((reason) => `- ${reason}`), '')
  if (exhibition.mismatchReasons.length) lines.push('**不匹配/需注意**', ...exhibition.mismatchReasons.map((reason) => `- ${reason}`), '')
  lines.push(`企业构成：共 ${exhibition.counts.total} 家可识别企业，其中潜在客户 ${exhibition.counts.customer}、合作伙伴 ${exhibition.counts.partner}、渠道商 ${exhibition.counts.channel}、供应商 ${exhibition.counts.supplier}、竞争对手 ${exhibition.counts.competitor}。`, '')
  const modeSuggestion: Record<Verdict, string> = {
    attend: '参展：预订展位，并把重点客户约到展位',
    'visit-first': '先观展考察，现场确认客户密度后再决定是否参展',
    'contact-first': '只拜访重点企业，不设展位',
    confirm: '先观展或直接联系主办方确认关键信息后再决定',
    skip: '不建议专程前往，可改为线上跟进重点企业',
  }
  lines.push(`**建议方式**：${modeSuggestion[exhibition.verdict]}。`, '')

  const listSection = (title: string, items: Exhibitor[]) => {
    if (!items.length) return
    lines.push(`### ${title}`, '')
    for (const item of items.slice(0, 40)) {
      const meta = [item.country, item.booth ? `展位 ${item.booth}` : ''].filter(Boolean).join(' · ')
      lines.push(`- **${item.name}**${meta ? `（${meta}）` : ''}${item.reason ? ` — ${item.reason}` : ''}${item.website ? ` [官网](${item.website})` : ''}`)
    }
    lines.push('')
  }
  lines.push('## 三、参展企业名单', '')
  listSection('重点潜在客户', customerList)
  listSection('合作伙伴', partnerList)
  listSection('渠道商', channelList)
  listSection('供应商', supplierList)
  listSection('竞争对手', competitorList)
  if (!exhibition.exhibitors.length) lines.push('本次调查未取得可核实的参展企业名单。', '')

  lines.push('## 四、预计费用', '')
  lines.push('| 项目 | 下限 | 上限 | 说明 |', '| --- | ---: | ---: | --- |')
  for (const item of exhibition.cost.items) lines.push(`| ${item.label} | ${money(item.min)} | ${money(item.max)} | ${item.note || ''} |`)
  lines.push(`| **参展合计** | **${money(exhibition.cost.totalMin)}** | **${money(exhibition.cost.totalMax)}** | 含展位、运输与现场投入 |`)
  lines.push('', `- 只去观展：${money(exhibition.cost.modes.visit.min)}–${money(exhibition.cost.modes.visit.max)}`)
  lines.push(`- 只拜访重点企业：${money(exhibition.cost.modes.contact.min)}–${money(exhibition.cost.modes.contact.max)}`)
  lines.push('', ...exhibition.cost.assumptions.map((line) => `- ${line}`), '')
  if (exhibition.publicFees.length) {
    lines.push('公开报价线索：')
    for (const fee of exhibition.publicFees) {
      const amount = fee.amount !== undefined ? `${fee.amount}${fee.currency ? ` ${fee.currency}` : ''}${fee.unit ? `/${fee.unit.replace(/^\//, '')}` : ''}` : '金额未公开'
      lines.push(`- ${fee.label}：${amount}${fee.note ? `（${fee.note}）` : ''}${fee.sourceUrl ? ` — ${fee.sourceUrl}` : ''}`)
    }
    lines.push('')
  }
  lines.push('> 以上为估算区间，不是主办方报价；下单前请以官方报价单为准。', '')

  lines.push('## 五、建议接触的企业', '')
  const priority = [...customerList, ...partnerList].slice(0, 12)
  if (priority.length) {
    for (const item of priority) lines.push(`- ${item.name}：${item.reason || '建议提前预约，确认合作可能'}`)
  } else {
    lines.push('- 暂无可推荐的重点企业，建议先补齐参展企业名单。')
  }
  lines.push('')
  if (exhibition.actionPlan.length) {
    lines.push('### 行动清单', '')
    exhibition.actionPlan.forEach((item, index) => lines.push(`${index + 1}. ${item}`))
    lines.push('')
  }

  lines.push('## 六、报名时间与注意事项', '')
  lines.push(`- 报名截止：${exhibition.registrationDeadline || '未公开，建议直接联系主办方确认'}`)
  lines.push(`- 建议在截止前至少 4 周完成展位确认与行程预订。`)
  lines.push(`- 展位价格与规则以主办方最新通知为准。`)
  if (exhibition.changes.length) {
    lines.push('', '### 最近更新', '')
    for (const change of exhibition.changes.slice(-5)) lines.push(`- ${change.at.slice(0, 10)}：${change.detail}`)
  }
  lines.push('')
  lines.push('## 七、信息来源', '')
  if (exhibition.sources.length) {
    for (const source of exhibition.sources) lines.push(`- [${source.title}](${source.url})（${source.status === 'verified' ? '已核验' : '待核验'}，采集于 ${source.capturedAt.slice(0, 10)}）`)
  } else {
    lines.push('- 本次调查未记录到可公开验证的来源。')
  }
  lines.push('', '---', `报告生成时间：${new Date().toISOString().slice(0, 19).replace('T', ' ')}（UTC）`)
  return lines.join('\n')
}

export function buildDiscoveryPrompt(profile: CompanyProfile, options: { excludeNames?: string[]; round?: number } = {}): string {
  const filters = profile.filters
  const filterLines = [
    filters.countries.length ? `限定国家/地区：${filters.countries.join('、')}` : '',
    filters.years.length ? `限定年份：${filters.years.join('、')}` : '',
    filters.industries.length ? `限定行业：${filters.industries.join('、')}` : '',
    filters.scale === 'large' ? '只看大型展会' : filters.scale === 'international' ? '只看国际展会' : '',
    filters.purpose === 'customers' ? '优先找能接触客户的展会' : filters.purpose === 'partners' ? '优先找能接触合作伙伴的展会' : '',
    filters.note ? `补充限制：${filters.note}` : '',
  ].filter(Boolean)
  return [
    '你是展会情报研究员。只使用你实际访问到的公开网页与已挂载的 MCP 工具，绝不编造展会、日期、价格或公司。',
    '遇到 JavaScript 渲染、访问拦截、分页或正文不完整的页面时，调用 Playwright MCP（browser_open / browser_read / browser_click / browser_wait / browser_paginate / browser_links）。正文为空、内容在图片/画布/PDF 预览中，或需要核对图片里的文字时，用 browser_ocr 截图识别（browser_screenshot 可保存截图留证）。',
    '',
    '## 用户企业',
    `名称：${profile.name}`,
    profile.website ? `官网：${profile.website}` : '',
    `主营业务：${profile.description}`,
    profile.products.length ? `主要产品：${profile.products.join('、')}` : '',
    profile.customers.length ? `服务客户：${profile.customers.join('、')}` : '',
    `所属行业：${profile.industry}`,
    profile.targetMarkets.length ? `目标市场：${profile.targetMarkets.join('、')}` : '',
    '',
    '## 搜索限制',
    filterLines.length ? filterLines.join('\n') : '无额外限制',
    '',
    '## 任务',
    '尽可能穷尽地找出该企业相关、真实存在的展会，不设数量上限。按不同检索面分批检索，不要只查一个关键词：',
    '- 行业展、专业展、国际展、区域展、采购会、商务对接活动、行业论坛、技术峰会；',
    '- 行业协会/学会年度活动日历、会展中心排期表、贸促机构与组团参展计划、行业媒体展会日历；',
    '- 上游供应链展会与下游应用行业展会（例如设备厂商可关注汽车、电子、新能源、包装等应用展）；',
    '- 国内主要城市与目标海外市场的同类展会。',
    options.round && options.round > 1 ? `这是第 ${options.round} 轮补充检索：请在已有关键词之外换用新的检索角度（不同主办方、场馆、协会、国家/地区、上下游行业），只补充尚未列出的展会。` : '',
    options.excludeNames?.length ? `以下展会已经收录，本轮不要重复输出：${options.excludeNames.slice(-80).join('、')}。` : '',
    '本轮输出 8–15 个你最确定的展会；后续轮次会继续补充，不要为了凑数编造，也不要把明显不相关或已停办的展会列进来。',
    '发现阶段只确认：名称、类型、开始/结束日期、城市、国家、官网、匹配分与理由。展馆、主办方、主题、展品范围、参展方式、报名截止、公开费用可以留空，留给后续「详情调查」阶段补齐，不要在发现阶段逐项深挖。',
    '每个展会只收录 1–2 个支撑来源（通常是官网），避免为单个展会抓取大量页面。',
    '不确定的字段留空字符串，不要猜测；日期用 YYYY-MM-DD。fitScore 为 0–100 的匹配分，fitReasons 给 2–4 条匹配理由，mismatchReasons 给 0–2 条不匹配点。',
    'publicFees 只在找到公开价格时填写，注明币种与单位（如 元/㎡），并给出 sourceUrl。sources 收录你实际访问并支撑该展会的公开网页（至少官网）。',
    '',
    '## 输出格式',
    '先简要说明检索路径，然后**只输出一个 JSON 对象**（可以放在 ```json 代码块里），结构如下：',
    JSON.stringify({
      exhibitions: [{
        name: '展会名称', type: '行业展 / 专业展 / 国际展 / 区域展 / 采购会 / 论坛 / 峰会', startDate: '2027-03-01', endDate: '2027-03-03', city: '城市', country: '国家', venue: '展馆',
        organizer: '主办方', theme: '主题', exhibitScope: '展品范围', participation: '参展方式', registrationDeadline: '2027-01-31',
        website: 'https://example.com', fitScore: 78, fitReasons: ['理由'], mismatchReasons: ['风险'],
        publicFees: [{ label: '展位费', amount: 1200, currency: 'CNY', unit: '元/㎡', note: '标准展位', sourceUrl: 'https://example.com/price' }],
        sources: [{ title: '官网', url: 'https://example.com', excerpt: '关键信息摘录' }],
      }],
    }, null, 2),
  ].filter(Boolean).join('\n')
}

export function buildDetailPrompt(profile: CompanyProfile, exhibition: Exhibition): string {
  return [
    '你是展会参展企业调查员。只使用你实际访问到的公开网页与已挂载的 MCP 工具，绝不编造公司、展位号或合作关系。',
    '遇到 JavaScript 渲染、访问拦截、分页或正文不完整的页面时，调用 Playwright MCP（browser_open / browser_read / browser_click / browser_wait / browser_paginate / browser_links）。正文为空、内容在图片/画布/PDF 预览中，或需要核对图片里的文字时，用 browser_ocr 截图识别（browser_screenshot 可保存截图留证）。',
    '',
    '## 用户企业',
    `${profile.name}｜${profile.industry}｜${profile.description}`,
    profile.products.length ? `产品：${profile.products.join('、')}` : '',
    '',
    '## 目标展会',
    `${exhibition.name}｜${exhibition.startDate || '日期未知'}｜${[exhibition.city, exhibition.country].filter(Boolean).join('，')}`,
    exhibition.website ? `官网：${exhibition.website}` : '',
    '',
    '## 任务',
    '1. 打开展会官网的参展商名录 / 展商列表 / 赞助商 / 嘉宾页，尽量完整收录公开的参展企业（目标 12–40 家；名录更长时优先全部收录主要展商），记录公司名、官网、国家、展位号（若有）。',
    '2. 优先用企业官网、展会官网、新闻、行业网站核对每家企业的主营业务，再判断它与用户企业的关系：',
    '   customer=潜在客户（会采购/使用用户的产品或同类设备）；partner=合作伙伴（技术、渠道、生态互补）；channel=渠道商（代理/经销/集成）；supplier=供应商；competitor=竞争对手；irrelevant=关系较小。',
    '   每条给出 reason 与 0–1 的 confidence，判断依据不足时降低 confidence 并写明原因。',
    '3. 如果用户配置了企查查 MCP，可用它补充工商信息，但企业名单仍以公开网页为准。',
    '4. 给出参展建议 verdict（attend / visit-first / contact-first / confirm / skip）与 verdictReason，并给出 3–6 条可直接执行的 actionPlan。',
    '5. notableUpdates 记录重点客户/伙伴最近 12 个月公开可核实的新动态（扩产、融资、新品、人事、参展计划），没有就留空数组，不要编造。',
    '6. 不确定的字段留空，不要猜测；sources 收录你实际访问的网页（展会官网、企业官网、新闻）。',
    '',
    '## 输出格式',
    '先简要说明检索路径，然后**只输出一个 JSON 对象**（可放在 ```json 代码块里），结构如下：',
    JSON.stringify({
      overview: { venue: '展馆', organizer: '主办方', theme: '主题', exhibitScope: '展品范围', participation: '参展方式', registrationDeadline: '2027-01-31', website: 'https://example.com' },
      exhibitors: [{ name: '公司名', website: 'https://example.com', country: '中国', booth: 'A12', role: 'customer', reason: '采购工业视觉检测设备', confidence: 0.8 }],
      verdict: 'attend',
      verdictReason: '客户密度高，且与公司产品线匹配。',
      actionPlan: ['开展前 6 周联系前 10 家重点客户', '预订 18㎡ 标准展位'],
      notableUpdates: ['重点客户甲公司 2026 年扩建产线（公开新闻，需核实）'],
      publicFees: [{ label: '展位费', amount: 1200, currency: 'CNY', unit: '元/㎡', sourceUrl: 'https://example.com/price' }],
      sources: [{ title: '参展商名录', url: 'https://example.com/exhibitors', excerpt: '共 320 家参展企业' }],
    }, null, 2),
  ].filter(Boolean).join('\n')
}
