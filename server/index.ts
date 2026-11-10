import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { fetchPageWithFallback, type PageFetchResult } from './playwrightFetcher.js';
import { normalizeCustomApi, type CustomApiSettings, writeCustomProviderPatch } from './customProvider.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(rootDir, 'data'));
const dbPath = path.join(dataDir, 'db.json');
fs.mkdirSync(dataDir, { recursive: true });

type User = { id: string; email: string; name: string; passwordHash?: string; password?: string };
type Source = { id: string; title: string; url: string; type: string; capturedAt: string; excerpt: string; status: 'verified' | 'pending' | 'failed'; };
type Insight = { id: string; title: string; body: string; confidence: number; evidenceIds: string[]; review: 'pending' | 'accepted' | 'rejected'; reviewer?: string; reviewedAt?: string; reason?: string; };
type Activity = { id: string; label: string; detail?: string; status: 'queued' | 'running' | 'completed' | 'failed'; at: string; };
type ChatMessage = { id: string; role: 'user' | 'assistant' | 'tool' | 'system'; text: string; at: string; status?: 'streaming' | 'completed' | 'failed'; };
type Research = { id: string; userId: string; query: string; title: string; subjectType: 'event' | 'company' | 'question'; status: 'queued' | 'running' | 'completed' | 'failed'; error?: string; createdAt: string; updatedAt: string; sources: Source[]; insights: Insight[]; activities: Activity[]; messages: ChatMessage[]; followups: { id: string; query: string; at: string; }[]; harnessSessionId?: string; };
type IntegrationSettings = {
  provider?: 'deepseek' | 'custom';
  deepseekApiKey?: string;
  customApi?: CustomApiSettings;
  qccApiKey?: string;
  qccServers?: string;
  updatedAt?: string;
};
type Db = { users: User[]; sessions: Record<string, string>; researches: Research[]; settings: Record<string, IntegrationSettings>; };

