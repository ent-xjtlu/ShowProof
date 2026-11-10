import { useState } from 'react'
import type { CompanyProfile, CostParams, SearchFilters } from '../domain'
import { SCALE_LABELS, PURPOSE_LABELS } from '../domain'
import type { CompanyInput } from '../lib/workspaceApi'
import { useI18n } from '../i18n'

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
  const { t } = useI18n()
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
    if (!name.trim()) return setLocalError(t('profile.requiredName'))
    if (!description.trim() && !website.trim()) return setLocalError(t('profile.requiredDescription'))
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
          <p className="eyebrow mono">{t('profile.eyebrow')}</p>
          <h1 className="panel__title">{profile ? t('profile.titleExisting') : t('profile.titleNew')}</h1>
          <p className="panel__lede">{t('profile.lede')}</p>
        </div>
      </header>

      <form className="form" onSubmit={(event) => { event.preventDefault(); submit(true) }}>
        <fieldset className="form__group">
          <legend className="form__legend mono">{t('profile.basic')}</legend>
          <div className="form__grid">
            <label className="field">
              <span className="field__label">{t('profile.name')}</span>
              <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：磐屿工业视觉" />
            </label>
            <label className="field">
              <span className="field__label">{t('profile.website')}</span>
              <input className="input" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://example.com" />
            </label>
            <label className="field field--wide">
              <span className="field__label">{t('profile.business')}</span>
              <textarea className="input input--area" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="例如：生产工业视觉检测设备，服务汽车零部件与电子制造产线。" />
            </label>
            <label className="field">
              <span className="field__label">{t('profile.products')}</span>
              <input className="input" value={products} onChange={(event) => setProducts(event.target.value)} placeholder="用顿号分隔，如：工业相机、视觉检测系统" />
            </label>
            <label className="field">
              <span className="field__label">{t('profile.customers')}</span>
              <input className="input" value={customers} onChange={(event) => setCustomers(event.target.value)} placeholder="如：汽车零部件厂、电子代工厂" />
            </label>
            <label className="field">
              <span className="field__label">{t('profile.industry')}</span>
              <input className="input" value={industry} onChange={(event) => setIndustry(event.target.value)} placeholder="如：工业自动化" />
            </label>
            <label className="field">
              <span className="field__label">{t('profile.markets')}</span>
              <input className="input" value={targetMarkets} onChange={(event) => setTargetMarkets(event.target.value)} placeholder="如：华东、德国、东南亚" />
            </label>
          </div>
        </fieldset>

        <fieldset className="form__group">
          <legend className="form__legend mono">{t('profile.filters')}</legend>
          <div className="form__grid">
            <label className="field">
              <span className="field__label">{t('profile.countries')}</span>
              <input className="input" value={countries} onChange={(event) => setCountries(event.target.value)} placeholder="如：中国、德国；留空不限" />
            </label>
            <label className="field">
              <span className="field__label">{t('profile.years')}</span>
              <input className="input" value={years} onChange={(event) => setYears(event.target.value)} placeholder="如：2027、2028" />
            </label>
            <label className="field">
              <span className="field__label">{t('profile.focusIndustries')}</span>
              <input className="input" value={filterIndustries} onChange={(event) => setFilterIndustries(event.target.value)} placeholder="如：汽车、电子、新能源" />
            </label>
            <label className="field">
              <span className="field__label">{t('profile.scale')}</span>
              <select className="input" value={scale} onChange={(event) => setScale(event.target.value as SearchFilters['scale'])}>
                {(Object.keys(SCALE_LABELS) as SearchFilters['scale'][]).map((key) => <option key={key} value={key}>{t(`domain.scale.${key}`)}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">{t('profile.purpose')}</span>
              <select className="input" value={purpose} onChange={(event) => setPurpose(event.target.value as SearchFilters['purpose'])}>
                {(Object.keys(PURPOSE_LABELS) as SearchFilters['purpose'][]).map((key) => <option key={key} value={key}>{t(`domain.purpose.${key}`)}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">{t('profile.note')}</span>
              <input className="input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="如：只看华东地区、2027 年上半年" />
            </label>
          </div>
        </fieldset>

        <fieldset className="form__group">
          <legend className="form__legend mono">{t('profile.cost')}</legend>
          <div className="form__grid">
            <label className="field">
              <span className="field__label">{t('profile.originCity')}</span>
              <input className="input" value={originCity} onChange={(event) => setOriginCity(event.target.value)} placeholder="如：苏州" />
            </label>
            <label className="field">
              <span className="field__label">{t('profile.boothArea')}</span>
              <input className="input" inputMode="numeric" value={boothAreaSqm} onChange={(event) => setBoothAreaSqm(event.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">{t('profile.staff')}</span>
              <input className="input" inputMode="numeric" value={staffCount} onChange={(event) => setStaffCount(event.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">{t('profile.hotel')}</span>
              <select className="input" value={hotelTier} onChange={(event) => setHotelTier(event.target.value as CostParams['hotelTier'])}>
                <option value="economy">{t('domain.hotel.economy')}</option>
                <option value="standard">{t('domain.hotel.standard')}</option>
                <option value="premium">{t('domain.hotel.premium')}</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">{t('profile.budget')}</span>
              <input className="input" inputMode="numeric" value={sponsorshipBudget} onChange={(event) => setSponsorshipBudget(event.target.value)} placeholder="0 表示不赞助" />
            </label>
          </div>
        </fieldset>

        {message && <p className="form__error" role="alert">{message}</p>}

        <div className="form__actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? t('profile.saving') : t('profile.saveStart')}
            <span aria-hidden>↗</span>
          </button>
          <button type="button" className="btn btn--ghost" disabled={saving} onClick={() => submit(false)}>
            {t('profile.saveOnly')}
          </button>
          <span className="form__hint mono">{t('profile.hint')}</span>
        </div>
      </form>
    </section>
  )
}
