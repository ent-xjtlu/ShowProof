import { FormEvent, useState } from 'react'

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
      if (!response.ok) throw new Error(payload.message || '登录失败，请检查账号和密码。')
      localStorage.setItem('domel_token', payload.token)
      onLogin(payload.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-screen">
      <div className="login-screen__grid" aria-hidden="true" />
      <section className="login-card">
        <div className="login-card__brand">
          <span className="brand__mark" aria-hidden />
          <div>
            <b>拾证</b>
            <small>市场情报工作台</small>
          </div>
        </div>
        <p className="login-card__eyebrow mono">DOMEL INTEL DESK · SECURE WORKSPACE</p>
        <h1>把市场信号，变成判断。</h1>
        <p className="login-card__lead">
          {setupRequired ? '首次使用时创建本机工作账号，研究数据和凭证只保存在当前设备。' : '登录后通过 ACP 会话完成检索、取证、洞察与报告。'}
        </p>
        <form onSubmit={submit} className="login-form">
          {setupRequired && <label>
            显示名称
            <input value={name} onChange={(event) => setName(event.target.value)} type="text" autoComplete="name" required />
          </label>}
          <label>
            工作邮箱
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" required />
          </label>
          <label>
            密码
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
          </label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn--primary login-form__submit" disabled={busy}>
            {busy ? (setupRequired ? '正在创建…' : '正在进入…') : (setupRequired ? '创建本机账号' : '进入工作台')}
            <span aria-hidden>↗</span>
          </button>
        </form>
        <p className="login-card__foot mono">凭证只在本机服务端保存 · {setupRequired ? '首次启动需要创建账号' : '本机账号登录'}</p>
      </section>
    </main>
  )
}