function readDb(): Db {
  if (!fs.existsSync(dbPath)) {
    const initial: Db = { users: [], sessions: {}, researches: [], settings: {} };
    fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2));
    return initial;
  }
  const loaded = JSON.parse(fs.readFileSync(dbPath, 'utf8')) as Partial<Db>;
  loaded.settings ||= {};
  loaded.researches ||= [];
  loaded.researches.forEach((research) => {
    research.messages ||= [];
    const finalAssistant = [...research.messages].reverse().find((message) => message.role === 'assistant' && message.status === 'completed' && message.text?.trim());
    if (finalAssistant) {
      finalAssistant.text = cleanFinalAgentText(finalAssistant.text);
      research.insights?.forEach((insight) => {
        if (insight.review === 'pending' && (insight.title === 'ACP 返回的研究摘要' || insight.title === 'Harness 返回的研究摘要' || insight.title.endsWith('企业核验结果'))) insight.body = finalAssistant.text.slice(0, insight.title.endsWith('研究摘要') ? 1200 : 1400);
      });
    }
  });
  return loaded as Db;
}
function writeDb(db: Db) { fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), { mode: 0o600 }); try { fs.chmodSync(dbPath, 0o600); } catch { /* best effort on non-POSIX filesystems */ } }
let db = readDb();
const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomBytes(5).toString('hex')}`;
const redactedEnv = (value?: string) => value ? 'configured' : 'missing';
const activeBridges = new Map<string, DeepSeekAcpBridge>();
function normalizeSecret(value?: string) {
  return value?.trim().replace(/^['"`]+|['"`]+$/g, '').replace(/^Bearer\s+/i, '').replace(/^\s*(?:DEEPSEEK_API_KEY|QCC_MCP_API_KEY)\s*=\s*/i, '').replace(/\s+/g, '');
}
function normalizeDeepSeekKey(value?: string) {
  const cleaned = normalizeSecret(value) || '';
  return cleaned.match(/sk-[A-Za-z0-9]{16,}/)?.[0] || cleaned;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const digest = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${digest.toString('hex')}`;
}

function verifyPassword(stored: User, password: string): boolean {
  if (stored.passwordHash?.startsWith('scrypt$')) {
    const [, saltHex, digestHex] = stored.passwordHash.split('$');
    try {
      const expected = Buffer.from(digestHex, 'hex');
      const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
      return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    } catch {
      return false;
    }
  }
  if (typeof stored.password !== 'string') return false;
  const expected = Buffer.from(stored.password);
  const actual = Buffer.from(password);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function validateAccountInput(body: any) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ApcError('INVALID_ACCOUNT_EMAIL', '请输入有效的工作邮箱。');
  if (password.length < 8) throw new ApcError('INVALID_ACCOUNT_PASSWORD', '密码至少需要 8 位。');
  return { email, name: name.slice(0, 80) || email.split('@')[0], password };
}

function getIntegrationSettings(userId: string): IntegrationSettings {
  const stored = db.settings[userId] || {};
  return {
    provider: stored.provider === 'custom' || stored.customApi ? 'custom' : 'deepseek',
    deepseekApiKey: normalizeDeepSeekKey(stored.deepseekApiKey || process.env.DEEPSEEK_API_KEY),
    customApi: normalizeCustomApi(stored.customApi),
    qccApiKey: normalizeSecret(stored.qccApiKey || process.env.QCC_MCP_API_KEY),
    qccServers: stored.qccServers || process.env.QCC_MCP_SERVERS,
    updatedAt: stored.updatedAt,
  };
}

function currentUser(req: Request): User | undefined {
  const auth = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const userId = auth ? db.sessions[auth] : undefined;
  return userId ? db.users.find((u) => u.id === userId) : undefined;
}
function requireUser(req: Request, res: Response, next: NextFunction) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'UNAUTHENTICATED', message: '请先登录。' });
  (req as Request & { user: User }).user = user;
  next();
}
function getResearch(req: Request, res: Response) {
  const user = (req as Request & { user: User }).user;
  const research = db.researches.find((item) => item.id === req.params.id && item.userId === user.id);
  if (!research) { res.status(404).json({ error: 'NOT_FOUND', message: '研究不存在或无权访问。' }); return; }
  return research;
}

class ApcError extends Error { constructor(public code: string, message: string) { super(message); } }

type RpcMessage = { id?: number; method?: string; params?: any; result?: any; error?: any };
class DeepSeekAcpBridge {
  private child?: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (reason: any) => void }>();
  private buffer = '';
  private listeners: ((msg: RpcMessage) => void)[] = [];
  private initialized = false;

  constructor(private cwd: string, private userId: string) {}

  private getCommand(settings: IntegrationSettings) {
    const command = process.env.DEEPSEEK_HARNESS_COMMAND || process.execPath;
    const baseArgs = process.env.DEEPSEEK_HARNESS_ARGS
      ? JSON.parse(process.env.DEEPSEEK_HARNESS_ARGS) as string[]
      : [path.join(rootDir, 'node_modules/pnpm/bin/pnpm.cjs'), '--dir', path.join(rootDir, 'vendor/deepseek-harness'), 'dsh', '--profile', 'acp'];
    const args = [...baseArgs];
    if (settings.provider === 'custom' && settings.customApi) {
      args.push('--patch', writeCustomProviderPatch(dataDir, this.userId, settings.customApi));
    }
    return { command, args };
  }

  private launch() {
    const settings = getIntegrationSettings(this.userId);
    const { command, args } = this.getCommand(settings);
    this.child = spawn(command, args, {
      cwd: this.cwd,
      env: {
        ...process.env,
        ...(command === process.execPath ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
        DSH_HOME: process.env.DSH_HOME || path.join(dataDir, 'dsh-home'),
        ...(settings.deepseekApiKey ? { DEEPSEEK_API_KEY: settings.deepseekApiKey } : {}),
        ...(settings.provider === 'custom' && settings.customApi ? {
          SHIZHENG_CUSTOM_API_KEY: settings.customApi.apiKey,
          SHIZHENG_CUSTOM_BASE_URL: settings.customApi.baseUrl,
          SHIZHENG_CUSTOM_MODEL: settings.customApi.model,
          SHIZHENG_CUSTOM_API: settings.customApi.protocol,
        } : {}),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stdout.on('data', (chunk) => this.onData(chunk.toString()));
    this.child.on('error', (err) => this.failAll(err));
    this.child.on('exit', (code, signal) => this.failAll(new Error(`DeepSeek Harness ACP exited (${code ?? 'null'}/${signal ?? 'none'})`)));
  }
  private onData(chunk: string) {
    this.buffer += chunk;
    let index = this.buffer.indexOf('\n');
    while (index >= 0) {
      const line = this.buffer.slice(0, index).trim(); this.buffer = this.buffer.slice(index + 1); index = this.buffer.indexOf('\n');
      if (!line) continue;
      try { const msg = JSON.parse(line) as RpcMessage; if (typeof msg.id === 'number' && (msg.result !== undefined || msg.error !== undefined)) { const item = this.pending.get(msg.id); if (!item) continue; this.pending.delete(msg.id); msg.error ? item.reject(new Error(msg.error.message || 'ACP error')) : item.resolve(msg.result); } else this.listeners.forEach((listener) => listener(msg)); } catch { /* stdout is protocol-only; malformed lines are ignored until request timeout */ }
    }
  }
  private failAll(error: Error) { for (const [requestId, item] of this.pending) { item.reject(error); this.pending.delete(requestId); } }
  private request(method: string, params: any): Promise<any> {
    if (!this.child) this.launch();
    const requestId = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.child!.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }) + '\n');
    });
  }
  onNotification(listener: (msg: RpcMessage) => void) { this.listeners.push(listener); }
  async run(query: string, onUpdate?: (message: RpcMessage) => void): Promise<{ sessionId: string; finalText: string; updates: RpcMessage[] }> {
    if (!this.initialized) {
      await this.request('initialize', { protocolVersion: 1, clientInfo: { name: 'domel-market-intelligence', version: '0.1.0' }, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } });
      this.initialized = true;
    }
    const mcpServers = buildMcpServers(getIntegrationSettings(this.userId));
    const session = await this.request('session/new', { cwd: this.cwd, mcpServers });
    const updates: RpcMessage[] = [];
    const listener = (message: RpcMessage) => {
      if (message.method === 'session/update') {
        updates.push(message);
        onUpdate?.(message);
      }
    };
    this.onNotification(listener);
    const prompt = await this.request('session/prompt', { sessionId: session.sessionId, prompt: [{ type: 'text', text: query }] });
    this.listeners = this.listeners.filter((item) => item !== listener);
    const textParts = updates
      .map((update) => ({ update, summary: summarizeAcpUpdate(update) }))
      .filter(({ summary }) => summary.label === 'Agent 回复')
      .map(({ update, summary }) => textFromAcpContent(update.params?.update?.content ?? update.params?.content) || summary.text)
      .filter(Boolean);
    return { sessionId: session.sessionId, finalText: textParts.join('\n').trim() || prompt?.text || '', updates };
  }
  close() { this.child?.stdin.end(); this.child?.kill('SIGTERM'); this.child = undefined; }
}

function textFromAcpContent(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(textFromAcpContent).filter(Boolean).join('\n');
  if (typeof content === 'object') {
    if (typeof content.text === 'string') return content.text;
    if (content.content) return textFromAcpContent(content.content);
  }
  return '';
}

function cleanFinalAgentText(text: string): string {
  const markers = ['## 直接回答', '## 研究结果', '## 企业核验结果', '## 结构化结果'];
  const positions = markers.map((marker) => text.lastIndexOf(marker)).filter((position) => position >= 0);
  return positions.length ? text.slice(Math.max(...positions)).trim() : text.trim();
}

function summarizeAcpUpdate(message: RpcMessage): { role: ChatMessage['role']; label: string; text: string } {
  const update = message.params?.update ?? message.params ?? {};
  const kind = String(update.sessionUpdate ?? update.type ?? 'event');
  const lower = kind.toLowerCase();
  const toolName = update.title || update.name || update.kind || 'MCP 工具';
  const content = textFromAcpContent(update.content ?? update.message?.content ?? update.text);
  if (lower === 'tool_call' || lower.includes('tool_call')) {
    const input = update.rawInput && Object.keys(update.rawInput).length ? `\n参数：${JSON.stringify(update.rawInput)}` : '';
    const status = update.status ? `（${update.status}）` : '';
    return { role: 'tool', label: `工具调用 · ${toolName}${status}`, text: `${content}${input}`.trim() || '已发起工具调用。' };
  }
  if (lower.includes('agent_message')) return { role: 'assistant', label: 'Agent 回复', text: content || 'Agent 正在生成回复。' };
  if (lower.includes('agent_thought') || lower.includes('plan')) return { role: 'system', label: 'Agent 思考过程', text: content || 'Agent 正在规划下一步。' };
  return { role: 'system', label: `Agent 事件 · ${kind}`, text: content || JSON.stringify(update).slice(0, 800) };
}

const qccHttpServers = [
  ['qcc-company', 'company'], ['qcc-risk', 'risk'], ['qcc-ipr', 'ipr'], ['qcc-operation', 'operation'],
  ['qcc-history', 'history'], ['qcc-executive', 'executive'], ['qcc-legal-regulation', 'regulation'],
  ['qcc-legal-case', 'case'], ['qcc-tender', 'tender'], ['qcc-document', 'document']
] as const;
function buildMcpServers(settings?: IntegrationSettings) {
  const playwrightCommand = process.env.DEEPSEEK_HARNESS_COMMAND || process.execPath;
  const playwrightScript = process.env.PLAYWRIGHT_MCP_SCRIPT || path.join(rootDir, 'server/playwright-mcp.mjs');
  const playwrightBrowserPath = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(rootDir, 'build/playwright-browsers');
  const servers: any[] = [{ name: 'playwright', command: playwrightCommand, args: [playwrightScript], env: [{ name: 'PLAYWRIGHT_BROWSERS_PATH', value: playwrightBrowserPath }] }];
  const command = process.env.QCC_MCP_COMMAND;
  const args = process.env.QCC_MCP_ARGS ? JSON.parse(process.env.QCC_MCP_ARGS) as string[] : [];
  const url = process.env.QCC_MCP_URL;
  const apiKey = settings?.qccApiKey || process.env.QCC_MCP_API_KEY;
  const serversJson = settings?.qccServers || process.env.QCC_MCP_SERVERS;
  if (serversJson) {
    const configured = JSON.parse(serversJson) as Record<string, { url?: string; headers?: Record<string, string> }>;
    return [...servers, ...Object.entries(configured).filter(([, config]) => config.url).map(([name, config]) => ({ name, type: 'http', url: config.url, headers: { ...(config.headers || {}), ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) } }))];
  }
  if (apiKey) return [...servers, ...qccHttpServers.map(([name, server]) => ({ name, type: 'http', url: `https://agent.qcc.com/mcp/${server}/stream`, headers: { Authorization: `Bearer ${apiKey}` } }))];
  if (command) return [...servers, { name: 'qcc', command, args, env: process.env.QCC_MCP_ENV ? JSON.parse(process.env.QCC_MCP_ENV) : {} }];
  if (url) return [...servers, { name: 'qcc', type: 'http', url, headers: process.env.QCC_MCP_HEADERS ? JSON.parse(process.env.QCC_MCP_HEADERS) : {} }];
  return servers;
}
function requireHarnessConfig(userId: string) {
  const settings = getIntegrationSettings(userId);
  if (settings.provider === 'custom') {
    if (!settings.customApi) throw new ApcError('CUSTOM_API_NOT_CONFIGURED', '自定义 API 配置不完整。请在连接设置中填写协议、地址、模型和 API Key。');
    return;
  }
  if (!settings.deepseekApiKey) throw new ApcError('DEEPSEEK_API_KEY_NOT_CONFIGURED', '未配置 DeepSeek API Key。请在连接设置中填写。');
}
function requireQccConfig(userId: string) {
  const settings = getIntegrationSettings(userId);
  if (!process.env.QCC_MCP_COMMAND && !process.env.QCC_MCP_URL && !settings.qccApiKey && !settings.qccServers) throw new ApcError('QCC_MCP_NOT_CONFIGURED', '未配置企查查 MCP。请在前端“连接设置”中填写 API Key。');
}

