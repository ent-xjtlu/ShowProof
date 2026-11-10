import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildExhibitionReport,
  computeCounts,
  deriveVerdict,
  diffExhibition,
  estimateCosts,
  extractJsonObject,
  normalizeDetailPayload,
  normalizeDiscoveryPayload,
  scoreExhibition,
  type CompanyProfile,
  type Exhibition,
} from '../server/exhibition.js'

const profile: CompanyProfile = {
  id: 'cmp_1',
  userId: 'usr_1',
  name: '磐屿工业视觉',
  website: 'https://example.com',
  description: '生产工业视觉检测设备',
  products: ['工业相机', '视觉检测系统'],
  customers: ['汽车零部件厂'],
  industry: '工业自动化',
  targetMarkets: ['华东', '德国'],
  filters: { countries: ['中国'], years: [2027], industries: ['汽车'], scale: 'any', purpose: 'customers' },
  cost: { boothAreaSqm: 18, staffCount: 4, days: 3, originCity: '苏州', hotelTier: 'standard', sponsorshipBudget: 0 },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function sampleExhibition(overrides: Partial<Exhibition> = {}): Exhibition {
  const base: Exhibition = {
    id: 'exh_1',
    userId: 'usr_1',
    discoveryId: 'dsc_1',
    status: 'ready',
    name: '中国国际工业博览会',
    startDate: '2027-09-15',
    endDate: '2027-09-19',
    city: '上海',
    country: '中国',
    venue: '国家会展中心',
    organizer: '东浩兰生',
    theme: '工业自动化',
    exhibitScope: '工业机器人、视觉系统',
    participation: '标准展位 / 光地',
    registrationDeadline: '2027-07-31',
    website: 'https://example.com/expo',
    fitScore: 82,
    fitReasons: ['展品范围覆盖视觉检测', '观众以制造业为主'],
    mismatchReasons: [],
    exhibitors: [],
    counts: computeCounts([]),
    score: 0,
    verdict: 'confirm',
    verdictReason: '',
    actionPlan: [],
    publicFees: [],
    cost: estimateCosts(profile, { country: '中国', city: '上海', startDate: '2027-09-15', endDate: '2027-09-19', publicFees: [] }),
    sources: [],
    watched: false,
    changes: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  return { ...base, ...overrides }
}

test('extractJsonObject tolerates prose and code fences', () => {
  const payload = extractJsonObject('检索完成。\n```json\n{"exhibitions":[{"name":"A","nested":{"x":1}}]}\n```\n以上。')
  assert.deepEqual(payload, { exhibitions: [{ name: 'A', nested: { x: 1 } }] })
  assert.throws(() => extractJsonObject('没有 JSON'), /JSON_NOT_FOUND/)
})

test('extractJsonObject repairs trailing commas', () => {
  const payload = extractJsonObject('{"exhibitions":[{"name":"A","tags":["x",],},],}')
  assert.equal((payload as { exhibitions: Array<{ name: string }> }).exhibitions[0].name, 'A')
})

test('normalizeDiscoveryPayload keeps real URLs, dedupes and normalizes dates', () => {
  const list = normalizeDiscoveryPayload({
    exhibitions: [
      {
        name: ' 2027 上海工业展 ',
        startDate: '2027年9月15日',
        endDate: '2027-09-19',
        city: '上海',
        country: '中国',
        website: 'https://expo.example.com',
        type: '行业展',
        fitScore: 130,
        fitReasons: ['匹配', ''],
        publicFees: [{ label: '展位费', amount: '1200', currency: 'CNY', unit: '元/㎡', sourceUrl: 'https://expo.example.com/price' }],
        sources: [{ title: '官网', url: 'https://expo.example.com' }, { title: '坏链接', url: 'ftp://x' }, { title: '重复', url: 'https://expo.example.com' }],
      },
      { name: '2027 上海工业展', city: '上海' },
      { name: '', city: '上海' },
    ],
  })
  assert.equal(list.length, 1)
  assert.equal(list[0].name, '2027 上海工业展')
  assert.equal(list[0].startDate, '2027-09-15')
  assert.equal(list[0].fitScore, 100)
  assert.equal(list[0].fitReasons.length, 1)
  assert.equal(list[0].sources.length, 1)
  assert.equal(list[0].publicFees[0].amount, 1200)
  assert.equal(list[0].type, '行业展')
})

test('normalizeDetailPayload maps Chinese roles and clamps confidence', () => {
  const detail = normalizeDetailPayload({
    exhibitors: [
      { name: '甲公司', role: '潜在客户', reason: '采购视觉设备', confidence: 1.7, website: 'https://a.example.com' },
      { name: '乙公司', role: '渠道商', reason: '代理', confidence: -1 },
      { name: '甲公司', role: '竞争对手' },
      { name: '丙公司', role: '未知角色', confidence: 0.4 },
    ],
    verdict: 'attend',
    verdictReason: '客户密度高',
    actionPlan: ['联系甲公司'],
    publicFees: [],
    overview: { venue: '中心展馆', website: 'https://expo.example.com' },
    notableUpdates: ['甲公司扩建产线', ''],
    sources: [{ title: '名录', url: 'https://expo.example.com/list' }],
  })
  assert.deepEqual(detail.exhibitors.map((item) => item.role), ['customer', 'channel', 'irrelevant'])
  assert.equal(detail.exhibitors[0].confidence, 1)
  assert.equal(detail.exhibitors[1].confidence, 0)
  assert.equal(detail.exhibitors[2].roleNote, '未知角色')
  assert.equal(detail.overview.venue, '中心展馆')
  assert.equal(detail.sources.length, 1)
  assert.deepEqual(detail.notableUpdates, ['甲公司扩建产线'])
  assert.throws(() => normalizeDetailPayload({ exhibitors: [] }), /DETAIL_NO_EXHIBITORS/)
})

test('counts, score and verdict follow the documented rules', () => {
  const exhibitors = Array.from({ length: 6 }, (_, index) => ({
    id: `exb_${index}`,
    name: `客户${index}`,
    role: 'customer' as const,
    reason: '',
    confidence: 0.8,
    evidenceIds: [],
  }))
  const exhibitorsWithPartners = [
    ...exhibitors,
    { id: 'exb_p1', name: '伙伴1', role: 'partner' as const, reason: '', confidence: 0.7, evidenceIds: [] },
    { id: 'exb_p2', name: '伙伴2', role: 'partner' as const, reason: '', confidence: 0.7, evidenceIds: [] },
    { id: 'exb_p3', name: '伙伴3', role: 'partner' as const, reason: '', confidence: 0.7, evidenceIds: [] },
    { id: 'exb_c1', name: '竞品1', role: 'competitor' as const, reason: '', confidence: 0.7, evidenceIds: [] },
  ]
  const counts = computeCounts(exhibitorsWithPartners)
  assert.equal(counts.customer, 6)
  assert.equal(counts.partner, 3)
  assert.equal(counts.total, 10)
  const score = scoreExhibition(95, counts)
  assert.equal(score, Math.round(95 * 0.5 + 18 + 7.5 - 0.5))
  assert.equal(deriveVerdict(score, counts), 'attend')
  assert.equal(deriveVerdict(30, computeCounts([])), 'skip')
  assert.equal(deriveVerdict(60, { ...computeCounts([]), customer: 2 }), 'visit-first')
  assert.equal(deriveVerdict(50, { ...computeCounts([]), partner: 3 }), 'contact-first')
})

test('cost estimation is deterministic and uses public booth price when present', () => {
  const domestic = estimateCosts(profile, { country: '中国', city: '上海', startDate: '2027-09-15', endDate: '2027-09-19', publicFees: [] })
  assert.equal(domestic.currency, 'CNY')
  assert.ok(domestic.totalMin > 0 && domestic.totalMax > domestic.totalMin)
  assert.ok(domestic.modes.booth.min > domestic.modes.visit.min)
  assert.ok(domestic.modes.visit.min >= domestic.modes.contact.min)

  const withFee = estimateCosts(profile, {
    country: '中国',
    city: '上海',
    startDate: '2027-09-15',
    endDate: '2027-09-19',
    publicFees: [{ label: '展位费', amount: 1000, currency: 'CNY', unit: '元/㎡' }],
  })
  const booth = withFee.items.find((item) => item.id === 'booth')
  assert.equal(booth?.min, 18000)
  assert.equal(booth?.max, 22500)

  const overseas = estimateCosts(profile, { country: '德国', city: '汉诺威', startDate: '2027-04-01', endDate: '2027-04-05', publicFees: [] })
  assert.ok(overseas.totalMin > domestic.totalMin)
  assert.ok(overseas.assumptions.some((line) => line.includes('估算')))

  const sponsored = estimateCosts({ ...profile, cost: { ...profile.cost, sponsorshipBudget: 50000 } }, { country: '中国', city: '上海', startDate: '2027-09-15', endDate: '2027-09-19', publicFees: [] })
  const sponsorship = sponsored.items.find((item) => item.id === 'sponsorship')
  assert.equal(sponsorship?.min, 50000)
  assert.equal(sponsored.totalMin - domestic.totalMin, 50000)
})

test('diffExhibition reports date, deadline and exhibitor changes', () => {
  const previous = sampleExhibition({
    exhibitors: [{ id: 'exb_1', name: '甲公司', role: 'customer', reason: '', confidence: 0.8, evidenceIds: [] }],
  })
  const changes = diffExhibition(previous, {
    startDate: '2027-09-20',
    endDate: '2027-09-24',
    registrationDeadline: '2027-08-15',
    website: previous.website,
    publicFees: [],
    exhibitors: [
      { id: 'exb_2', name: '乙公司', role: 'partner', reason: '', confidence: 0.7, evidenceIds: [] },
    ],
    counts: computeCounts([]),
  }, '2026-05-01T00:00:00.000Z')
  const types = changes.map((change) => change.type)
  assert.ok(types.includes('date'))
  assert.ok(types.includes('deadline'))
  assert.ok(types.includes('exhibitors'))
  assert.match(changes.find((change) => change.type === 'exhibitors')!.detail, /新增 1 家，移出 1 家/)
})

test('report contains every required section', () => {
  const exhibition = sampleExhibition({
    exhibitors: [
      { id: 'exb_1', name: '甲公司', role: 'customer', reason: '采购视觉设备', confidence: 0.9, evidenceIds: [] },
      { id: 'exb_2', name: '乙公司', role: 'competitor', reason: '同类产品', confidence: 0.8, evidenceIds: [] },
    ],
    counts: computeCounts([
      { id: 'exb_1', name: '甲公司', role: 'customer', reason: '采购视觉设备', confidence: 0.9, evidenceIds: [] },
      { id: 'exb_2', name: '乙公司', role: 'competitor', reason: '同类产品', confidence: 0.8, evidenceIds: [] },
    ]),
  })
  exhibition.score = scoreExhibition(88, exhibition.counts)
  exhibition.verdict = deriveVerdict(exhibition.score, exhibition.counts)
  exhibition.verdictReason = '客户密度高'
  exhibition.actionPlan = ['联系甲公司']
  exhibition.sources = [{ id: 'ev_1', title: '官网', url: 'https://example.com/expo', type: 'web', capturedAt: '2026-01-01T00:00:00.000Z', excerpt: '展会信息', status: 'verified' }]
  const report = buildExhibitionReport(exhibition, profile)
  for (const heading of ['展会基本情况', '推荐理由与判断', '参展企业名单', '预计费用', '建议接触的企业', '报名时间与注意事项', '信息来源']) {
    assert.ok(report.includes(`## `) && report.includes(heading), `missing ${heading}`)
  }
  assert.match(report, /建议参加|建议先观展|建议提前联系重点企业|需要进一步确认|暂不建议参加/)
  assert.match(report, /¥/)
})
