import { useCallback, useEffect, useState } from 'react'
import { chatApi, type GlobalFile } from '../lib/chatApi'
import { clock } from '../lib/format'
import { useI18n } from '../i18n'

interface Props {
  open: boolean
  onClose: () => void
  onOpenChat: (chatId: string) => void
}

const formatBytes = (value: number) => value >= 1024 * 1024
  ? `${(value / 1024 / 1024).toFixed(1)} MB`
  : value >= 1024 ? `${(value / 1024).toFixed(1)} KB` : `${value} B`

export function FilesPanel({ open, onClose, onOpenChat }: Props) {
  const { t } = useI18n()
  const [files, setFiles] = useState<GlobalFile[]>([])
  const [totalBytes, setTotalBytes] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const payload = await chatApi.allFiles()
      setFiles(payload.files)
      setTotalBytes(payload.totalBytes)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '读取文件失败')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  if (!open) return null

  const groups = new Map<string, { title: string; files: GlobalFile[] }>()
  for (const file of files) {
    const group = groups.get(file.chatId) ?? { title: file.chatTitle, files: [] }
    group.files.push(file)
    groups.set(file.chatId, group)
  }

  return (
    <>
      <button type="button" className="settings-scrim" aria-label={t('files.close')} onClick={onClose} />
      <aside className="settings-panel help-panel files-panel" aria-label={t('files.title')}>
        <header className="settings-panel__head">
          <div>
            <span className="mono settings-panel__eyebrow">FILES · 文件库</span>
            <h2>{t('files.title')}</h2>
          </div>
          <button type="button" className="detail__close" onClick={onClose} aria-label={t('settings.closeGeneric')}>×</button>
        </header>
        <div className="settings-panel__body">
          <p className="settings-panel__lead">
            {t('files.lead')}
          </p>
          <div className="files-summary">
            <span className="mono">{files.length} 个文件 · {formatBytes(totalBytes)}</span>
            <button type="button" className="btn btn--ghost" onClick={() => void refresh()} disabled={busy}>{busy ? t('files.refreshing') : t('files.refresh')}</button>
          </div>
          {error && <p className="settings-message settings-message--error" role="alert">{error}</p>}
          {!busy && files.length === 0 && <p className="settings-panel__hint">{t('files.empty')}</p>}
          {[...groups.entries()].map(([chatId, group]) => (
            <section className="files-group" key={chatId}>
              <header className="files-group__head">
                <button type="button" className="files-group__title" onClick={() => onOpenChat(chatId)} title={t('files.openChat')}>
                  {group.title}
                </button>
                <span className="mono files-group__count">{group.files.length}</span>
              </header>
              <ul className="files-list">
                {group.files.map((file) => (
                  <li className="files-row" key={`${chatId}:${file.path}`}>
                    <div className="files-row__meta">
                      <span className="files-row__name" title={file.path}>{file.path}</span>
                      <span className="files-row__sub mono">{formatBytes(file.size)} · {clock(file.updatedAt)}</span>
                    </div>
                    {file.pdfUrl && <a className="btn btn--ghost files-row__btn" href={file.pdfUrl}>PDF</a>}
                    <a className="btn btn--ghost files-row__btn" href={file.downloadUrl}>{t('files.download')}</a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="settings-panel__foot mono">{t('files.foot')}</p>
        </div>
      </aside>
    </>
  )
}
