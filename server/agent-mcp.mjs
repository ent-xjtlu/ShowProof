/**
 * 拾证应用内 MCP Server（stdio）。
 *
 * 让 DeepSeek Harness 直接读写当前用户的展会目录、把研究材料与报告写成
 * 可下载文件，并在调用企查查前请求用户审核。所有请求走本地 HTTP API，
 * 用一次性令牌鉴权；MCP 进程不接触 db.json、API Key 或数据库文件。
 */
import { createInterface } from 'node:readline'

const appUrl = (process.env.SHIZHENG_APP_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '')
const token = process.env.SHIZHENG_AGENT_TOKEN || ''
const chatId = process.env.SHIZHENG_CHAT_ID || ''

const reply = (id, result) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
const errorReply = (id, message) => reply(id, { isError: true, content: [{ type: 'text', text: message }] })
const textResult = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] })

async function call(pathname, options = {}) {
  if (!token) throw new Error('缺少 Agent 令牌：请在拾证的对话中使用该工具。')
  const response = await fetch(`${appUrl}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-shizheng-agent-token': token,
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(Number(options.timeoutMs || process.env.SHIZHENG_AGENT_TIMEOUT_MS || 60000)),
  })
  const raw = await response.text()
  let payload
  try { payload = raw ? JSON.parse(raw) : {} } catch { payload = { message: raw.slice(0, 500) } }
  if (!response.ok) throw new Error(payload?.message || `请求失败（${response.status}）`)
  return payload
}

function requireText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`缺少参数：${field}`)
  return value.trim()
}

const tools = [
  {
    name: 'shizheng_context',
    description: '读取当前企业画像摘要、展会目录规模与工作区说明。开始处理展会或研究任务前先调用一次。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'shizheng_exhibitions_list',
    description: '列出当前用户的展会目录。支持按名称/城市关键词、状态过滤；默认不返回回收站记录。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '名称或城市关键词' },
        status: { type: 'string', enum: ['queued', 'researching', 'ready', 'failed'] },
        includeArchived: { type: 'boolean', description: '是否包含回收站记录' },
        limit: { type: 'number', description: '最多返回条数，默认 50' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'shizheng_exhibition_get',
    description: '按 ID 读取一条展会记录的完整信息（含评分、费用、来源、备注）。',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
  },
  {
    name: 'shizheng_exhibition_create',
    description: '把用户确认参展/关注的展会加入展会目录。会按名称、城市与年份自动查重；重复时返回已有记录并标记 duplicate=true。加入前建议先调用 shizheng_exhibitions_list 查重。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '展会全称' },
        city: { type: 'string' },
        country: { type: 'string' },
        startDate: { type: 'string', description: 'YYYY-MM-DD' },
        endDate: { type: 'string', description: 'YYYY-MM-DD' },
        venue: { type: 'string' },
        organizer: { type: 'string' },
        website: { type: 'string' },
        type: { type: 'string', description: '展会类型/行业' },
        theme: { type: 'string' },
        exhibitScope: { type: 'string', description: '展出范围' },
        fitScore: { type: 'number', description: '与企业匹配度 0-100' },
        fitReasons: { type: 'array', items: { type: 'string' } },
        sourceUrls: { type: 'array', items: { type: 'string' } },
        note: { type: 'string', description: '备注/加入理由' },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'shizheng_exhibition_update',
    description: '修改展会目录中的一条记录（名称、日期、城市、国家、官网、展馆、主办方、匹配度、备注、状态等）。只传需要修改的字段；用户要求把失败/卡住的状态改回待调查时，传 status=queued。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        patch: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            city: { type: 'string' },
            country: { type: 'string' },
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            venue: { type: 'string' },
            organizer: { type: 'string' },
            website: { type: 'string' },
            type: { type: 'string' },
            theme: { type: 'string' },
            exhibitScope: { type: 'string' },
            participation: { type: 'string' },
            registrationDeadline: { type: 'string' },
            fitScore: { type: 'number' },
            fitReasons: { type: 'array', items: { type: 'string' } },
            mismatchReasons: { type: 'array', items: { type: 'string' } },
            note: { type: 'string' },
            watched: { type: 'boolean' },
            status: { type: 'string', enum: ['queued', 'researching', 'ready', 'failed'], description: '手动修正状态，例如把失败的展会改回 queued' },
          },
          additionalProperties: false,
        },
      },
      required: ['id', 'patch'],
      additionalProperties: false,
    },
  },
  {
    name: 'shizheng_exhibition_archive',
    description: '把一条展会记录移入回收站（软删除，可恢复）。仅在用户明确要求删除时调用，并先向用户确认展会名称。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, reason: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'shizheng_exhibition_restore',
    description: '从回收站恢复一条展会记录。',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
  },
  {
    name: 'shizheng_file_write',
    description: '在工作区写入一个可下载文件（Markdown/CSV/JSON/TXT）。路径相对于本次对话工作区，例如 notes/plan.md。用于保存研究笔记、数据表、清单等；用户可在对话右侧直接下载。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对工作区路径，如 notes/analysis.md' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'shizheng_report_save',
    description: '保存最终研究报告并返回下载地址。研究/调研任务收尾时必须调用：传入完整 Markdown 报告（含来源链接）。文件写入工作区 reports/ 目录，用户可直接下载。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '报告标题' },
        markdown: { type: 'string', description: '完整报告正文（Markdown，含来源）' },
        filename: { type: 'string', description: '可选文件名（不含路径）' },
      },
      required: ['title', 'markdown'],
      additionalProperties: false,
    },
  },
  {
    name: 'shizheng_files_list',
    description: '列出本次对话工作区中的可下载文件，确认报告/材料是否已生成。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'shizheng_qcc_verify',
    description: '调用企查查 MCP 核验企业（工商信息、风险）。调用前会先请用户在界面上审核；用户同意后才真正查询，结果保存为工作区文件。用户明确要求核验企业、且已配置企查查时使用。',
    inputSchema: {
      type: 'object',
      properties: {
        companies: { type: 'array', items: { type: 'string' }, description: '要核验的企业全称，最多 5 家' },
        company: { type: 'string', description: '单个企业名称（与 companies 二选一）' },
      },
      additionalProperties: false,
    },
  },
]

async function callTool(name, args = {}) {
  if (name === 'shizheng_context') {
    return textResult({ ...(await call('/api/agent/context')), chatId })
  }
  if (name === 'shizheng_exhibitions_list') {
    const params = new URLSearchParams()
    if (typeof args.query === 'string' && args.query.trim()) params.set('query', args.query.trim())
    if (typeof args.status === 'string') params.set('status', args.status)
    if (args.includeArchived) params.set('includeArchived', '1')
    if (args.limit) params.set('limit', String(Math.min(200, Math.max(1, Number(args.limit)))))
    return textResult(await call(`/api/agent/exhibitions?${params.toString()}`))
  }
  if (name === 'shizheng_exhibition_get') {
    return textResult(await call(`/api/agent/exhibitions/${encodeURIComponent(requireText(args.id, 'id'))}`))
  }
  if (name === 'shizheng_exhibition_create') {
    return textResult(await call('/api/agent/exhibitions', { method: 'POST', body: JSON.stringify(args) }))
  }
  if (name === 'shizheng_exhibition_update') {
    const id = requireText(args.id, 'id')
    if (!args.patch || typeof args.patch !== 'object') throw new Error('缺少参数：patch')
    return textResult(await call(`/api/agent/exhibitions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ patch: args.patch }) }))
  }
  if (name === 'shizheng_exhibition_archive') {
    const id = requireText(args.id, 'id')
    return textResult(await call(`/api/agent/exhibitions/${encodeURIComponent(id)}/archive`, { method: 'POST', body: JSON.stringify({ reason: args.reason || '' }) }))
  }
  if (name === 'shizheng_exhibition_restore') {
    const id = requireText(args.id, 'id')
    return textResult(await call(`/api/agent/exhibitions/${encodeURIComponent(id)}/restore`, { method: 'POST', body: '{}' }))
  }
  if (name === 'shizheng_file_write') {
    return textResult(await call('/api/agent/files', { method: 'POST', body: JSON.stringify({ path: requireText(args.path, 'path'), content: String(args.content ?? '') }) }))
  }
  if (name === 'shizheng_report_save') {
    return textResult(await call('/api/agent/report', {
      method: 'POST',
      body: JSON.stringify({ title: requireText(args.title, 'title'), markdown: requireText(args.markdown, 'markdown'), filename: args.filename }),
    }))
  }
  if (name === 'shizheng_files_list') {
    return textResult(await call('/api/agent/files'))
  }
  if (name === 'shizheng_qcc_verify') {
    const companies = Array.isArray(args.companies) ? args.companies.filter((item) => typeof item === 'string' && item.trim()) : []
    if (typeof args.company === 'string' && args.company.trim()) companies.push(args.company.trim())
    if (!companies.length) throw new Error('请提供要核验的企业名称。')
    return textResult(await call('/api/agent/qcc/verify', {
      method: 'POST',
      body: JSON.stringify({ companies: companies.slice(0, 5) }),
      timeoutMs: 11 * 60 * 1000,
    }))
  }
  throw new Error(`未知工具：${name}`)
}

const lines = createInterface({ input: process.stdin })
lines.on('line', async (line) => {
  if (!line.trim()) return
  let request
  try { request = JSON.parse(line) } catch { return }
  if (request.id === undefined) return
  try {
    if (request.method === 'initialize') {
      reply(request.id, {
        protocolVersion: request.params?.protocolVersion || '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'shizheng-agent', version: '0.3.0' },
      })
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
