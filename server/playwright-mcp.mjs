import { createInterface } from 'node:readline'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import os from 'node:os'
import { assertSafeHttpUrl, isSafeHttpUrl } from './urlSafety.mjs'

const require = createRequire(new URL('./runtime-deps/package.json', import.meta.url))
const { chromium } = require('playwright')
const ocrLangPath = process.env.SHIZHENG_OCR_LANG_PATH || path.resolve('build/ocr-data')
const screenshotDir = process.env.SHIZHENG_SCREENSHOT_DIR || path.resolve('screenshots')
const ocrCachePath = process.env.SHIZHENG_OCR_CACHE_DIR || path.join(os.tmpdir(), 'shizheng-ocr-cache')
let ocrWorkerPromise

const browserRoot = process.env.PLAYWRIGHT_BROWSERS_PATH
function findChromiumExecutable(root) {
  if (!root || !fs.existsSync(root)) return undefined
  const names = process.platform === 'win32' ? ['chrome.exe'] : process.platform === 'darwin' ? ['Chromium'] : ['chrome']
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        const found = visit(candidate)
        if (found) return found
      } else if (names.includes(entry.name)) return candidate
    }
    return undefined
  }
  return visit(root)
}
const chromiumExecutable = findChromiumExecutable(browserRoot)
let browser
let context
let page

const reply = (id, result) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
const errorReply = (id, message) => reply(id, { isError: true, content: [{ type: 'text', text: message }] })
const textResult = (text, extra = {}) => ({ content: [{ type: 'text', text }], ...extra })

async function ensurePage() {
  if (!browser) browser = await chromium.launch({ headless: true, ...(chromiumExecutable ? { executablePath: chromiumExecutable } : {}) })
  if (!context) {
    context = await browser.newContext({ userAgent: 'ShizhengResearch/0.1 (Playwright MCP)', deviceScaleFactor: 2 })
    await context.route('**/*', async (route) => {
      const requestUrl = route.request().url()
      if (/^https?:\/\//i.test(requestUrl) && !(await isSafeHttpUrl(requestUrl))) return route.abort('blockedbyclient')
      return route.continue()
    })
  }
  if (!page) page = await context.newPage()
  return page
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

let fflateModule
function getFflate() {
  if (!fflateModule) fflateModule = require('fflate')
  return fflateModule
}

const MINERU_STANDARD = 'https://mineru.net/api/v4'
const MINERU_AGENT = 'https://mineru.net/api/v1/agent'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(60000) })
  const text = await response.text()
  let body
  try { body = JSON.parse(text) } catch { throw new Error(`MinerU 返回非 JSON：${text.slice(0, 200)}`) }
  if (!response.ok || (body.code !== undefined && body.code !== 0)) {
    throw new Error(body.msg || body.msgCode || `MinerU 请求失败（${response.status}）`)
  }
  return body
}

async function mineruZipText(zipUrl) {
  const response = await fetch(zipUrl, { signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error(`下载 MinerU 结果失败（${response.status}）`)
  const { unzipSync } = getFflate()
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()))
  const names = Object.keys(files)
  const mdName = names.find((name) => name === 'full.md')
    || names.find((name) => name.endsWith('/full.md'))
    || names.find((name) => name.endsWith('.md'))
  if (!mdName) throw new Error('MinerU 结果中没有 Markdown')
  return new TextDecoder().decode(files[mdName])
}