async function runResearch(researchId: string) {
  const research = db.researches.find((item) => item.id === researchId); if (!research) return;
  const update = (patch: Partial<Research>) => { Object.assign(research, patch, { updatedAt: now() }); db = readDb(); const index = db.researches.findIndex((item) => item.id === researchId); if (index >= 0) db.researches[index] = research; writeDb(db); };
  try {
    const bridge = new DeepSeekAcpBridge(rootDir, research.userId);
    activeBridges.set(researchId, bridge);
    const appendEvent = (message: RpcMessage) => {
      const event = summarizeAcpUpdate(message);
      research.activities.push({ id: id('act'), label: event.label, detail: event.text.slice(0, 600), status: 'running', at: now() });
      research.messages.push({ id: id('msg'), role: event.role, text: event.text.slice(0, 4000), at: now(), status: event.role === 'assistant' ? 'streaming' : 'completed' });
      update({});
    };
    const result = await bridge.run(`你是市场情报研究 Agent。只使用你实际访问到的公开来源和已挂载 MCP 工具。优先使用普通网页工具；遇到 JavaScript 渲染、访问拦截、分页或正文不完整的页面时，调用 Playwright MCP 工具 browser_open、browser_read、browser_click、browser_wait、browser_paginate 和 browser_links 自适应完成抓取。\n研究问题：${research.query}\n请全程使用简体中文返回结构化结果，包含：一句话摘要、3-5 条带来源依据的发现、待核实疑点。不要编造来源；将每个来源写成 URL。`, appendEvent);
    const finalText = cleanFinalAgentText(result.finalText);
    const urls = [...finalText.matchAll(/https?:\/\/[^\s)]+/g)].map((match) => match[0].replace(/[.,;]+$/, ''));
    const uniqueUrls = [...new Set(urls)];
    if (!uniqueUrls.length) throw new ApcError('NO_EVIDENCE_RETURNED', 'DeepSeek Harness 未返回可验证来源，研究未完成。');
    const sourcePages: PageFetchResult[] = await Promise.all(uniqueUrls.slice(0, 12).map((url) => fetchPageWithFallback(url)));
    const sources: Source[] = sourcePages.map((page, index) => ({
      id: id('ev'),
      title: page.method === 'playwright' ? `Playwright 回退来源 ${index + 1}` : `ACP 来源 ${index + 1}`,
      url: page.finalUrl || uniqueUrls[index],
      type: page.method === 'playwright' ? 'web-playwright' : 'web',
      capturedAt: now(),
      excerpt: (page.text || finalText).slice(0, 300),
      status: page.method === 'failed' ? 'pending' : 'verified',
    }));
    const sourceIds = sources.map((source) => source.id);
    const insights: Insight[] = [{ id: id('ins'), title: 'ACP 返回的研究摘要', body: finalText.slice(0, 1200), confidence: 0.5, evidenceIds: sourceIds, review: 'pending' }];
    research.messages.push({ id: id('msg'), role: 'assistant', text: finalText, at: now(), status: 'completed' });
    update({ status: 'completed', harnessSessionId: result.sessionId, sources, insights, activities: [...research.activities, { id: id('act'), label: 'DeepSeek Harness ACP 会话完成', detail: `${result.updates.length} 条事件`, status: 'completed', at: now() }] });
    bridge.close();
    activeBridges.delete(researchId);
  } catch (error) {
    activeBridges.delete(researchId);
    const message = error instanceof Error ? error.message : '未知错误';
    research.messages.push({ id: id('msg'), role: 'system', text: `执行失败：${message}`, at: now(), status: 'failed' });
    update({ status: 'failed', error: message, activities: [...research.activities, { id: id('act'), label: '研究失败', detail: message, status: 'failed', at: now() }] });
  }
}

