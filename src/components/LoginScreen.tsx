import { FormEvent, useState } from 'react'
import { useI18n } from '../i18n'

interface User {
  id: string
  email: string
  name: string
}

interface Props {
  setupRequired: boolean
  onLogin: (user: User) => void
}

export function LoginScreen({ setupRequired, onLogin }: Props) {
  const { t, toggleLocale } = useI18n()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(setupRequired ? '/api/auth/setup' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(setupRequired ? { name } : {}), email, password }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || t('login.error'))
      localStorage.setItem('domel_token', payload.token)
      onLogin(payload.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-screen">
      <div className="login-screen__grid" aria-hidden="true" />
      <section className="login-card">
        <button type="button" className="topbar__detail" onClick={toggleLocale}>{t('locale.switch')}</button>
        <div className="login-card__brand">
          <span className="brand__mark" aria-hidden />
          <div>
            <b>拾证</b>
            <small>{t('brand.subtitle')}</small>
          </div>
        </div>
        <p className="login-card__eyebrow mono">EXHIBITION INTEL DESK · SECURE WORKSPACE</p>
        <h1>{t('login.title')}</h1>
        <p className="login-card__lead">
          {setupRequired ? t('login.firstUse') : t('login.signInLead')}
        </p>
        <form onSubmit={submit} className="login-form">
          {setupRequired && <label>
            {t('login.displayName')}
            <input value={name} onChange={(event) => setName(event.target.value)} type="text" autoComplete="name" required />
          </label>}
          <label>
            {t('login.workEmail')}
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" required />
          </label>
          <label>
            {t('login.password')}
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
          </label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn--primary login-form__submit" disabled={busy}>
            {busy ? (setupRequired ? t('login.createBusy') : t('login.signInBusy')) : (setupRequired ? t('login.create') : t('login.signIn'))}
            <span aria-hidden>↗</span>
          </button>
        </form>
        <p className="login-card__foot mono">{setupRequired ? t('login.footFirst') : t('login.footSignIn')}</p>
      </section>
    </main>
  )
}

