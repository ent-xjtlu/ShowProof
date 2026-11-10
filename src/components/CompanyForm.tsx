import { useState } from 'react'
import type { CompanyProfile, CostParams, SearchFilters } from '../domain'
import { SCALE_LABELS, PURPOSE_LABELS } from '../domain'
import type { CompanyInput } from '../lib/workspaceApi'

const splitList = (value: string): string[] =>
  value
    .split(/[,，、;；\n]/)
    .map((item) => item.trim())
    .filter(Boolean)

interface Props {
  profile: CompanyProfile | null
  saving: boolean
  error?: string | null
  onSubmit: (input: CompanyInput, options: { start: boolean }) => void
}

export function CompanyForm({ profile, saving, error, onSubmit }: Props) {
  const [name, setName] = useState(profile?.name ?? '')
  const [website, setWebsite] = useState(profile?.website ?? '')
  const [description, setDescription] = useState(profile?.description ?? '')
  const [products, setProducts] = useState((profile?.products ?? []).join('、'))
  const [customers, setCustomers] = useState((profile?.customers ?? []).join('、'))
  const [industry, setIndustry] = useState(profile?.industry ?? '')
  const [targetMarkets, setTargetMarkets] = useState((profile?.targetMarkets ?? []).join('、'))
  const [countries, setCountries] = useState((profile?.filters.countries ?? []).join('、'))
  const [years, setYears] = useState((profile?.filters.years ?? []).join('、'))
  const [filterIndustries, setFilterIndustries] = useState((profile?.filters.industries ?? []).join('、'))
  const [scale, setScale] = useState<SearchFilters['scale']>(profile?.filters.scale ?? 'any')
  const [purpose, setPurpose] = useState<SearchFilters['purpose']>(profile?.filters.purpose ?? 'any')
  const [note, setNote] = useState(profile?.filters.note ?? '')
  const [originCity, setOriginCity] = useState(profile?.cost.originCity ?? '')
  const [boothAreaSqm, setBoothAreaSqm] = useState(String(profile?.cost.boothAreaSqm ?? 18))
  const [staffCount, setStaffCount] = useState(String(profile?.cost.staffCount ?? 4))
  const [hotelTier, setHotelTier] = useState<CostParams['hotelTier']>(profile?.cost.hotelTier ?? 'standard')
  const [sponsorshipBudget, setSponsorshipBudget] = useState(String(profile?.cost.sponsorshipBudget ?? 0))
  const [localError, setLocalError] = useState<string | null>(null)

  const submit = (start: boolean) => {
    if (!name.trim()) return setLocalError('请填写企业名称。')
    if (!description.trim() && !website.trim()) return setLocalError('请至少填写主营业务或官网。')
    setLocalError(null)
    onSubmit(
      {
        name: name.trim(),
        website: website.trim() || undefined,
        description: description.trim(),
        products: splitList(products),
        customers: splitList(customers),
        industry: industry.trim(),
        targetMarkets: splitList(targetMarkets),
        filters: {
          countries: splitList(countries),
          years: splitList(years).map((item) => Number.parseInt(item, 10)).filter((item) => Number.isFinite(item)),
          industries: splitList(filterIndustries),
          scale,
          purpose,
          note: note.trim() || undefined,
        },
        cost: {
          boothAreaSqm: Number(boothAreaSqm) || 18,
          staffCount: Number(staffCount) || 4,
          days: profile?.cost.days ?? 3,
          originCity: originCity.trim(),
          hotelTier,
          sponsorshipBudget: Number(sponsorshipBudget) || 0,
        },
      },
      { start },
    )
  }

  const message = localError || error

  return (
    <section className="panel profile">
      <header className="panel__head">
        <div>
          <p className="eyebrow mono">COMPANY PROFILE · 企业画像</p>
          <h1 className="panel__title">{profile ? '企业画像与检索条件' : '先认识一下你的企业'}</h1>
          <p className="panel__lede">
            软件据此寻找相关展会、判断参展企业关系并估算费用。填得越具体，筛选越准。
          </p>
        </div>
      </header>

      <form className="form" onSubmit={(event) => { event.preventDefault(); submit(true) }}>
        <fieldset className="form__group">
          <legend className="form__legend mono">01 · 企业基本信息</legend>
          <div className="form__grid">
            <label className="field">
              <span className="field__label">企业名称 *</span>
              <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：磐屿工业视觉" />
            </label>
            <label className="field">
              <span className="field__label">官网</span>
              <input className="input" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://example.com" />
            </label>
            <label className="field field--wide">
              <span className="field__label">主营业务 *</span>
              <textarea className="input input--area" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="例如：生产工业视觉检测设备，服务汽车零部件与电子制造产线。" />
            </label>
            <label className="field">
              <span className="field__label">主要产品</span>
              <input className="input" value={products} onChange={(event) => setProducts(event.target.value)} placeholder="用顿号分隔，如：工业相机、视觉检测系统" />
            </label>
            <label className="field">
              <span className="field__label">服务客户</span>
              <input className="input" value={customers} onChange={(event) => setCustomers(event.target.value)} placeholder="如：汽车零部件厂、电子代工厂" />
            </label>
            <label className="field">
              <span className="field__label">所属行业</span>
              <input className="input" value={industry} onChange={(event) => setIndustry(event.target.value)} placeholder="如：工业自动化" />
            </label>
            <label className="field">
              <span className="field__label">想进入的市场</span>
              <input className="input" value={targetMarkets} onChange={(event) => setTargetMarkets(event.target.value)} placeholder="如：华东、德国、东南亚" />
            </label>
          </div>
        </fieldset>

        <fieldset className="form__group">
          <legend className="form__legend mono">02 · 展会筛选条件（可选）</legend>
          <div className="form__grid">
            <label className="field">
              <span className="field__label">国家 / 地区</span>
              <input className="input" value={countries} onChange={(event) => setCountries(event.target.value)} placeholder="如：中国、德国；留空不限" />
            </label>
            <label className="field">
              <span className="field__label">年份</span>
              <input className="input" value={years} onChange={(event) => setYears(event.target.value)} placeholder="如：2027、2028" />
            </label>
            <label className="field">
              <span className="field__label">关注行业</span>
              <input className="input" value={filterIndustries} onChange={(event) => setFilterIndustries(event.target.value)} placeholder="如：汽车、电子、新能源" />
            </label>
            <label className="field">
              <span className="field__label">展会规模</span>
              <select className="input" value={scale} onChange={(event) => setScale(event.target.value as SearchFilters['scale'])}>
                {(Object.keys(SCALE_LABELS) as SearchFilters['scale'][]).map((key) => <option key={key} value={key}>{SCALE_LABELS[key]}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">检索目的</span>
              <select className="input" value={purpose} onChange={(event) => setPurpose(event.target.value as SearchFilters['purpose'])}>
                {(Object.keys(PURPOSE_LABELS) as SearchFilters['purpose'][]).map((key) => <option key={key} value={key}>{PURPOSE_LABELS[key]}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">补充限制</span>
              <input className="input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="如：只看华东地区、2027 年上半年" />
            </label>
          </div>
        </fieldset>

        <fieldset className="form__group">
          <legend className="form__legend mono">03 · 费用估算参数</legend>
          <div className="form__grid">
            <label className="field">
              <span className="field__label">出发城市</span>
              <input className="input" value={originCity} onChange={(event) => setOriginCity(event.target.value)} placeholder="如：苏州" />
            </label>
            <label className="field">
              <span className="field__label">展位面积（㎡）</span>
              <input className="input" inputMode="numeric" value={boothAreaSqm} onChange={(event) => setBoothAreaSqm(event.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">参展人数</span>
              <input className="input" inputMode="numeric" value={staffCount} onChange={(event) => setStaffCount(event.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">住宿档位</span>
              <select className="input" value={hotelTier} onChange={(event) => setHotelTier(event.target.value as CostParams['hotelTier'])}>
                <option value="economy">经济</option>
                <option value="standard">标准</option>
                <option value="premium">高档</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">计划赞助预算（元，可选）</span>
              <input className="input" inputMode="numeric" value={sponsorshipBudget} onChange={(event) => setSponsorshipBudget(event.target.value)} placeholder="0 表示不赞助" />
            </label>
          </div>
        </fieldset>

        {message && <p className="form__error" role="alert">{message}</p>}

        <div className="form__actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? '正在保存…' : '保存并开始找展会'}
            <span aria-hidden>↗</span>
          </button>
          <button type="button" className="btn btn--ghost" disabled={saving} onClick={() => submit(false)}>
            仅保存
          </button>
          <span className="form__hint mono">展会检索会调用已配置的模型连接，通常需要几分钟</span>
        </div>
      </form>
    </section>
  )
}