async function runCompanyCheck(researchId: string, company: string) {
  const research = db.researches.find((item) => item.id === researchId); if (!research) return;
  const update = (patch: Partial<Research>) => { Object.assign(research, patch, { updatedAt: now() }); db = readDb(); const index = db.researches.findIndex((item) => item.id === researchId); if (index >= 0) db.researches[index] = research; writeDb(db); };
  try {
    const bridge = new DeepSeekAcpBridge(rootDir, research.userId);
    activeBridges.set(researchId, bridge);
    const appendEvent = (message: RpcMessage) => {
      const event = summarizeAcpUpdate(message);
      research.activities.push({ id: id('act'), label: event.label, detail: event.text.slice(0, 600), status: 'running', at: now() });
      research.messages.push({ id: id('msg'), role: event.role, text: event.text.slice(0, 4000), at: now(), status: event.role === 'assistant' ? 'streaming' : 'completed' });
      update({});
    };
    const result = await bridge.run(`你是企业核验 Agent。请只使用已挂载的企查查 MCP 工具核验企业“${company}”。如果存在多个同名主体，先列出候选并说明需要用户确认；不要猜测主体。请全程使用简体中文返回工具结果和调用时间，不要编造工商信息。`, appendEvent);
    const finalText = cleanFinalAgentText(result.finalText);
    if (!finalText) throw new ApcError('QCC_EMPTY_RESULT', '企查查 MCP 未返回核验结果。');
    const source: Source = { id: id('ev'), title: `企查查 MCP：${company}`, url: `mcp://qcc/${encodeURIComponent(company)}`, type: 'qcc-mcp', capturedAt: now(), excerpt: finalText.slice(0, 500), status: 'verified' };
    research.sources.push(source);
    research.insights.push({ id: id('ins'), title: `${company} 企业核验结果`, body: finalText.slice(0, 1400), confidence: 0.7, evidenceIds: [source.id], review: 'pending' });
    research.messages.push({ id: id('msg'), role: 'assistant', text: finalText, at: now(), status: 'completed' });
    update({ status: 'completed', harnessSessionId: result.sessionId, activities: [...research.activities, { id: id('act'), label: '企查查 MCP 核验完成', detail: company, status: 'completed', at: now() }] });
    bridge.close();
    activeBridges.delete(researchId);
  } catch (error) {
    activeBridges.delete(researchId);
    const message = error instanceof Error ? error.message : '未知错误';
    research.messages.push({ id: id('msg'), role: 'system', text: `企业核验失败：${message}`, at: now(), status: 'failed' });
    update({ status: 'failed', error: message, activities: [...research.activities, { id: id('act'), label: '企查查 MCP 核验失败', detail: message, status: 'failed', at: now() }] });
  }
}

