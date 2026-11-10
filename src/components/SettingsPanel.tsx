import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'

interface Props { open: boolean; onClose: () => void }
type Provider = 'deepseek' | 'custom'
type CustomProtocol = 'openai-completions' | 'anthropic-messages' | 'openai-responses'

export function SettingsPanel({ open, onClose }: Props) {
  const { t } = useI18n()
  const [provider, setProvider] = useState<Provider>('deepseek')
  const [apiKey, setApiKey] = useState('')
  const [customProtocol, setCustomProtocol] = useState<CustomProtocol>('openai-completions')
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [customApiKey, setCustomApiKey] = useState('')
  const [customConfigured, setCustomConfigured] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [qccKey, setQccKey] = useState('')
  const [qccServers, setQccServers] = useState('')
  const [qccConfigured, setQccConfigured] = useState(false)
  const [mineruKey, setMineruKey] = useState('')
  const [mineruConfigured, setMineruConfigured] = useState(false)
  const [agentCatalog, setAgentCatalog] = useState(true)
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
        setQccConfigured(Boolean(payload.qccMcp?.configured))
        setMineruConfigured(Boolean(payload.mineru?.configured))
        setAgentCatalog(payload.agent?.catalogEnabled !== false)
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
        body: JSON.stringify({
          ...(provider === 'deepseek'
            ? { provider, deepseekApiKey: apiKey.trim() }
            : { provider, customApi: { protocol: customProtocol, baseUrl: customBaseUrl.trim(), model: customModel.trim(), apiKey: customApiKey.trim() } }),
          ...(qccKey.trim() ? { qccApiKey: qccKey.trim() } : {}),
          ...(mineruKey.trim() ? { mineruApiKey: mineruKey.trim() } : {}),
          ...(qccServers.trim() ? { qccServers: qccServers.trim() } : {}),
          agentCatalog,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || '保存 ACP 配置失败')
      setConfigured(provider === 'deepseek')
      setCustomConfigured(provider === 'custom')
      if (qccKey.trim() || qccServers.trim()) setQccConfigured(true)
      if (mineruKey.trim()) setMineruConfigured(true)
      setApiKey('')
      setQccKey('')
      setQccServers('')
      setMessage('已保存。展会检索与调查将通过内置 DeepSeek Harness ACP 执行。')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存 ACP 配置失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className="settings-scrim" aria-label={t('settings.close')} onClick={onClose} />
      <aside className="settings-panel" aria-label={t('settings.title')}>
        <header className="settings-panel__head">
          <div><span className="mono settings-panel__eyebrow">DEEPSEEK HARNESS ACP</span><h2>{t('settings.title')}</h2></div>
          <button type="button" className="detail__close" onClick={onClose} aria-label={t('settings.closeGeneric')}>×</button>
        </header>
        <div className="settings-panel__body">
          <p className="settings-panel__lead">{t('settings.lead')}</p>
          <div className="acp-runtime-card"><span className="status__dot" aria-hidden /><div><b>DeepSeek Harness ACP</b><small>{t('settings.runtime')}</small></div><span className="settings-field__configured">{provider === 'custom' ? (customConfigured ? t('settings.customConfigured') : t('settings.pending')) : (configured ? t('settings.configured') : t('settings.pending'))}</span></div>
          <label className="settings-field">{t('settings.connection')}<select value={provider} onChange={(event) => setProvider(event.target.value as Provider)}><option value="deepseek">DeepSeek</option><option value="custom">{t('settings.customApi')}</option></select></label>
          {provider === 'deepseek' ? <label className="settings-field">DeepSeek API Key<input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" autoComplete="off" /></label> : <>
            <label className="settings-field">{t('settings.protocol')}<select value={customProtocol} onChange={(event) => setCustomProtocol(event.target.value as CustomProtocol)}><option value="openai-completions">Chat Completions</option><option value="anthropic-messages">Anthropic Messages</option><option value="openai-responses">Responses</option></select></label>
            <label className="settings-field">{t('settings.baseUrl')}<input value={customBaseUrl} onChange={(event) => setCustomBaseUrl(event.target.value)} type="url" placeholder={customProtocol === 'anthropic-messages' ? 'https://api.anthropic.com' : 'https://gateway.example.com/v1'} /></label>
            <label className="settings-field">{t('settings.model')}<input value={customModel} onChange={(event) => setCustomModel(event.target.value)} type="text" placeholder="model-name" /></label>
            <label className="settings-field">API Key<input value={customApiKey} onChange={(event) => setCustomApiKey(event.target.value)} type="password" autoComplete="off" /></label>
          </>}
          <div className="settings-divider"><span className="mono">{t('settings.agent')}</span><span className="settings-field__configured">{t('settings.workspaceIsolation')}</span></div>
          <label className="settings-check">
            <input type="checkbox" checked={agentCatalog} onChange={(event) => setAgentCatalog(event.target.checked)} />
            <span>{t('settings.agentToggle')}</span>
          </label>
          <p className="settings-panel__hint">{t('settings.agentHint')}</p>

          <div className="settings-divider"><span className="mono">{t('settings.qcc')}</span><span className="settings-field__configured">{qccConfigured ? t('settings.configured') : t('settings.notConfigured')}</span></div>
          <label className="settings-field">企查查 API Key<input value={qccKey} onChange={(event) => setQccKey(event.target.value)} type="password" autoComplete="off" placeholder={qccConfigured ? '已保存，留空则不修改' : '填写后启用企业工商核验'} /></label>
          <label className="settings-field">自定义 MCP Server（可选，JSON）<textarea value={qccServers} onChange={(event) => setQccServers(event.target.value)} rows={3} placeholder='{"qcc-company":{"url":"https://agent.qcc.com/mcp/company/stream"}}' /></label>
          <p className="settings-panel__hint">配置后，调查参展企业时可对单家企业发起企查查核验；未配置则只使用公开网页。</p>

          <div className="settings-divider"><span className="mono">{t('settings.mineru')}</span><span className="settings-field__configured">{mineruConfigured ? t('settings.configured') : t('settings.offline')}</span></div>
          <label className="settings-field">MinerU API Token<input value={mineruKey} onChange={(event) => setMineruKey(event.target.value)} type="password" autoComplete="off" placeholder={mineruConfigured ? '已保存，留空则不修改' : '可留空，使用免登录 Agent API'} /></label>
          <p className="settings-panel__hint">用于把展会手册、参展商名录 PDF/图片解析成 Markdown；配置 Token 走标准 API（更大文件/更高配额），不填则走免登录 Agent API。</p>
          {error && <p className="settings-message settings-message--error" role="alert">{error}</p>}
          {message && <p className="settings-message settings-message--ok">{message}</p>}
          <button type="button" className="btn btn--primary settings-save" onClick={() => void save()} disabled={busy || (provider === 'deepseek' ? !apiKey.trim() && !configured : (!customBaseUrl.trim() || !customModel.trim() || !customApiKey.trim() && !customConfigured))}>{busy ? t('settings.saveBusy') : t('settings.save')}</button>
          <p className="settings-panel__foot mono">API Key 仅传给本机服务端，并由 ACP 进程通过 DSH_HOME 使用。</p>
        </div>
      </aside>
    </>
  )
}
