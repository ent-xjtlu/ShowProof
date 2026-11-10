import fs from 'node:fs'
import path from 'node:path'

export const customApiProtocols = ['openai-completions', 'anthropic-messages', 'openai-responses'] as const
export type CustomApiProtocol = (typeof customApiProtocols)[number]

export type CustomApiSettings = {
  protocol: CustomApiProtocol
  baseUrl: string
  model: string
  apiKey: string
}

function isProtocol(value: unknown): value is CustomApiProtocol {
  return typeof value === 'string' && (customApiProtocols as readonly string[]).includes(value)
}

export function normalizeCustomApi(value: unknown): CustomApiSettings | undefined {
  if (!value || typeof value !== 'object') return undefined
  const input = value as Record<string, unknown>
  const protocol = input.protocol
  const baseUrl = typeof input.baseUrl === 'string' ? input.baseUrl.trim() : ''
  const model = typeof input.model === 'string' ? input.model.trim() : ''
  const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : ''
  if (!isProtocol(protocol) || !baseUrl || !model || !apiKey) return undefined
  let parsed: URL
  try { parsed = new URL(baseUrl) } catch { return undefined }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) return undefined
  if (baseUrl.length > 2048 || model.length > 200 || apiKey.length > 4096) return undefined
  return { protocol, baseUrl: parsed.toString().replace(/\/$/, ''), model, apiKey }
}

export function writeCustomProviderPatch(dataDir: string, userId: string, settings: CustomApiSettings): string {
  const directory = path.join(dataDir, 'acp-custom')
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const patchPath = path.join(directory, `${userId}.json`)
  const patch = [
    { id: 'llm-deepseek', disabled: true },
    {
      id: 'llm-pi-ai',
      config: {
        providers: {
          'shizheng-custom': {
            displayName: '自定义 API',
            api: settings.protocol,
            apiKeyEnv: 'SHIZHENG_CUSTOM_API_KEY',
            baseURL: settings.baseUrl,
            models: [{ id: settings.model, name: settings.model }],
          },
        },
      },
    },
    { id: 'acp', config: { provider: 'shizheng-custom', model: settings.model } },
  ]
  fs.writeFileSync(patchPath, JSON.stringify(patch, null, 2), { mode: 0o600 })
  try { fs.chmodSync(patchPath, 0o600) } catch { /* best effort on non-POSIX filesystems */ }
  return patchPath
}