const app = express();
app.use(cors()); app.use(express.json({ limit: '1mb' }));
app.get('/api/health', (_req, res) => {
  const hasAcpConfig = Boolean(process.env.DEEPSEEK_HARNESS_COMMAND || process.env.DEEPSEEK_API_KEY || Object.values(db.settings).some((settings) => settings.provider === 'custom' ? settings.customApi : settings.deepseekApiKey));
  const hasQccConfig = Boolean(process.env.QCC_MCP_COMMAND || process.env.QCC_MCP_URL || process.env.QCC_MCP_API_KEY || process.env.QCC_MCP_SERVERS || Object.values(db.settings).some((settings) => settings.qccApiKey || settings.qccServers));
  res.json({ ok: true, integrations: { acp: redactedEnv(hasAcpConfig ? 'configured' : undefined), qccMcp: redactedEnv(hasQccConfig ? 'configured' : undefined) } });
});
app.get('/api/auth/setup', (_req, res) => res.json({ required: db.users.length === 0 }));
app.post('/api/auth/setup', (req, res) => {
  if (db.users.length > 0) return res.status(409).json({ error: 'SETUP_ALREADY_COMPLETED', message: '本机账号已经创建。' });
  try {
    const account = validateAccountInput(req.body);
    const user: User = { id: id('usr'), email: account.email, name: account.name, passwordHash: hashPassword(account.password) };
    db.users.push(user);
    const token = crypto.randomBytes(24).toString('hex');
    db.sessions[token] = user.id;
    writeDb(db);
    res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    const err = error as ApcError;
    res.status(400).json({ error: err.code || 'INVALID_ACCOUNT', message: err.message || '账号信息无效。' });
  }
});
app.post('/api/auth/login', (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const user = db.users.find((item) => item.email.toLowerCase() === email);
  if (!user || !verifyPassword(user, password)) return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: '邮箱或密码错误。' });
  if (!user.passwordHash) { user.passwordHash = hashPassword(password); delete user.password; writeDb(db); }
  const token = crypto.randomBytes(24).toString('hex'); db.sessions[token] = user.id; writeDb(db); res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});
