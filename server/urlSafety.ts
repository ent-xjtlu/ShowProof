import dns from 'node:dns/promises'

function ipv4Parts(value: string): number[] | undefined {
  const parts = value.split('.').map(Number)
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : undefined
}

function isPrivateIp(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '')
  if (normalized.startsWith('::ffff:')) return isPrivateIp(normalized.slice(7))
  const ipv4 = ipv4Parts(normalized)
  if (ipv4) {
    const [a, b] = ipv4
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && b >= 18 && b <= 19) || a >= 224
  }
  return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')
}

export async function isSafeHttpUrl(rawUrl: string): Promise<boolean> {
  let url: URL
  try { url = new URL(rawUrl) } catch { return false }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) return false
  if (process.env.ALLOW_PRIVATE_WEB_TARGETS === '1') return true
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) return false
  if (isPrivateIp(hostname)) return false
  try {
    const addresses = await dns.lookup(hostname, { all: true, verbatim: true })
    return addresses.length > 0 && addresses.every((entry) => !isPrivateIp(entry.address))
  } catch {
    return false
  }
}

export async function assertSafeHttpUrl(rawUrl: string): Promise<void> {
  if (!(await isSafeHttpUrl(rawUrl))) throw new Error('网页地址被安全策略拒绝。仅允许访问公开 HTTP(S) 地址。')
}