async function mineruParseUrl(target, language = 'ch') {
  const token = process.env.MINERU_API_TOKEN
  if (token) {
    const created = await fetchJson(`${MINERU_STANDARD}/extract/task`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: '*/*' },
      body: JSON.stringify({ url: target, model_version: 'vlm', is_ocr: true, language, enable_formula: true, enable_table: true }),
    })
    const taskId = created.data?.task_id
    if (!taskId) throw new Error('MinerU 未返回 task_id')
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await sleep(3000)
      const result = await fetchJson(`${MINERU_STANDARD}/extract/task/${taskId}`, { headers: { Authorization: `Bearer ${token}` } })
      const state = String(result.data?.state || '')
      if (state.toLowerCase() === 'done') return { text: await mineruZipText(result.data.full_zip_url), engine: 'standard' }
      if (state.toLowerCase() === 'failed') throw new Error(result.data?.err_msg || 'MinerU 解析失败')
    }
    throw new Error('MinerU 解析超时')
  }
  const created = await fetchJson(`${MINERU_AGENT}/parse/url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: '*/*' },
    body: JSON.stringify({ url: target, language, enable_table: true, is_ocr: true }),
  })
  const taskId = created.data?.task_id
  if (!taskId) throw new Error('MinerU 未返回 task_id')
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(3000)
    const result = await fetchJson(`${MINERU_AGENT}/parse/${taskId}`)
    const state = String(result.data?.state || '')
    if (state.toLowerCase() === 'done') {
      const markdownUrl = result.data?.markdown_url
      if (!markdownUrl) throw new Error('MinerU 未返回 markdown_url')
      const response = await fetch(markdownUrl, { signal: AbortSignal.timeout(60000) })
      if (!response.ok) throw new Error(`下载 MinerU Markdown 失败（${response.status}）`)
      return { text: await response.text(), engine: 'agent' }
    }
    if (state.toLowerCase() === 'failed') throw new Error(result.data?.err_msg || 'MinerU 解析失败')
  }
  throw new Error('MinerU 解析超时')
}

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    if (!fs.existsSync(path.join(ocrLangPath, 'chi_sim.traineddata.gz'))) {
      throw new Error('OCR 语言数据缺失：' + ocrLangPath)
    }
    const { createWorker } = require('tesseract.js')
    ocrWorkerPromise = createWorker(['chi_sim', 'eng'], 1, {
      langPath: ocrLangPath,
      cachePath: ocrCachePath,
      gzip: true,
    })
  }
  return ocrWorkerPromise
}

async function captureScreenshot(current, args) {
  const selector = typeof args.selector === 'string' && args.selector.trim() ? args.selector : ''
  if (selector) return current.locator(selector).screenshot({ timeout: Number(args.timeoutMs || 10000) })
  return current.screenshot({ fullPage: Boolean(args.fullPage), timeout: Number(args.timeoutMs || 20000) })
}

async function snapshot() {
  const current = await ensurePage()
  const text = cleanText(await current.locator('body').innerText({ timeout: 7000 })).slice(0, 20000)
  return { url: current.url(), title: cleanText(await current.title()), text }
}

async function waitForPage(current) {
  await current.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => undefined)
  await current.waitForLoadState('networkidle', { timeout: 7000 }).catch(() => undefined)
}

async function callTool(name, args = {}) {
  if (name === 'browser_open') {
    const current = await ensurePage()
    const url = String(args.url)
    await assertSafeHttpUrl(url)
    await current.goto(url, { waitUntil: 'domcontentloaded', timeout: Number(args.timeoutMs || 20000) })
    await waitForPage(current)
    return textResult(JSON.stringify(await snapshot()))
  }
  if (name === 'browser_read') {
    const current = await ensurePage()
    const selector = typeof args.selector === 'string' && args.selector.trim() ? args.selector : 'body'
    const text = cleanText(await current.locator(selector).innerText({ timeout: Number(args.timeoutMs || 7000) }))
    return textResult(JSON.stringify({ url: current.url(), title: cleanText(await current.title()), selector, text: text.slice(0, Number(args.maxChars || 20000)) }))
  }
  if (name === 'browser_click') {
    const current = await ensurePage()
    await current.locator(String(args.selector)).click({ timeout: Number(args.timeoutMs || 7000) })
    await waitForPage(current)
    return textResult(JSON.stringify(await snapshot()))
  }
  if (name === 'browser_fill') {
    const current = await ensurePage()
    const locator = current.locator(String(args.selector))
    await locator.fill(String(args.value ?? ''), { timeout: Number(args.timeoutMs || 7000) })
    if (args.pressEnter) await locator.press('Enter')
    await waitForPage(current)
    return textResult(JSON.stringify(await snapshot()))
  }
  if (name === 'browser_wait') {
    const current = await ensurePage()
    if (typeof args.selector === 'string' && args.selector.trim()) await current.locator(args.selector).waitFor({ state: 'visible', timeout: Number(args.timeoutMs || 10000) })
    else await current.waitForTimeout(Math.min(Number(args.milliseconds || 1000), 30000))
    return textResult(JSON.stringify(await snapshot()))
  }
  if (name === 'browser_paginate') {
    const current = await ensurePage()
    const selector = String(args.nextSelector)
    const pages = Math.max(1, Math.min(Number(args.pages || 1), 20))
    const results = []
    for (let index = 0; index < pages; index += 1) {
      await current.locator(selector).click({ timeout: Number(args.timeoutMs || 7000) })
      await waitForPage(current)
      results.push(await snapshot())
    }
    return textResult(JSON.stringify({ pages: results.length, results }))
  }
  if (name === 'browser_links') {
    const current = await ensurePage()
    const links = await current.locator('a[href]').evaluateAll((elements) => elements.slice(0, 100).map((element) => ({ text: (element.textContent || '').trim(), href: element.href })))
    return textResult(JSON.stringify({ url: current.url(), links }))
  }
  if (name === 'browser_screenshot') {
    const current = await ensurePage()
    const buffer = await captureScreenshot(current, args)
    fs.mkdirSync(screenshotDir, { recursive: true })
    const file = path.join(screenshotDir, `shot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`)
    fs.writeFileSync(file, buffer)
    return textResult(JSON.stringify({ url: current.url(), title: cleanText(await current.title()), path: file, bytes: buffer.length }))
  }
  if (name === 'mineru_parse_url') {
    const url = String(args.url || '')
    if (!/^https?:\/\//i.test(url)) throw new Error('MinerU 只接受 http(s) 文件 URL')
    const { text, engine } = await mineruParseUrl(url, typeof args.language === 'string' ? args.language : 'ch')
    return textResult(JSON.stringify({ url, engine, chars: text.length, text: cleanText(text).slice(0, Number(args.maxChars || 12000)) }))
  }
  if (name === 'browser_ocr') {
    const current = await ensurePage()
    const buffer = await captureScreenshot(current, args)
    const worker = await getOcrWorker()
    const { data } = await worker.recognize(buffer)
    const text = cleanText(data.text).slice(0, Number(args.maxChars || 6000))
    return textResult(JSON.stringify({ url: current.url(), title: cleanText(await current.title()), chars: text.length, text }))
  }
  if (name === 'browser_close') {
    await context?.close()
    await browser?.close()
    context = undefined
    page = undefined
    browser = undefined
    return textResult('浏览器会话已关闭。')
  }
  throw new Error(`未知 Playwright 工具：${name}`)
}

const tools = [
  { name: 'browser_open', description: '打开网页并等待动态内容加载。', inputSchema: { type: 'object', properties: { url: { type: 'string' }, timeoutMs: { type: 'number' } }, required: ['url'], additionalProperties: false } },
  { name: 'browser_read', description: '读取当前网页或 CSS 选择器对应的动态正文。', inputSchema: { type: 'object', properties: { selector: { type: 'string' }, maxChars: { type: 'number' }, timeoutMs: { type: 'number' } }, additionalProperties: false } },
  { name: 'browser_click', description: '点击当前网页中的 CSS 选择器元素并返回更新后的页面正文。', inputSchema: { type: 'object', properties: { selector: { type: 'string' }, timeoutMs: { type: 'number' } }, required: ['selector'], additionalProperties: false } },
  { name: 'browser_fill', description: '填写输入框，可选按 Enter 提交。', inputSchema: { type: 'object', properties: { selector: { type: 'string' }, value: { type: 'string' }, pressEnter: { type: 'boolean' }, timeoutMs: { type: 'number' } }, required: ['selector', 'value'], additionalProperties: false } },
  { name: 'browser_wait', description: '等待选择器出现或等待指定毫秒数。', inputSchema: { type: 'object', properties: { selector: { type: 'string' }, milliseconds: { type: 'number' }, timeoutMs: { type: 'number' } }, additionalProperties: false } },
  { name: 'browser_paginate', description: '重复点击下一页选择器并返回每一页的动态正文。', inputSchema: { type: 'object', properties: { nextSelector: { type: 'string' }, pages: { type: 'number' }, timeoutMs: { type: 'number' } }, required: ['nextSelector'], additionalProperties: false } },
  { name: 'browser_links', description: '提取当前网页中的链接。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'browser_screenshot', description: '对当前页面或指定元素截图并保存为 PNG，返回文件路径；用于留证或查看图片化内容。', inputSchema: { type: 'object', properties: { selector: { type: 'string' }, fullPage: { type: 'boolean' }, timeoutMs: { type: 'number' } }, additionalProperties: false } },
  { name: 'mineru_parse_url', description: '用 MinerU 解析公开的 PDF/图片/Office/HTML 文档并返回 Markdown（适合展会手册、参展商名录 PDF）。配置了 MinerU Token 时用标准 API，否则用免登录 Agent API。', inputSchema: { type: 'object', properties: { url: { type: 'string' }, language: { type: 'string' }, maxChars: { type: 'number' } }, required: ['url'], additionalProperties: false } },
  { name: 'browser_ocr', description: '对当前页面或指定元素截图并做中英文 OCR，返回识别文本；页面正文为空、内容在图片/画布中或需要核对图片文字时使用。', inputSchema: { type: 'object', properties: { selector: { type: 'string' }, fullPage: { type: 'boolean' }, maxChars: { type: 'number' }, timeoutMs: { type: 'number' } }, additionalProperties: false } },
  { name: 'browser_close', description: '关闭当前浏览器会话。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
]

const lines = createInterface({ input: process.stdin })
lines.on('line', async (line) => {
  if (!line.trim()) return
  let request
  try { request = JSON.parse(line) } catch { return }
  if (request.id === undefined) return
  try {
    if (request.method === 'initialize') {
      reply(request.id, { protocolVersion: request.params?.protocolVersion || '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'shizheng-playwright', version: '0.1.0' } })
    } else if (request.method === 'notifications/initialized') {
      return
    } else if (request.method === 'tools/list') {
      reply(request.id, { tools })
    } else if (request.method === 'tools/call') {
      reply(request.id, await callTool(request.params?.name, request.params?.arguments || {}))
    } else if (request.method === 'ping') {
      reply(request.id, {})
    } else {
      reply(request.id, {})
    }
  } catch (error) {
    errorReply(request.id, error instanceof Error ? error.message : String(error))
  }
})

lines.once('close', async () => {
  await context?.close().catch(() => undefined)
  await browser?.close().catch(() => undefined)
})

const shutdown = async () => {
  await context?.close().catch(() => undefined)
  await browser?.close().catch(() => undefined)
  process.exit(0)
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
