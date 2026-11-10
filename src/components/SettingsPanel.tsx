import { useEffect, useState } from 'react'

interface Props { open: boolean; onClose: () => void }
type Provider = 'deepseek' | 'custom'
type CustomProtocol = 'openai-completions' | 'anthropic-messages' | 'openai-responses'

export function SettingsPanel({ open, onClose }: Props) {
  const [provider, setProvider] = useState<Provider>('deepseek')
  const [apiKey, setApiKey] = useState('')
  const [customProtocol, setCustomProtocol] = useState<CustomProtocol>('openai-completions')
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [customApiKey, setCustomApiKey] = useState('')
  const [customConfigured, setCustomConfigured] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setMessage('')
    setError('')
    void fetch('/api/integrations', { headers: { Authorization: `Bearer ${localStorage.getItem('domel_token') || ''}` } })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.message || '读取 ACP 状态失败')
        setProvider(payload.acp?.provider === 'custom' ? 'custom' : 'deepseek')
        setConfigured(Boolean(payload.acp?.configured && payload.acp?.provider !== 'custom'))
        setCustomConfigured(Boolean(payload.customApi?.configured))
        if (payload.customApi?.protocol) setCustomProtocol(payload.customApi.protocol)
        if (payload.customApi?.baseUrl) setCustomBaseUrl(payload.customApi.baseUrl)
        if (payload.customApi?.model) setCustomModel(payload.customApi.model)
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '读取 ACP 状态失败'))
  }, [open])

  if (!open) return null

  const save = async () => {
    if (busy) return
    if (provider === 'deepseek' && !apiKey.trim() && !configured) return
    if (provider === 'custom' && (!customBaseUrl.trim() || !customModel.trim() || (!customApiKey.trim() && !customConfigured))) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/integrations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('domel_token') || ''}` },
        body: JSON.stringify(provider === 'deepseek'
          ? { provider, deepseekApiKey: apiKey.trim() }
          : { provider, customApi: { protocol: customProtocol, baseUrl: customBaseUrl.trim(), model: customModel.trim(), apiKey: customApiKey.trim() } }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || '保存 ACP 配置失败')
      setConfigured(provider === 'deepseek')
      setCustomConfigured(provider === 'custom')
      setApiKey('')
      setMessage('已保存。研究任务将通过内置 DeepSeek Harness ACP 执行。')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存 ACP 配置失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className="settings-scrim" aria-label="关闭 ACP 设置" onClick={onClose} />
      <aside className="settings-panel" aria-label="ACP 连接设置">
        <header className="settings-panel__head">
          <div><span className="mono settings-panel__eyebrow">DEEPSEEK HARNESS ACP</span><h2>ACP 连接设置</h2></div>
          <button type="button" className="detail__close" onClick={onClose} aria-label="关闭">×</button>
        </header>
        <div className="settings-panel__body">
          <p className="settings-panel__lead">所有模型请求都由内置 DeepSeek Harness 的 ACP stdio 会话执行。可以使用 DeepSeek，也可以挂载兼容 Chat Completions、Anthropic Messages 或 Responses 的自定义 API。</p>
          <div className="acp-runtime-card"><span className="status__dot" aria-hidden /><div><b>DeepSeek Harness ACP</b><small>随应用安装，首次启动自动准备运行依赖</small></div><span className="settings-field__configured">{provider === 'custom' ? (customConfigured ? '自定义已配置' : '待配置') : (configured ? '已配置' : '待配置')}</span></div>
          <label className="settings-field">模型连接方式<select value={provider} onChange={(event) => setProvider(event.target.value as Provider)}><option value="deepseek">DeepSeek</option><option value="custom">自定义 API</option></select></label>
          {provider === 'deepseek' ? <label className="settings-field">DeepSeek API Key<input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" autoComplete="off" /></label> : <>
            <label className="settings-field">API 协议<select value={customProtocol} onChange={(event) => setCustomProtocol(event.target.value as CustomProtocol)}><option value="openai-completions">Chat Completions</option><option value="anthropic-messages">Anthropic Messages</option><option value="openai-responses">Responses</option></select></label>
            <label className="settings-field">API Base URL<input value={customBaseUrl} onChange={(event) => setCustomBaseUrl(event.target.value)} type="url" placeholder={customProtocol === 'anthropic-messages' ? 'https://api.anthropic.com' : 'https://gateway.example.com/v1'} /></label>
            <label className="settings-field">模型名称<input value={customModel} onChange={(event) => setCustomModel(event.target.value)} type="text" placeholder="model-name" /></label>
            <label className="settings-field">API Key<input value={customApiKey} onChange={(event) => setCustomApiKey(event.target.value)} type="password" autoComplete="off" /></label>
          </>}
          {error && <p className="settings-message settings-message--error" role="alert">{error}</p>}
          {message && <p className="settings-message settings-message--ok">{message}</p>}
          <button type="button" className="btn btn--primary settings-save" onClick={() => void save()} disabled={busy || (provider === 'deepseek' ? !apiKey.trim() && !configured : (!customBaseUrl.trim() || !customModel.trim() || !customApiKey.trim() && !customConfigured))}>{busy ? '保存中…' : '保存 ACP 配置'}</button>
          <p className="settings-panel__foot mono">API Key 仅传给本机服务端，并由 ACP 进程通过 DSH_HOME 使用。</p>
        </div>
      </aside>
    </>
  )
}