app.post('/api/auth/logout', requireUser, (req, res) => { const auth = req.headers.authorization?.replace(/^Bearer\s+/i, ''); if (auth) delete db.sessions[auth]; writeDb(db); res.status(204).end(); });
app.get('/api/auth/me', requireUser, (req, res) => { const user = (req as Request & { user: User }).user; res.json({ user: { id: user.id, email: user.email, name: user.name } }); });
app.get('/api/integrations', requireUser, (req, res) => {
  const user = (req as Request & { user: User }).user;
  const settings = getIntegrationSettings(user.id);
  res.json({
    acp: { configured: settings.provider === 'custom' ? Boolean(settings.customApi) : Boolean(settings.deepseekApiKey), provider: settings.provider, mode: settings.provider === 'custom' ? 'custom API through DeepSeek Harness ACP' : 'bundled DeepSeek Harness ACP' },
    customApi: settings.customApi ? { configured: true, protocol: settings.customApi.protocol, baseUrl: settings.customApi.baseUrl, model: settings.customApi.model } : { configured: false },
    qccMcp: { configured: Boolean(settings.qccApiKey || settings.qccServers || process.env.QCC_MCP_URL || process.env.QCC_MCP_COMMAND), mode: settings.qccServers ? 'custom MCP servers' : 'QCC Streamable HTTP' },
    updatedAt: settings.updatedAt || null,
  });
});
app.put('/api/integrations', requireUser, (req, res) => {
  const user = (req as Request & { user: User }).user;
  const provider = req.body?.provider === 'custom' ? 'custom' : 'deepseek';
  const deepseekApiKey = normalizeDeepSeekKey(typeof req.body?.deepseekApiKey === 'string' ? req.body.deepseekApiKey : '');
  const previous = db.settings[user.id] || {};
  const previousCustomApi = normalizeCustomApi(previous.customApi);
  const customInput = req.body?.customApi && typeof req.body.customApi === 'object' ? { ...req.body.customApi, apiKey: typeof req.body.customApi.apiKey === 'string' && req.body.customApi.apiKey.trim() ? req.body.customApi.apiKey : previousCustomApi?.apiKey } : undefined;
  const customApi = normalizeCustomApi(customInput);
  if (provider === 'custom' && !customApi) return res.status(400).json({ error: 'INVALID_CUSTOM_API', message: '自定义 API 配置必须包含有效协议、HTTP(S) 地址、模型和 API Key。' });
  const qccApiKey = normalizeSecret(typeof req.body?.qccApiKey === 'string' ? req.body.qccApiKey : '');
  const qccServers = typeof req.body?.qccServers === 'string' ? req.body.qccServers.trim() : '';
  if (qccServers) {
    try { const parsed = JSON.parse(qccServers); if (!parsed || typeof parsed !== 'object') throw new Error('invalid'); }
    catch { return res.status(400).json({ error: 'INVALID_QCC_SERVERS', message: '企查查 MCP Server 配置必须是有效 JSON。' }); }
  }
  db.settings[user.id] = {
    ...previous,
    provider,
    deepseekApiKey: deepseekApiKey || previous.deepseekApiKey,
    ...(customApi ? { customApi } : {}),
    qccApiKey: qccApiKey || previous.qccApiKey,
    qccServers: qccServers || previous.qccServers,
    updatedAt: now(),
  };
  writeDb(db);
  res.json({ ok: true, message: 'ACP 连接设置已保存。', acp: { configured: provider === 'custom' ? Boolean(customApi) : Boolean(db.settings[user.id].deepseekApiKey), provider } });
});
app.get('/api/research', requireUser, (req, res) => { const user = (req as Request & { user: User }).user; res.json(db.researches.filter((item) => item.userId === user.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))); });
app.post('/api/research', requireUser, (req, res) => { const user = (req as Request & { user: User }).user; try { requireHarnessConfig(user.id); } catch (error) { const err = error as ApcError; return res.status(503).json({ error: err.code, message: err.message }); } const query = String(req.body?.query ?? '').trim(); if (!query) return res.status(400).json({ error: 'QUERY_REQUIRED', message: '请输入研究问题。' }); const research: Research = { id: id('res'), userId: user.id, query, title: query.length > 48 ? `${query.slice(0, 48)}…` : query, subjectType: /展会|峰会|expo|fair/i.test(query) ? 'event' : /公司|企业|集团|有限公司|company|inc/i.test(query) ? 'company' : 'question', status: 'running', createdAt: now(), updatedAt: now(), sources: [], insights: [], activities: [{ id: id('act'), label: '已创建 DeepSeek Harness ACP 任务', status: 'running', at: now() }], messages: [{ id: id('msg'), role: 'user', text: query, at: now(), status: 'completed' }], followups: [] }; db.researches.push(research); writeDb(db); void runResearch(research.id); res.status(202).json(research); });
app.get('/api/research/:id', requireUser, (req, res) => { const research = getResearch(req, res); if (research) res.json(research); });
app.post('/api/research/:id/cancel', requireUser, (req, res) => {
  const research = getResearch(req, res); if (!research) return;
  const bridge = activeBridges.get(research.id);
  if (!bridge) return res.status(409).json({ error: 'NO_ACTIVE_TASK', message: '当前没有可停止的运行任务。' });
  bridge.close(); activeBridges.delete(research.id); research.status = 'failed'; research.error = '任务已由用户停止。'; research.activities.push({ id: id('act'), label: '用户停止任务', status: 'failed', at: now() }); research.updatedAt = now(); writeDb(db); res.json(research);
});
app.post('/api/research/:id/followup', requireUser, (req, res) => { const user = (req as Request & { user: User }).user; try { requireHarnessConfig(user.id); } catch (error) { const err = error as ApcError; return res.status(503).json({ error: err.code, message: err.message }); } const research = getResearch(req, res); if (!research) return; const query = String(req.body?.query ?? '').trim(); if (!query) return res.status(400).json({ error: 'QUERY_REQUIRED', message: '请输入追问内容。' }); research.followups.push({ id: id('fup'), query, at: now() }); research.messages.push({ id: id('msg'), role: 'user', text: query, at: now(), status: 'completed' }); research.status = 'running'; research.error = undefined; research.activities.push({ id: id('act'), label: '已提交增量追问', detail: query, status: 'running', at: now() }); writeDb(db); void runResearch(research.id); res.status(202).json(research); });
app.post('/api/research/:id/insights/:insightId/review', requireUser, (req, res) => { const research = getResearch(req, res); if (!research) return; const insight = research.insights.find((item) => item.id === req.params.insightId); if (!insight) return res.status(404).json({ error: 'INSIGHT_NOT_FOUND', message: '洞察不存在。' }); const review = req.body?.review; if (!['accepted', 'rejected', 'pending'].includes(review)) return res.status(400).json({ error: 'INVALID_REVIEW', message: '审核状态无效。' }); insight.review = review; insight.reviewer = (req as Request & { user: User }).user.email; insight.reviewedAt = now(); insight.reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined; writeDb(db); res.json(research); });
app.post('/api/research/:id/company-check', requireUser, async (req, res) => { const user = (req as Request & { user: User }).user; try { requireQccConfig(user.id); } catch (error) { const err = error as ApcError; return res.status(503).json({ error: err.code, message: err.message }); } const research = getResearch(req, res); if (!research) return; const company = String(req.body?.company ?? '').trim(); if (!company) return res.status(400).json({ error: 'COMPANY_REQUIRED', message: '请输入企业名称。' }); research.status = 'running'; research.error = undefined; research.messages.push({ id: id('msg'), role: 'user', text: `查验企业：${company}`, at: now(), status: 'completed' }); research.activities.push({ id: id('act'), label: '已提交企查查 MCP 核验', detail: company, status: 'running', at: now() }); writeDb(db); void runCompanyCheck(research.id, company); res.status(202).json({ status: 'queued', message: '企查查 MCP 查询已排队，将在同一研究中保存证据。', company }); });
app.get('/api/research/:id/report.pdf', requireUser, (req, res) => {
  const research = getResearch(req, res); if (!research) return;
  const accepted = research.insights.filter((insight) => insight.review === 'accepted');
  if (!accepted.length) return res.status(409).json({ error: 'NO_ACCEPTED_INSIGHTS', message: '至少接受一条洞察后才能生成报告。' });
  const doc = new PDFDocument({ size: 'A4', margin: 52 });
  const fontPath = process.env.PDF_FONT_PATH;
  if (fontPath && fs.existsSync(fontPath)) doc.font(fontPath);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=\"${research.id}.pdf\"`);
  doc.pipe(res);
  doc.fontSize(20).text(research.title);
  doc.moveDown(.5).fontSize(10).text(`研究问题：${research.query}`);
  doc.moveDown();
  doc.fontSize(14).text('已接受洞察');
  for (const insight of accepted) { doc.moveDown(.4).fontSize(12).text(insight.title); doc.moveDown(.2).fontSize(10).text(insight.body); doc.moveDown(.2).fontSize(9).text(`证据：${insight.evidenceIds.join(', ')}`); }
  doc.moveDown(); doc.fontSize(14).text('来源目录');
  for (const source of research.sources) doc.moveDown(.3).fontSize(9).text(`${source.id}：${source.title} — ${source.url}`);
  doc.end();
});
app.get('/api/research/:id/report.md', requireUser, (req, res) => {
  const research = getResearch(req, res); if (!research) return;
  const accepted = research.insights.filter((insight) => insight.review === 'accepted');
  if (!accepted.length) return res.status(409).json({ error: 'NO_ACCEPTED_INSIGHTS', message: '至少接受一条洞察后才能生成报告。' });
  const body = [`# ${research.title}`, '', `研究问题：${research.query}`, '', '## 结论与证据表', '', '| 结论 | 置信度 | 证据 | 来源 |', '| --- | ---: | --- | --- |'];
  for (const { insight, source } of reportRows(research)) body.push(`| ${(insight.body || insight.title).replace(/\|/g, '\\|')} | ${insight.confidence} | ${source?.excerpt?.replace(/\|/g, '\\|') || '未提供'} | ${source?.url || '未提供'} |`);
  body.push('', '## 已接受洞察', ...accepted.flatMap((insight) => [`### ${insight.title}`, '', insight.body, '', `证据：${insight.evidenceIds.join(', ')}`, '']), '## 来源目录', ...research.sources.map((source) => `- ${source.id}：${source.title} — ${source.url}`));
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${research.id}.md"`);
  res.send(body.join('\n'));
});
const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
type ReportRow = { insight: Research['insights'][number]; source?: Source };
const reportRows = (research: Research): ReportRow[] => research.insights.filter((insight) => insight.review === 'accepted').flatMap((insight): ReportRow[] => {
  const evidence = insight.evidenceIds.map((sourceId) => research.sources.find((source) => source.id === sourceId)).filter(Boolean) as Source[];
  return evidence.length ? evidence.map((source) => ({ insight, source })) : [{ insight, source: undefined }];
});
app.get('/api/research/:id/report.csv', requireUser, (req, res) => {
  const research = getResearch(req, res); if (!research) return;
  const accepted = research.insights.filter((insight) => insight.review === 'accepted');
  if (!accepted.length) return res.status(409).json({ error: 'NO_ACCEPTED_INSIGHTS', message: '至少接受一条洞察后才能导出表格。' });
  const header = ['结论编号', '结论', '置信度', '审核状态', '证据编号', '证据标题', '证据URL', '证据摘录', '证据状态', '采集时间'];
  const rows = reportRows(research).map(({ insight, source }, index) => [
    `I-${String(accepted.indexOf(insight) + 1).padStart(2, '0')}`,
    insight.body || insight.title,
    insight.confidence,
    insight.review,
    source?.id || '',
    source?.title || '',
    source?.url || '',
    source?.excerpt || '',
    source?.status || '',
    source?.capturedAt || '',
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${research.id}-evidence.csv"`);
  res.send(`\uFEFF${csv}\r\n`);
});
if (process.env.SERVE_CLIENT === '1') {
  const clientDir = path.join(rootDir, 'dist');
  app.use(express.static(clientDir));
  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
}
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => { console.error(error); res.status(500).json({ error: 'INTERNAL_ERROR', message: '服务端发生未处理错误。' }); });
const port = Number(process.env.PORT || 8787); app.listen(port, () => console.log(`Domel API listening on :${port}`));
