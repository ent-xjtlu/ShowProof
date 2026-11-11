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
import {
  DEFAULT_COST,
  buildDiscoveryPrompt,
  buildDetailPrompt,
  buildExhibitionReport,
  computeCounts,
  deriveVerdict,
  diffExhibition,
  estimateCosts,
  extractJsonObject,
  normalizeDetailPayload,
  normalizeDiscoveryPayload,
  scoreExhibition,
  ROLE_LABELS,
  VERDICT_LABELS,
  type CompanyProfile,
  type CostEstimate,
  type DiscoveredExhibition,
  type Discovery,
  type Exhibitor,
  type Exhibition,
  type PublicFee,
  type SearchFilters,
} from './exhibition.js';

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
  mineruApiKey?: string;
  /** 允许 Agent 读取/增删改展会目录；默认开启。 */
  agentCatalog?: boolean;
  updatedAt?: string;
};
type AgentGrant = {
  userId: string;
  chatId: string;
  scopes: Set<string>;
  expiresAt: number;
};
type Approval = {
  id: string;
  userId: string;
  chatId: string;
  kind: 'qcc';
  companies: string[];
  status: 'pending' | 'approved' | 'rejected' | 'running' | 'done' | 'failed' | 'expired';
  note?: string;
  error?: string;
  resultPath?: string;
  createdAt: string;
  decidedAt?: string;
};
type ChatEntry = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  at: string;
  /** 系统继续对话用的内部消息，不在界面上展示。 */
  internal?: boolean;
  trace?: { label: string; detail?: string; at: string }[];
};
type ChatSession = {
  id: string;
  userId: string;
  title: string;
  messages: ChatEntry[];
  activity: { label: string; detail?: string; at: string; status: 'running' | 'completed' | 'failed' }[];
  status: 'idle' | 'running' | 'failed';
  error?: string;
  harnessSessionId?: string;
  createdAt: string;
  updatedAt: string;
};
type Db = {
  users: User[];
  sessions: Record<string, string>;
  researches: Research[];
  settings: Record<string, IntegrationSettings>;
  companies: CompanyProfile[];
  discoveries: Discovery[];
  exhibitions: Exhibition[];
  chats: ChatSession[];
  approvals: Approval[];
  /** 本地生成的下载签名密钥，用于让下载链接可直接在浏览器打开。 */
  downloadSecret?: string;
};

function readDb(): Db {
  if (!fs.existsSync(dbPath)) {
    const initial: Db = { users: [], sessions: {}, researches: [], settings: {}, companies: [], discoveries: [], exhibitions: [], chats: [], approvals: [] };
    fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2));
    return initial;
  }
  const loaded = JSON.parse(fs.readFileSync(dbPath, 'utf8')) as Partial<Db>;
  loaded.settings ||= {};
  loaded.researches ||= [];
  loaded.companies ||= [];
  loaded.discoveries ||= [];
  loaded.exhibitions ||= [];
  loaded.chats ||= [];
  loaded.approvals ||= [];
  if (!loaded.downloadSecret) loaded.downloadSecret = crypto.randomBytes(24).toString('hex');
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
if (!db.downloadSecret) { db.downloadSecret = crypto.randomBytes(24).toString('hex'); writeDb(db); }

// 清理早期原型遗留的明文密码账号：正式版本只接受 scrypt 哈希，
// 避免安装包在旧 userData 上出现“自带的初始账号”。
{
  const legacyUsers = db.users.filter((user) => !user.passwordHash && typeof user.password === 'string');
  if (legacyUsers.length) {
    const legacyIds = new Set(legacyUsers.map((user) => user.id));
    db.users = db.users.filter((user) => !legacyIds.has(user.id));
    for (const [token, userId] of Object.entries(db.sessions)) {
      if (legacyIds.has(userId)) delete db.sessions[token];
    }
    writeDb(db);
  }
}
const now = () => new Date().toISOString();

// 进程重启后，遗留的 running/researching 状态没有执行者，标记为中断以免界面永久转圈。
{
  let recovered = false;
  for (const discovery of db.discoveries) {
    if (discovery.status !== 'running') continue;
    discovery.status = 'failed';
    discovery.error = '应用已重启，任务中断，请重新发起检索。';
    discovery.stage = '已中断';
    discovery.activity.push({ label: '应用重启，任务中断', at: now(), status: 'failed' });
    discovery.updatedAt = now();
    recovered = true;
  }
  for (const chat of db.chats) {
    if (chat.status !== 'running') continue;
    chat.status = 'failed';
    chat.error = '应用已重启，对话中断，请重新发送。';
    chat.updatedAt = now();
    recovered = true;
  }
  for (const approval of db.approvals) {
    if (approval.status !== 'pending' && approval.status !== 'running') continue;
    approval.status = 'expired';
    approval.error = '应用已重启，审批失效，请重新发起。';
    recovered = true;
  }
  for (const exhibition of db.exhibitions) {
    if (exhibition.status !== 'researching') continue;
    exhibition.status = 'queued';
    exhibition.error = '上次调查被中断，请重新点「调查参展企业」。';
    exhibition.updatedAt = now();
    recovered = true;
  }
  if (recovered) writeDb(db);
}
const id = (prefix: string) => `${prefix}_${crypto.randomBytes(5).toString('hex')}`;
const redactedEnv = (value?: string) => value ? 'configured' : 'missing';
const activeBridges = new Map<string, DeepSeekAcpBridge>();
const CHAT_PERSONA_PATCH = path.join(dataDir, 'chat-persona.patch.yml');
const CHAT_PERSONA = [
  '- id: system-prompt',
  '  config:',
  '    personaPrefix: >-',
  '      You are 拾证（Shizheng）, a Chinese-first AI assistant powered by the {{model}} model.',
  '',
].join('\n');
function ensureChatPersonaPatch(): string {
  fs.writeFileSync(CHAT_PERSONA_PATCH, CHAT_PERSONA, { mode: 0o600 });
  return CHAT_PERSONA_PATCH;
}
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
  return false;
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
    provider: stored.provider ? stored.provider : stored.customApi ? 'custom' : 'deepseek',
    deepseekApiKey: normalizeDeepSeekKey(stored.deepseekApiKey || process.env.DEEPSEEK_API_KEY),
    customApi: normalizeCustomApi(stored.customApi),
    qccApiKey: normalizeSecret(stored.qccApiKey || process.env.QCC_MCP_API_KEY),
    qccServers: stored.qccServers || process.env.QCC_MCP_SERVERS,
    mineruApiKey: normalizeSecret(stored.mineruApiKey || process.env.MINERU_API_TOKEN),
    agentCatalog: stored.agentCatalog !== false,
    updatedAt: stored.updatedAt,
  };
}

/* ==========================================================================
   Agent 运行时：一次性令牌、按对话隔离的工作区、文件与审批。
   Agent 通过令牌调用 /api/agent/*，不接触 db.json、密钥或其他用户数据。
   ========================================================================== */

const agentGrants = new Map<string, AgentGrant>();
const agentWorkspacesRoot = path.join(dataDir, 'agent-workspaces');
const appUrl = process.env.SHIZHENG_APP_URL || `http://127.0.0.1:${process.env.PORT || 8787}`;
const agentMcpScript = process.env.SHIZHENG_AGENT_MCP_SCRIPT || path.join(rootDir, 'server/agent-mcp.mjs');
const crawlerDir = process.env.SHIZHENG_CRAWLER_DIR || path.join(rootDir, 'crawlers');

function downloadHash(chatId: string, relative: string, kind: 'file' | 'pdf'): string {
  return crypto.createHash('sha256').update(`${db.downloadSecret || ''}:${kind}:${chatId}:${relative}`).digest('hex').slice(0, 32);
}

function downloadUrl(chatId: string, relative: string, kind: 'file' | 'pdf' = 'file'): string {
  const base = kind === 'pdf' ? `/api/chats/${chatId}/files/report.pdf` : `/api/chats/${chatId}/files/download`;
  return `${base}?path=${encodeURIComponent(relative)}&h=${downloadHash(chatId, relative, kind)}`;
}

function verifyDownload(req: Request, chatId: string, kind: 'file' | 'pdf'): boolean {
  const provided = String(req.query.h || '');
  if (!provided) return false;
  const expected = downloadHash(chatId, String(req.query.path || ''), kind);
  return provided.length === expected.length && crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
/** 企查查核验完成后，待继续的对话消息（异步，不阻塞审核动作）。 */
const chatContinuations = new Map<string, string>();

function chatWorkspace(chatId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(chatId)) throw new ApcError('INVALID_CHAT_ID', '对话 ID 无效。');
  const dir = path.join(agentWorkspacesRoot, chatId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function issueAgentGrant(userId: string, chatId: string): string {
  const token = crypto.randomBytes(24).toString('hex');
  agentGrants.set(token, {
    userId,
    chatId,
    scopes: new Set(['catalog:read', 'catalog:write', 'file:write', 'qcc:request']),
    expiresAt: Date.now() + 2 * 60 * 60 * 1000,
  });
  for (const [key, grant] of agentGrants) {
    if (grant.expiresAt <= Date.now()) agentGrants.delete(key);
  }
  return token;
}

function requireAgentGrant(req: Request, res: Response, scope: string): AgentGrant | undefined {
  const token = String(req.headers['x-shizheng-agent-token'] || '');
  const grant = token ? agentGrants.get(token) : undefined;
  if (!grant || grant.expiresAt <= Date.now() || !grant.scopes.has(scope)) {
    res.status(401).json({ error: 'AGENT_UNAUTHORIZED', message: 'Agent 调用令牌无效或已过期。' });
    return undefined;
  }
  return grant;
}

function listWorkspaceFiles(chatId: string): { path: string; name: string; size: number; updatedAt: string }[] {
  const root = chatWorkspace(chatId);
  const files: { path: string; name: string; size: number; updatedAt: string }[] = [];
  const walk = (directory: string, depth: number) => {
    if (depth > 4 || files.length >= 200) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) { walk(absolute, depth + 1); continue; }
      if (!entry.isFile()) continue;
      const stat = fs.statSync(absolute);
      files.push({ path: path.relative(root, absolute).split(path.sep).join('/'), name: entry.name, size: stat.size, updatedAt: stat.mtime.toISOString() });
      if (files.length >= 200) return;
    }
  };
  walk(root, 0);
  return files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function resolveWorkspaceFile(chatId: string, relative: unknown): string | undefined {
  const requested = typeof relative === 'string' ? relative.trim() : '';
  if (!requested || requested.includes('\0')) return undefined;
  const root = chatWorkspace(chatId);
  const absolute = path.resolve(root, requested);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!absolute.startsWith(prefix)) return undefined;
  return absolute;
}

function writeWorkspaceFile(chatId: string, relative: string, content: string): { path: string; bytes: number } {
  const clean = relative.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean || clean.split('/').some((part) => !part || part === '..' || part === '.')) throw new ApcError('INVALID_FILE_PATH', '文件路径无效。');
  const absolute = resolveWorkspaceFile(chatId, clean);
  if (!absolute) throw new ApcError('INVALID_FILE_PATH', '文件路径必须位于本次对话的工作区内。');
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const bytes = Buffer.byteLength(content, 'utf8');
  fs.writeFileSync(absolute, content);
  return { path: clean, bytes };
}

function validateReport(title: string, markdown: string): string[] {
  const issues: string[] = [];
  if (!title.trim()) issues.push('报告缺少标题。');
  if (markdown.trim().length < 300) issues.push('报告正文过短（至少 300 字）。');
  if (!/https?:\/\//i.test(markdown) && !/mcp:\/\//i.test(markdown)) issues.push('报告至少需要 1 条可核验的来源链接。');
  if (/TODO|待补充|占位符|xxx/i.test(markdown)) issues.push('报告仍含占位内容，请补充完整。');
  return issues;
}

function createApproval(userId: string, chatId: string, companies: string[]): Approval {
  const approval: Approval = {
    id: id('apr'),
    userId,
    chatId,
    kind: 'qcc',
    companies: companies.slice(0, 5),
    status: 'pending',
    createdAt: now(),
  };
  db.approvals.push(approval);
  flushDb(true);
  return approval;
}

/**
 * 审批完成后的对话续跑：不在 HTTP 请求里等待，也不阻塞用户操作。
 * 若对话正忙，先排队，等当前轮结束再自动继续。
 */
function queueChatContinuation(chatId: string, text: string) {
  const chat = db.chats.find((item) => item.id === chatId);
  if (!chat) return;
  if (chat.status === 'running') {
    chatContinuations.set(chatId, text);
    return;
  }
  startChatContinuation(chat, text);
}

function startChatContinuation(chat: ChatSession, text: string) {
  chat.messages.push({ id: id('msg'), role: 'user', text, at: now(), internal: true });
  chat.status = 'running';
  chat.error = undefined;
  chat.updatedAt = now();
  flushDb(true);
  void runChat(chat.id);
}

function drainChatContinuations(chatId: string) {
  const pending = chatContinuations.get(chatId);
  if (!pending) return;
  chatContinuations.delete(chatId);
  const chat = db.chats.find((item) => item.id === chatId);
  if (!chat) return;
  startChatContinuation(chat, pending);
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
  private grantToken?: string;

  constructor(private userId: string, private cwd = path.join(dataDir, 'research-workspaces', userId), private variant: 'exhibition' | 'chat' = 'exhibition', private chatId?: string) {}

  /** 对话会话的令牌按需签发；一个桥接实例对应一个对话。 */
  private agentToken(): string | undefined {
    if (this.variant !== 'chat' || !this.chatId) return undefined;
    if (!this.grantToken) this.grantToken = issueAgentGrant(this.userId, this.chatId);
    return this.grantToken;
  }

  private getCommand(settings: IntegrationSettings) {
    const command = process.env.DEEPSEEK_HARNESS_COMMAND || process.execPath;
    const baseArgs = process.env.DEEPSEEK_HARNESS_ARGS
      ? JSON.parse(process.env.DEEPSEEK_HARNESS_ARGS) as string[]
      : [path.join(rootDir, 'node_modules/pnpm/bin/pnpm.cjs'), '--dir', path.join(rootDir, 'vendor/deepseek-harness'), 'dsh', '--profile', 'acp'];
    const args = [...baseArgs];
    if (settings.provider === 'custom' && settings.customApi) {
      args.push('--patch', writeCustomProviderPatch(dataDir, this.userId, settings.customApi));
    }
    if (this.variant === 'chat') args.push('--patch', ensureChatPersonaPatch());
    return { command, args };
  }

  private launch() {
    const settings = getIntegrationSettings(this.userId);
    const { command, args } = this.getCommand(settings);
    fs.mkdirSync(this.cwd, { recursive: true });
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
      try {
        const msg = JSON.parse(line) as RpcMessage;
        if (typeof msg.method === 'string') {
          // ACP 服务端也会向客户端发请求（例如 session/request_permission）。
          // 必须应答，否则写文件/执行命令会一直挂起直到超时。
          if (typeof msg.id === 'number') this.respondRequest(msg);
          else this.listeners.forEach((listener) => listener(msg));
          continue;
        }
        if (typeof msg.id === 'number' && (msg.result !== undefined || msg.error !== undefined)) {
          const item = this.pending.get(msg.id);
          if (!item) continue;
          this.pending.delete(msg.id);
          msg.error ? item.reject(new Error(msg.error.message || 'ACP error')) : item.resolve(msg.result);
        }
      } catch { /* stdout is protocol-only; malformed lines are ignored until request timeout */ }
    }
  }
  private respondRequest(msg: RpcMessage) {
    const method = String(msg.method);
    if (method === 'session/request_permission') {
      const allow = this.variant === 'chat';
      this.child?.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: { outcome: { outcome: 'selected', optionId: allow ? 'allow-once' : 'reject-once' } },
      }) + '\n');
      return;
    }
    this.child?.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Unsupported client method: ${method}` } }) + '\n');
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
  /** 直连对话：不拼接任何提示词，原样把用户消息发给 Harness。 */
  async runChat(existingSessionId: string | undefined, text: string, onUpdate?: (message: RpcMessage) => void): Promise<{ sessionId: string; finalText: string; updates: RpcMessage[] }> {
    if (!this.initialized) {
      await this.request('initialize', { protocolVersion: 1, clientInfo: { name: 'domel-market-intelligence', version: '0.1.0' }, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } });
      this.initialized = true;
    }
    let sessionId = existingSessionId;
    if (!sessionId) {
      const settings = getIntegrationSettings(this.userId);
      const chatScreenshots = this.chatId ? path.join(chatWorkspace(this.chatId), 'screenshots') : undefined;
      if (chatScreenshots) fs.mkdirSync(chatScreenshots, { recursive: true });
      const mcpServers = buildMcpServers(settings, {
        includeCatalog: settings.agentCatalog !== false,
        agentToken: this.agentToken(),
        chatId: this.chatId,
        includeQcc: false,
        screenshotDir: chatScreenshots,
      });
      const session = await this.request('session/new', { cwd: this.cwd, mcpServers });
      sessionId = String(session.sessionId);
    }
    const updates: RpcMessage[] = [];
    const listener = (message: RpcMessage) => {
      if (message.method === 'session/update') {
        updates.push(message);
        onUpdate?.(message);
      }
    };
    this.onNotification(listener);
    const prompt = await this.request('session/prompt', { sessionId, prompt: [{ type: 'text', text }] });
    this.listeners = this.listeners.filter((item) => item !== listener);
    const textParts = updates
      .map((update) => ({ update, summary: summarizeAcpUpdate(update) }))
      .filter(({ summary }) => summary.label === 'Agent 回复')
      .map(({ update, summary }) => textFromAcpContent(update.params?.update?.content ?? update.params?.content) || summary.text)
      .filter(Boolean);
    return { sessionId, finalText: textParts.join('\n').trim() || prompt?.text || '', updates };
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
function buildMcpServers(settings?: IntegrationSettings, options?: { includeCatalog?: boolean; agentToken?: string; chatId?: string; includeQcc?: boolean; screenshotDir?: string }) {
  const playwrightCommand = process.env.DEEPSEEK_HARNESS_COMMAND || process.execPath;
  const playwrightScript = process.env.PLAYWRIGHT_MCP_SCRIPT || path.join(rootDir, 'server/playwright-mcp.mjs');
  const playwrightBrowserPath = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(rootDir, 'build/playwright-browsers');
  const ocrLangPath = process.env.SHIZHENG_OCR_LANG_PATH || path.join(rootDir, 'build/ocr-data');
  const screenshotDir = options?.screenshotDir || process.env.SHIZHENG_SCREENSHOT_DIR || path.join(dataDir, 'screenshots');
  const ocrCacheDir = process.env.SHIZHENG_OCR_CACHE_DIR || path.join(dataDir, 'ocr-cache');
  const servers: any[] = [{
    name: 'playwright',
    command: playwrightCommand,
    args: [playwrightScript],
    env: [
      { name: 'PLAYWRIGHT_BROWSERS_PATH', value: playwrightBrowserPath },
      { name: 'SHIZHENG_OCR_LANG_PATH', value: ocrLangPath },
      { name: 'SHIZHENG_OCR_CACHE_DIR', value: ocrCacheDir },
      { name: 'SHIZHENG_SCREENSHOT_DIR', value: screenshotDir },
      ...(settings?.mineruApiKey || process.env.MINERU_API_TOKEN ? [{ name: 'MINERU_API_TOKEN', value: settings?.mineruApiKey || process.env.MINERU_API_TOKEN || '' }] : []),
    ],
  }];
  // 应用内工具：让 Harness 能读写展会目录、生成可下载文件与报告。
  if (options?.includeCatalog && options.agentToken) {
    servers.push({
      name: 'shizheng',
      command: playwrightCommand,
      args: [agentMcpScript],
      env: [
        { name: 'SHIZHENG_APP_URL', value: appUrl },
        { name: 'SHIZHENG_AGENT_TOKEN', value: options.agentToken },
        { name: 'SHIZHENG_CHAT_ID', value: options.chatId || '' },
        { name: 'SHIZHENG_CRAWLER_DIR', value: crawlerDir },
      ],
    });
  }
  // 对话会话不直接挂载企查查：必须经过 shizheng_qcc_verify 的用户审核，
  // 由审核后的专用会话调用 QCC MCP，避免绕过审核。
  if (options?.includeQcc === false) return servers;
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
  if (command) {
    const envObject = process.env.QCC_MCP_ENV ? JSON.parse(process.env.QCC_MCP_ENV) as Record<string, unknown> : {};
    const env = Object.entries(envObject).map(([name, value]) => ({ name, value: String(value) }));
    return [...servers, { name: 'qcc', command, args, env }];
  }
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
    const bridge = new DeepSeekAcpBridge(research.userId);
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
    const bridge = new DeepSeekAcpBridge(research.userId);
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
    mineru: { configured: Boolean(settings.mineruApiKey), mode: 'MinerU document parsing' },
    agent: { catalogEnabled: settings.agentCatalog !== false, workspaceMode: 'per-chat' },
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
  const mineruApiKey = normalizeSecret(typeof req.body?.mineruApiKey === 'string' ? req.body.mineruApiKey : '');
  const agentCatalog = typeof req.body?.agentCatalog === 'boolean' ? req.body.agentCatalog : previous.agentCatalog !== false;
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
    mineruApiKey: mineruApiKey || previous.mineruApiKey,
    agentCatalog,
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
  applyReportFont(doc);
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
/* ==========================================================================
   展会与企业信息助手
   ========================================================================== */

const REPORT_FONT = path.join(rootDir, 'assets/fonts/NotoSansCJK-Regular.ttc');
const REPORT_FONT_FAMILY = 'NotoSansCJKsc-Regular';
type PdfDoc = InstanceType<typeof PDFDocument>;

function applyReportFont(doc: PdfDoc) {
  const packaged = process.env.SHIZHENG_REPORT_FONT;
  if (packaged && fs.existsSync(packaged)) {
    doc.font(packaged, REPORT_FONT_FAMILY);
    return;
  }
  const custom = process.env.PDF_FONT_PATH;
  if (custom && fs.existsSync(custom)) {
    doc.font(custom);
    return;
  }
  if (fs.existsSync(REPORT_FONT)) doc.font(REPORT_FONT, REPORT_FONT_FAMILY);
}

let lastFlush = 0;
function flushDb(force = false) {
  const stamp = Date.now();
  if (!force && stamp - lastFlush < 700) return;
  lastFlush = stamp;
  writeDb(db);
}

const asText = (value: unknown, max = 240) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const asList = (value: unknown, max = 24): string[] => {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,，、\n]/) : [];
  return list.map((item) => asText(item, 60)).filter(Boolean).slice(0, max);
};
const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed * 100) / 100)) : fallback;
};

const asIsoDate = (value: unknown): string | undefined => {
  const text = asText(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  return Number.isNaN(Date.parse(`${text}T00:00:00Z`)) ? undefined : text;
};

function blankProfile(userId: string): CompanyProfile {
  return {
    id: '',
    userId,
    name: '',
    description: '',
    products: [],
    customers: [],
    industry: '',
    targetMarkets: [],
    filters: { countries: [], years: [], industries: [], scale: 'any', purpose: 'any' },
    cost: DEFAULT_COST,
    createdAt: now(),
    updatedAt: now(),
  };
}

function agentExhibitionSources(body: any): Exhibition['sources'] {
  const urls = asList(body?.sourceUrls, 8).filter((url) => /^https?:\/\//i.test(url));
  return urls.map((url) => ({
    id: id('ev'),
    title: url.slice(0, 120),
    url,
    type: 'web',
    capturedAt: now(),
    excerpt: '',
    status: 'pending' as const,
  }));
}

/** Agent 新建展会：查重 + 复用评分/费用/结论模型，来源标记为 agent。 */
function createAgentExhibition(userId: string, body: any): { exhibition: Exhibition; duplicate: boolean } {
  const name = asText(body?.name, 120);
  if (!name) throw new ApcError('EXHIBITION_NAME_REQUIRED', '请提供展会名称。');
  const city = asText(body?.city, 80) || '待确认';
  const country = asText(body?.country, 80) || '待确认';
  const startDate = asIsoDate(body?.startDate);
  const endDate = asIsoDate(body?.endDate);
  const year = (startDate || endDate || '').slice(0, 4);
  const normalizeName = (value: string) => value
    .toLowerCase()
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/第[0-9一二三四五六七八九十百]+届/g, '')
    .replace(/20\d{2}/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
  const normalized = normalizeName(name);
  const duplicate = db.exhibitions.find((item) => item.userId === userId && !item.archivedAt
    && (!year || !item.startDate || item.startDate.slice(0, 4) === year)
    && (normalizeName(item.name) === normalized || (normalized.length >= 4 && normalizeName(item.name).includes(normalized))));
  if (duplicate) return { exhibition: duplicate, duplicate: true };

  const profile = companyProfileOf(userId) || blankProfile(userId);
  const counts = computeCounts([]);
  const fitScore = clampNumber(body?.fitScore, 0, 100, 60);
  const score = scoreExhibition(fitScore, counts);
  const publicFees: PublicFee[] = [];
  const record: Exhibition = {
    id: id('exh'),
    userId,
    discoveryId: 'agent',
    status: 'queued',
    name,
    type: asText(body?.type, 80) || undefined,
    startDate,
    endDate,
    city,
    country,
    venue: asText(body?.venue, 160) || undefined,
    organizer: asText(body?.organizer, 160) || undefined,
    theme: asText(body?.theme, 400) || undefined,
    exhibitScope: asText(body?.exhibitScope, 800) || undefined,
    website: asText(body?.website, 300) || undefined,
    fitScore,
    fitReasons: asList(body?.fitReasons, 12),
    mismatchReasons: [],
    exhibitors: [],
    counts,
    score,
    verdict: deriveVerdict(score, counts),
    verdictReason: '由 Agent 加入目录，参展企业尚未调查。',
    actionPlan: [],
    publicFees,
    cost: estimateCosts(profile, { country, city, startDate, endDate, publicFees }),
    sources: agentExhibitionSources(body),
    watched: false,
    changes: [],
    origin: 'agent',
    createdAt: now(),
    updatedAt: now(),
  };
  db.exhibitions.push(record);
  return { exhibition: record, duplicate: false };
}

/** Agent 更新展会：白名单字段 + 重新计算评分与费用。 */
function updateAgentExhibition(exhibition: Exhibition, body: any): Exhibition {
  const patch = body?.patch && typeof body.patch === 'object' ? body.patch : body;
  const textFields: [keyof Exhibition, number][] = [
    ['name', 120], ['type', 80], ['city', 80], ['country', 80], ['venue', 160],
    ['organizer', 160], ['theme', 400], ['exhibitScope', 800], ['participation', 200],
    ['website', 300], ['registrationDeadline', 40],
  ];
  for (const [field, max] of textFields) {
    if (!(field in patch)) continue;
    const value = asText((patch as any)[field], max);
    if (field === 'name' && !value) throw new ApcError('EXHIBITION_NAME_REQUIRED', '展会名称不能为空。');
    if (field === 'registrationDeadline') {
      (exhibition as any)[field] = asIsoDate(value) || undefined;
    } else {
      (exhibition as any)[field] = value || undefined;
    }
  }
  if ('startDate' in patch) exhibition.startDate = asIsoDate((patch as any).startDate);
  if ('endDate' in patch) exhibition.endDate = asIsoDate((patch as any).endDate);
  if ('fitScore' in patch) exhibition.fitScore = clampNumber((patch as any).fitScore, 0, 100, exhibition.fitScore);
  if ('fitReasons' in patch) exhibition.fitReasons = asList((patch as any).fitReasons, 12);
  if ('mismatchReasons' in patch) exhibition.mismatchReasons = asList((patch as any).mismatchReasons, 12);
  if ('watched' in patch) exhibition.watched = Boolean((patch as any).watched);
  if ('note' in patch) exhibition.agentNote = asText((patch as any).note, 1000) || undefined;
  if ('status' in patch) {
    const status = asText((patch as any).status, 20);
    if (!['queued', 'researching', 'ready', 'failed'].includes(status)) {
      throw new ApcError('INVALID_EXHIBITION_STATUS', '状态必须是 queued、researching、ready 或 failed。');
    }
    exhibition.status = status as Exhibition['status'];
    if (status !== 'failed') exhibition.error = undefined;
    exhibition.changes.push({ at: now(), type: 'status', detail: `状态改为 ${status}` });
  }
  exhibition.score = scoreExhibition(exhibition.fitScore, exhibition.counts);
  exhibition.verdict = deriveVerdict(exhibition.score, exhibition.counts);
  exhibition.updatedAt = now();
  const profile = companyProfileOf(exhibition.userId);
  if (profile) exhibition.cost = estimateCosts(profile, exhibition);
  return exhibition;
}

const companyProfileOf = (userId: string) => db.companies.find((item) => item.userId === userId);

/** 读取时按当前企业画像重算费用，改了展位面积/人数/住宿档位后立即生效。 */
function refreshCost(exhibition: Exhibition): Exhibition {
  const profile = companyProfileOf(exhibition.userId);
  if (profile) exhibition.cost = estimateCosts(profile, exhibition);
  return exhibition;
}

function profileFromBody(userId: string, body: any, existing?: CompanyProfile): CompanyProfile {
  const name = asText(body?.name, 80);
  const description = asText(body?.description, 1200);
  const website = asText(body?.website, 300);
  if (!name) throw new ApcError('COMPANY_NAME_REQUIRED', '请填写企业名称。');
  if (!description && !website) throw new ApcError('COMPANY_BASIS_REQUIRED', '请至少填写主营业务或官网。');
  const filtersInput = body?.filters && typeof body.filters === 'object' ? body.filters : {};
  const filters: SearchFilters = {
    countries: asList(filtersInput.countries, 8),
    years: (Array.isArray(filtersInput.years) ? filtersInput.years : [])
      .map((year: unknown) => Number.parseInt(String(year), 10))
      .filter((year: number) => Number.isFinite(year) && year >= 2000 && year <= 2100)
      .slice(0, 6),
    industries: asList(filtersInput.industries, 8),
    scale: ['any', 'large', 'international'].includes(filtersInput.scale) ? filtersInput.scale : 'any',
    purpose: ['any', 'customers', 'partners'].includes(filtersInput.purpose) ? filtersInput.purpose : 'any',
    note: asText(filtersInput.note, 300) || undefined,
  };
  const costInput = body?.cost && typeof body.cost === 'object' ? body.cost : {};
  const timestamp = now();
  return {
    id: existing?.id ?? id('cmp'),
    userId,
    name,
    website: website || undefined,
    description,
    products: asList(body?.products),
    customers: asList(body?.customers),
    industry: asText(body?.industry, 80),
    targetMarkets: asList(body?.targetMarkets),
    filters,
    cost: {
      boothAreaSqm: clampNumber(costInput.boothAreaSqm, 6, 500, existing?.cost.boothAreaSqm ?? DEFAULT_COST.boothAreaSqm),
      staffCount: clampNumber(costInput.staffCount, 1, 60, existing?.cost.staffCount ?? DEFAULT_COST.staffCount),
      days: clampNumber(costInput.days, 1, 14, existing?.cost.days ?? DEFAULT_COST.days),
      originCity: 'originCity' in costInput ? asText(costInput.originCity, 40) : existing?.cost.originCity || '',
      hotelTier: (['economy', 'standard', 'premium'].includes(costInput.hotelTier) ? costInput.hotelTier : existing?.cost.hotelTier ?? 'standard') as CompanyProfile['cost']['hotelTier'],
      sponsorshipBudget: clampNumber(costInput.sponsorshipBudget, 0, 10_000_000, existing?.cost.sponsorshipBudget ?? 0),
    },
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

function getDiscovery(req: Request, res: Response) {
  const user = (req as Request & { user: User }).user;
  const discovery = db.discoveries.find((item) => item.id === req.params.id && item.userId === user.id);
  if (!discovery) { res.status(404).json({ error: 'NOT_FOUND', message: '发现任务不存在或无权访问。' }); return; }
  return discovery;
}
function getExhibition(req: Request, res: Response) {
  const user = (req as Request & { user: User }).user;
  const exhibition = db.exhibitions.find((item) => item.id === req.params.id && item.userId === user.id);
  if (!exhibition) { res.status(404).json({ error: 'NOT_FOUND', message: '展会不存在或无权访问。' }); return; }
  return exhibition;
}

function trimActivity(discovery: Discovery) {
  if (discovery.activity.length > 120) discovery.activity.splice(0, discovery.activity.length - 120);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ApcError('AGENT_TIMEOUT', message)), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

async function collectSources(items: Array<{ title: string; url: string; excerpt?: string }>, type: string): Promise<Exhibition['sources']> {
  const seen = new Set<string>();
  const unique = items.filter((item) => {
    if (!/^https?:\/\//i.test(item.url) || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  }).slice(0, 4);
  const sources: Exhibition['sources'] = [];
  for (const item of unique) {
    const page = await fetchPageWithFallback(item.url).catch(() => ({ text: '', title: '', finalUrl: item.url, method: 'failed' as const }));
    sources.push({
      id: id('ev'),
      title: (page.title || item.title || item.url).slice(0, 120),
      url: page.finalUrl || item.url,
      type: page.method === 'failed' ? type : `${type}-${page.method}`,
      capturedAt: now(),
      excerpt: (page.text || item.excerpt || '').slice(0, 400),
      status: page.method === 'failed' ? 'pending' : 'verified',
    });
  }
  return sources;
}

function verdictReasonFromCounts(exhibition: Exhibition): string {
  if (!exhibition.counts.total) return exhibition.verdictReason || '尚未取得可识别的参展企业名单，建议补齐后再判断。';
  return `已识别 ${exhibition.counts.total} 家参展企业：潜在客户 ${exhibition.counts.customer} 家、合作伙伴 ${exhibition.counts.partner} 家、渠道商 ${exhibition.counts.channel} 家、供应商 ${exhibition.counts.supplier} 家、竞争对手 ${exhibition.counts.competitor} 家。${exhibition.verdictReason || ''}`.trim();
}

function exhibitionKey(item: { name: string; website?: string }): string {
  const name = item.name.toLowerCase().replace(/[\s·・()（）\[\]【】\-—_/]+/g, '');
  let host = '';
  if (item.website) {
    try { host = new URL(item.website).hostname.replace(/^www\./i, ''); } catch { host = ''; }
  }
  return `${name}|${host}`;
}

function createExhibitionRecord(discovery: Discovery, profile: CompanyProfile, item: DiscoveredExhibition): Exhibition {
  const counts = computeCounts([]);
  const score = scoreExhibition(item.fitScore, counts);
  const sources: Exhibition['sources'] = item.sources.slice(0, 6).map((source) => ({
    id: id('ev'),
    title: (source.title || source.url).slice(0, 120),
    url: source.url,
    type: 'web',
    capturedAt: now(),
    excerpt: (source.excerpt || '').slice(0, 400),
    status: 'pending' as const,
  }));
  return {
    id: id('exh'),
    userId: discovery.userId,
    discoveryId: discovery.id,
    status: 'queued',
    name: item.name,
    type: item.type,
    startDate: item.startDate,
    endDate: item.endDate,
    city: item.city,
    country: item.country,
    venue: item.venue,
    organizer: item.organizer,
    theme: item.theme,
    exhibitScope: item.exhibitScope,
    participation: item.participation,
    registrationDeadline: item.registrationDeadline,
    website: item.website,
    fitScore: item.fitScore,
    fitReasons: item.fitReasons,
    mismatchReasons: item.mismatchReasons,
    exhibitors: [],
    counts,
    score,
    verdict: deriveVerdict(score, counts),
    verdictReason: '',
    actionPlan: [],
    publicFees: item.publicFees,
    cost: estimateCosts(profile, { country: item.country, city: item.city, startDate: item.startDate, endDate: item.endDate, publicFees: item.publicFees }),
    sources,
    watched: false,
    changes: [],
    createdAt: now(),
    updatedAt: now(),
  };
}

async function runDiscovery(discoveryId: string) {
  const discovery = db.discoveries.find((item) => item.id === discoveryId);
  if (!discovery) return;
  const profile = companyProfileOf(discovery.userId);
  if (!profile) {
    discovery.status = 'failed';
    discovery.error = '企业画像不存在，请重新填写企业信息。';
    discovery.updatedAt = now();
    flushDb(true);
    return;
  }
  const bridge = new DeepSeekAcpBridge(discovery.userId);
  activeBridges.set(discoveryId, bridge);
  const touch = (patch: Partial<Discovery>) => { Object.assign(discovery, patch, { updatedAt: now() }); flushDb(); };
  const step = (label: string, detail?: string, status: 'running' | 'completed' | 'failed' = 'running') => {
    discovery.activity.push({ label, detail, at: now(), status });
    trimActivity(discovery);
    touch({});
  };
  try {
    const found = new Map<string, DiscoveredExhibition>();
    const created: Exhibition[] = [];
    const maxRounds = 3;
    const maxExhibitions = 120;
    for (let round = 1; round <= maxRounds; round += 1) {
      step(`第 ${round} 轮展会检索`, round === 1 ? '按行业展、专业展、国际展、区域展、采购会与行业日历分头检索' : `补充检索，已收录 ${created.length} 个展会`);
      const result = await withTimeout(bridge.run(buildDiscoveryPrompt(profile, { excludeNames: [...found.values()].map((item) => item.name), round }), (message) => {
        const event = summarizeAcpUpdate(message);
        discovery.activity.push({ label: event.label, detail: event.text.slice(0, 240), at: now(), status: 'running' });
        trimActivity(discovery);
        flushDb();
      }), 20 * 60 * 1000, '展会检索超时，请重试');
      const batch = normalizeDiscoveryPayload(extractJsonObject(result.finalText));
      let added = 0;
      for (const item of batch) {
        const key = exhibitionKey(item);
        if (found.has(key)) continue;
        found.set(key, item);
        const exhibition = createExhibitionRecord(discovery, profile, item);
        db.exhibitions.push(exhibition);
        created.push(exhibition);
        added += 1;
      }
      step(`第 ${round} 轮检索完成`, `新增 ${added} 个，累计 ${created.length} 个`, 'completed');
      discovery.exhibitionIds = created.map((item) => item.id);
      if (added) touch({ stage: `已找到 ${created.length} 个候选展会（第 ${round} 轮）` });
      if (!added || created.length >= maxExhibitions) break;
    }
    if (!created.length) throw new ApcError('DISCOVERY_EMPTY', '未检索到符合条件的展会，请补充企业信息或放宽筛选条件。');

    discovery.exhibitionIds = created.map((item) => item.id);
    touch({ stage: `已找到 ${created.length} 个候选展会` });
    step('展会清单已生成', `${created.length} 个候选展会，开始调查匹配度最高的 3 个`);

    const targets = [...created].sort((a, b) => b.fitScore - a.fitScore).slice(0, 3);
    let failed = 0;
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      touch({ stage: `正在调查参展企业（${index + 1}/${targets.length}）：${target.name}` });
      const ok = await researchExhibition(target.id, profile, bridge, false);
      if (!ok) failed += 1;
    }
    step('调查完成', `已完成 ${targets.length - failed}/${targets.length} 个展会的参展企业调查`, failed ? 'failed' : 'completed');
    discovery.status = failed === created.length ? 'failed' : failed ? 'partial' : 'completed';
    discovery.stage = '调查完成';
    discovery.updatedAt = now();
    flushDb(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    discovery.status = 'failed';
    discovery.error = message;
    discovery.stage = '检索失败';
    discovery.activity.push({ label: '检索失败', detail: message, at: now(), status: 'failed' });
    trimActivity(discovery);
    discovery.updatedAt = now();
    flushDb(true);
  } finally {
    bridge.close();
    activeBridges.delete(discoveryId);
  }
}

async function researchExhibition(exhibitionId: string, profile: CompanyProfile, bridge: DeepSeekAcpBridge, refresh: boolean): Promise<boolean> {
  const exhibition = db.exhibitions.find((item) => item.id === exhibitionId);
  if (!exhibition) return false;
  const discovery = db.discoveries.find((item) => item.id === exhibition.discoveryId);
  const step = (label: string, detail?: string) => {
    exhibition.activity ||= [];
    exhibition.activity.push({ label, detail, at: now() });
    if (exhibition.activity.length > 80) exhibition.activity.splice(0, exhibition.activity.length - 80);
    if (discovery) {
      discovery.activity.push({ label, detail, at: now(), status: 'running' });
      trimActivity(discovery);
    }
    flushDb();
  };
  try {
    exhibition.status = 'researching';
    exhibition.error = undefined;
    exhibition.activity = [];
    exhibition.updatedAt = now();
    flushDb(true);
    step(`正在调查：${exhibition.name}`, '读取参展商名录并核对企业主营业务');
    const result = await withTimeout(bridge.run(buildDetailPrompt(profile, exhibition), (message) => {
      const event = summarizeAcpUpdate(message);
      step(event.label, event.text.slice(0, 240));
    }), 20 * 60 * 1000, `「${exhibition.name}」调查超时`);

    const detail = normalizeDetailPayload(extractJsonObject(result.finalText));
    const previous = refresh ? JSON.parse(JSON.stringify(exhibition)) as Exhibition : undefined;
    const rawSources = [...detail.sources];
    if (detail.overview.website) rawSources.push({ title: '展会官网', url: detail.overview.website });
    for (const fee of detail.publicFees) if (fee.sourceUrl) rawSources.push({ title: `费用：${fee.label}`, url: fee.sourceUrl });
    const sources = rawSources.length ? await collectSources(rawSources, 'exhibition') : exhibition.sources;
    const exhibitors: Exhibitor[] = detail.exhibitors.map((item) => ({
      id: id('exb'),
      name: item.name,
      website: item.website,
      country: item.country,
      booth: item.booth,
      role: item.role,
      roleNote: item.roleNote,
      reason: item.reason,
      confidence: item.confidence,
      evidenceIds: sources.slice(0, 2).map((source) => source.id),
    }));

    if (detail.overview.venue) exhibition.venue = detail.overview.venue;
    if (detail.overview.organizer) exhibition.organizer = detail.overview.organizer;
    if (detail.overview.theme) exhibition.theme = detail.overview.theme;
    if (detail.overview.exhibitScope) exhibition.exhibitScope = detail.overview.exhibitScope;
    if (detail.overview.participation) exhibition.participation = detail.overview.participation;
    if (detail.overview.registrationDeadline) exhibition.registrationDeadline = detail.overview.registrationDeadline;
    if (detail.overview.website) exhibition.website = detail.overview.website;
    if (detail.publicFees.length) exhibition.publicFees = detail.publicFees;

    const counts = computeCounts(exhibitors);
    const score = scoreExhibition(exhibition.fitScore, counts);
    exhibition.exhibitors = exhibitors;
    exhibition.counts = counts;
    exhibition.score = score;
    exhibition.verdict = deriveVerdict(score, counts);
    exhibition.verdictReason = detail.verdictReason || verdictReasonFromCounts(exhibition);
    exhibition.agentVerdict = detail.agentVerdict;
    if (detail.actionPlan.length) exhibition.actionPlan = detail.actionPlan;
    exhibition.cost = estimateCosts(profile, exhibition);
    if (sources.length) exhibition.sources = sources;
    exhibition.status = 'ready';
    exhibition.lastCheckedAt = now();
    exhibition.updatedAt = now();
    step(`调查完成：${exhibition.name}`, `识别 ${exhibitors.length} 家企业 · 综合评分 ${score}`);
    if (previous) {
      const news = detail.notableUpdates.map((update) => ({ at: now(), type: 'status' as const, detail: `重点企业动态：${update}` }));
      exhibition.changes = [
        ...previous.changes,
        ...news,
        ...diffExhibition(previous, {
          startDate: exhibition.startDate,
          endDate: exhibition.endDate,
          registrationDeadline: exhibition.registrationDeadline,
          website: exhibition.website,
          publicFees: exhibition.publicFees,
          exhibitors,
          counts,
        }, now()),
      ];
    }
    flushDb(true);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    exhibition.status = 'failed';
    exhibition.error = message;
    exhibition.updatedAt = now();
    step(`调查失败：${message}`);
    flushDb(true);
    return false;
  }
}

async function runExhibitorCheck(exhibitionId: string, exhibitorId: string) {
  const exhibition = db.exhibitions.find((item) => item.id === exhibitionId);
  const exhibitor = exhibition?.exhibitors.find((item) => item.id === exhibitorId);
  if (!exhibition || !exhibitor) return;
  const profile = companyProfileOf(exhibition.userId);
  const bridge = new DeepSeekAcpBridge(exhibition.userId);
  activeBridges.set(`${exhibitionId}:${exhibitorId}`, bridge);
  try {
    const result = await withTimeout(bridge.run(`你是企业核验 Agent。请只使用已挂载的企查查 MCP 工具核验企业“${exhibitor.name}”${exhibitor.country ? `（${exhibitor.country}）` : ''}。${profile ? `该企业正在被评估为「${profile.name}」在展会「${exhibition.name}」中的潜在关系方。` : ''}如果存在多个同名主体，先列出候选并说明需要用户确认，不要猜测主体。请用简体中文输出：工商登记基本信息、股东/实际控制人、关联企业、经营风险要点，控制在 400 字以内；不要编造工商信息。`, () => undefined), 10 * 60 * 1000, '企查查核验超时');
    exhibitor.qcc = { checkedAt: now(), summary: (result.finalText || '企查查 MCP 未返回内容。').slice(0, 1200) };
    exhibition.updatedAt = now();
    flushDb(true);
  } catch (error) {
    exhibitor.qcc = { checkedAt: now(), summary: `核验失败：${error instanceof Error ? error.message : '未知错误'}` };
    exhibition.updatedAt = now();
    flushDb(true);
  } finally {
    bridge.close();
    activeBridges.delete(`${exhibitionId}:${exhibitorId}`);
  }
}

function pdfHeading(doc: PdfDoc, text: string) {
  if (doc.y > 730) doc.addPage();
  doc.moveDown(0.7).fontSize(13).fillColor('#111111').text(text);
  doc.moveDown(0.2);
}
function pdfLine(doc: PdfDoc, text: string, size = 10) {
  if (doc.y > 770) doc.addPage();
  doc.fontSize(size).fillColor('#222222').text(text, { width: 500 });
}

function moneyText(value: number): string {
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
}

function markdownToPlainText(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1（$2）')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/, '')
    .replace(/[*~]/g, '')
    .trim();
}

/** 把工作区里的 Markdown 报告渲染成 PDF（复用已打包的中文字体）。 */
function sendMarkdownPdf(markdown: string, title: string, res: Response) {
  const doc = new PDFDocument({ size: 'A4', margin: 48 }) as PdfDoc;
  applyReportFont(doc);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="report.pdf"; filename*=UTF-8''${encodeURIComponent(`${title}.pdf`)}`);
  doc.pipe(res);
  doc.fontSize(17).fillColor('#111111').text(title, { width: 500 });
  doc.moveDown(0.6);
  for (const raw of markdown.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { doc.moveDown(0.45); continue; }
    if (/^\s*(```|---|___)/.test(line)) { doc.moveDown(0.2); continue; }
    if (/^\s*\|/.test(line)) {
      const cells = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((cell) => markdownToPlainText(cell));
      if (cells.every((cell) => !cell || /^:?-{2,}:?$/.test(cell))) continue;
      doc.fontSize(8.5).fillColor('#333333').text(cells.join('   '), { width: 500 });
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      doc.moveDown(level <= 2 ? 0.5 : 0.3);
      doc.fontSize(level === 1 ? 15 : level === 2 ? 13 : 11).fillColor('#111111').text(markdownToPlainText(heading[2]), { width: 500 });
      continue;
    }
    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bullet) {
      doc.fontSize(10).fillColor('#222222').text(`• ${markdownToPlainText(bullet[1])}`, { width: 476, indent: 14 });
      continue;
    }
    doc.fontSize(10).fillColor('#222222').text(markdownToPlainText(line), { width: 500, lineGap: 2 });
  }
  doc.end();
}

function sendExhibitionPdf(exhibition: Exhibition, profile: CompanyProfile, res: Response) {
  const doc = new PDFDocument({ size: 'A4', margin: 48 }) as PdfDoc;
  applyReportFont(doc);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${exhibition.id}.pdf"`);
  doc.pipe(res);
  doc.fontSize(20).fillColor('#111111').text(exhibition.name, { width: 500 });
  doc.moveDown(0.4).fontSize(10).fillColor('#555555').text(`针对「${profile.name}」 · 结论：${VERDICT_LABELS[exhibition.verdict]} · 综合评分 ${exhibition.score}/100 · 生成于 ${now().slice(0, 10)}`);
  doc.moveDown(0.8);

  pdfHeading(doc, '一、展会基本情况');
  const basics: Array<[string, string]> = [
    ...(exhibition.type ? ([['展会类型', exhibition.type]] as Array<[string, string]>) : []),
    ['展期', exhibition.startDate ? `${exhibition.startDate}${exhibition.endDate && exhibition.endDate !== exhibition.startDate ? ` 至 ${exhibition.endDate}` : ''}` : '待确认'],
    ['城市 / 国家', [exhibition.city, exhibition.country].filter(Boolean).join('，') || '待确认'],
  ];
  if (exhibition.venue) basics.push(['展馆', exhibition.venue]);
  if (exhibition.organizer) basics.push(['主办方', exhibition.organizer]);
  if (exhibition.registrationDeadline) basics.push(['报名截止', exhibition.registrationDeadline]);
  if (exhibition.website) basics.push(['官网', exhibition.website]);
  for (const [label, value] of basics) pdfLine(doc, `${label}：${value}`);

  pdfHeading(doc, '二、推荐理由与判断');
  pdfLine(doc, `${VERDICT_LABELS[exhibition.verdict]}（综合评分 ${exhibition.score}/100）`);
  if (exhibition.verdictReason) pdfLine(doc, exhibition.verdictReason);
  if (exhibition.fitReasons.length) {
    pdfLine(doc, '匹配点：');
    for (const reason of exhibition.fitReasons) pdfLine(doc, `- ${reason}`, 9);
  }
  pdfLine(doc, `企业构成：共 ${exhibition.counts.total} 家，潜在客户 ${exhibition.counts.customer}，合作伙伴 ${exhibition.counts.partner}，渠道商 ${exhibition.counts.channel}，供应商 ${exhibition.counts.supplier}，竞争对手 ${exhibition.counts.competitor}。`);
  const modeText: Record<Exhibition['verdict'], string> = {
    attend: '参展（预订展位，并邀约重点客户到展位）',
    'visit-first': '先观展考察，再决定是否参展',
    'contact-first': '只拜访重点企业，不设展位',
    confirm: '先观展或联系主办方确认关键信息后再决定',
    skip: '不建议专程前往，可改为线上跟进',
  };
  pdfLine(doc, `建议方式：${modeText[exhibition.verdict]}`);

  pdfHeading(doc, '三、参展企业名单');
  const groups: Array<[string, Exhibitor['role']]> = [['重点潜在客户', 'customer'], ['合作伙伴', 'partner'], ['渠道商', 'channel'], ['供应商', 'supplier'], ['竞争对手', 'competitor']];
  for (const [label, role] of groups) {
    const items = exhibition.exhibitors.filter((item) => item.role === role);
    if (!items.length) continue;
    pdfLine(doc, `${label}（${items.length}）`);
    for (const item of items.slice(0, 30)) pdfLine(doc, `- ${item.name}${item.country ? `（${item.country}）` : ''}${item.reason ? ` — ${item.reason}` : ''}${item.website ? ` ${item.website}` : ''}`, 9);
  }

  pdfHeading(doc, '四、预计费用（估算）');
  for (const item of exhibition.cost.items) pdfLine(doc, `${item.label}：${moneyText(item.min)} – ${moneyText(item.max)}${item.note ? `（${item.note}）` : ''}`);
  pdfLine(doc, `参展合计：${moneyText(exhibition.cost.totalMin)} – ${moneyText(exhibition.cost.totalMax)}`);
  pdfLine(doc, `只去观展：${moneyText(exhibition.cost.modes.visit.min)} – ${moneyText(exhibition.cost.modes.visit.max)}`);
  pdfLine(doc, `只拜访重点企业：${moneyText(exhibition.cost.modes.contact.min)} – ${moneyText(exhibition.cost.modes.contact.max)}`);
  if (exhibition.publicFees.length) {
    pdfLine(doc, '公开报价线索：', 9);
    for (const fee of exhibition.publicFees) {
      pdfLine(doc, `- ${fee.label}：${fee.amount !== undefined ? `${fee.amount}${fee.currency ? ` ${fee.currency}` : ''}${fee.unit ? `/${fee.unit.replace(/^\//, '')}` : ''}` : '金额未公开'}${fee.sourceUrl ? `（${fee.sourceUrl}）` : ''}`, 9);
    }
  }
  pdfLine(doc, '以上为估算区间，不是主办方报价；下单前请以官方报价单为准。', 9);

  pdfHeading(doc, '五、建议接触的企业与行动清单');
  const priority = exhibition.exhibitors.filter((item) => item.role === 'customer' || item.role === 'partner').slice(0, 12);
  for (const item of priority) pdfLine(doc, `- ${item.name}：${item.reason || '建议提前预约'}`);
  exhibition.actionPlan.forEach((item, index) => pdfLine(doc, `${index + 1}. ${item}`));

  pdfHeading(doc, '六、报名时间与注意事项');
  pdfLine(doc, `报名截止：${exhibition.registrationDeadline || '未公开，建议直接联系主办方确认'}`);
  pdfLine(doc, '建议在截止前至少 4 周完成展位确认与行程预订；展位价格与规则以主办方最新通知为准。');

  pdfHeading(doc, '七、信息来源');
  if (exhibition.sources.length) {
    for (const source of exhibition.sources) pdfLine(doc, `- ${source.title}：${source.url}（${source.status === 'verified' ? '已核验' : '待核验'}）`, 9);
  } else {
    pdfLine(doc, '本次调查未记录到可公开验证的来源。', 9);
  }
  doc.end();
}

app.get('/api/company', requireUser, (req, res) => {
  const user = (req as Request & { user: User }).user;
  res.json({ profile: companyProfileOf(user.id) || null });
});

app.put('/api/company', requireUser, (req, res) => {
  const user = (req as Request & { user: User }).user;
  try {
    const existing = companyProfileOf(user.id);
    const profile = profileFromBody(user.id, req.body, existing);
    if (existing) Object.assign(existing, profile);
    else db.companies.push(profile);
    flushDb(true);
    res.json({ profile });
  } catch (error) {
    const err = error as ApcError;
    res.status(400).json({ error: err.code || 'INVALID_COMPANY', message: err.message || '企业信息无效。' });
  }
});

app.get('/api/discoveries', requireUser, (req, res) => {
  const user = (req as Request & { user: User }).user;
  res.json(db.discoveries.filter((item) => item.userId === user.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
});

app.post('/api/discoveries', requireUser, (req, res) => {
  const user = (req as Request & { user: User }).user;
  try { requireHarnessConfig(user.id); } catch (error) { const err = error as ApcError; return res.status(503).json({ error: err.code, message: err.message }); }
  const profile = companyProfileOf(user.id);
  if (!profile) return res.status(400).json({ error: 'COMPANY_PROFILE_REQUIRED', message: '请先填写企业信息。' });
  const running = db.discoveries.find((item) => item.userId === user.id && item.status === 'running');
  if (running) return res.status(409).json({ error: 'DISCOVERY_RUNNING', message: '已有一个检索任务在进行中，请等待完成或先停止。' });
  const discovery: Discovery = {
    id: id('dsc'),
    userId: user.id,
    profileId: profile.id,
    status: 'running',
    stage: '准备检索',
    exhibitionIds: [],
    activity: [{ label: '已创建展会检索任务', at: now(), status: 'running' }],
    createdAt: now(),
    updatedAt: now(),
  };
  db.discoveries.push(discovery);
  writeDb(db);
  void runDiscovery(discovery.id);
  res.status(202).json({ discovery });
});

app.get('/api/discoveries/:id', requireUser, (req, res) => {
  const discovery = getDiscovery(req, res);
  if (!discovery) return;
  res.json({ discovery, exhibitions: db.exhibitions.filter((item) => discovery.exhibitionIds.includes(item.id)).map(refreshCost) });
});

app.post('/api/discoveries/:id/cancel', requireUser, (req, res) => {
  const discovery = getDiscovery(req, res);
  if (!discovery) return;
  const bridge = activeBridges.get(discovery.id);
  if (!bridge) return res.status(409).json({ error: 'NO_ACTIVE_TASK', message: '当前没有可停止的检索任务。' });
  bridge.close();
  activeBridges.delete(discovery.id);
  discovery.status = 'failed';
  discovery.error = '任务已由用户停止。';
  discovery.stage = '已停止';
  discovery.activity.push({ label: '用户停止任务', at: now(), status: 'failed' });
  discovery.updatedAt = now();
  flushDb(true);
  res.json({ discovery });
});

app.get('/api/exhibitions', requireUser, (req, res) => {
  const user = (req as Request & { user: User }).user;
  const includeArchived = req.query.includeArchived === '1';
  res.json(db.exhibitions
    .filter((item) => item.userId === user.id && (includeArchived || !item.archivedAt))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(refreshCost));
});

app.get('/api/exhibitions/:id', requireUser, (req, res) => {
  const exhibition = getExhibition(req, res);
  if (exhibition) res.json({ exhibition: refreshCost(exhibition) });
});

app.patch('/api/exhibitions/:id', requireUser, (req, res) => {
  const exhibition = getExhibition(req, res);
  if (!exhibition) return;
  try {
    updateAgentExhibition(exhibition, req.body || {});
    flushDb(true);
    res.json({ exhibition: refreshCost(exhibition) });
  } catch (error) {
    const err = error as ApcError;
    res.status(400).json({ error: err.code || 'INVALID_EXHIBITION', message: err.message });
  }
});

app.post('/api/exhibitions/:id/research', requireUser, (req, res) => {
  const user = (req as Request & { user: User }).user;
  try { requireHarnessConfig(user.id); } catch (error) { const err = error as ApcError; return res.status(503).json({ error: err.code, message: err.message }); }
  const exhibition = getExhibition(req, res);
  if (!exhibition) return;
  if (exhibition.status === 'researching') return res.status(409).json({ error: 'ALREADY_RESEARCHING', message: '该展会正在调查中。' });
  const profile = companyProfileOf(user.id);
  if (!profile) return res.status(400).json({ error: 'COMPANY_PROFILE_REQUIRED', message: '请先填写企业信息。' });
  const bridge = new DeepSeekAcpBridge(user.id);
  activeBridges.set(exhibition.id, bridge);
  res.status(202).json({ exhibition });
  void researchExhibition(exhibition.id, profile, bridge, false).finally(() => {
    bridge.close();
    activeBridges.delete(exhibition.id);
  });
});

app.post('/api/exhibitions/:id/refresh', requireUser, (req, res) => {
  const user = (req as Request & { user: User }).user;
  try { requireHarnessConfig(user.id); } catch (error) { const err = error as ApcError; return res.status(503).json({ error: err.code, message: err.message }); }
  const exhibition = getExhibition(req, res);
  if (!exhibition) return;
  if (exhibition.status === 'researching') return res.status(409).json({ error: 'ALREADY_RESEARCHING', message: '该展会正在调查中。' });
  const profile = companyProfileOf(user.id);
  if (!profile) return res.status(400).json({ error: 'COMPANY_PROFILE_REQUIRED', message: '请先填写企业信息。' });
  const bridge = new DeepSeekAcpBridge(user.id);
  activeBridges.set(exhibition.id, bridge);
  res.status(202).json({ exhibition });
  void researchExhibition(exhibition.id, profile, bridge, true).finally(() => {
    bridge.close();
    activeBridges.delete(exhibition.id);
  });
});

app.post('/api/exhibitions/:id/watch', requireUser, (req, res) => {
  const exhibition = getExhibition(req, res);
  if (!exhibition) return;
  exhibition.watched = Boolean(req.body?.watched);
  exhibition.updatedAt = now();
  flushDb(true);
  res.json({ exhibition });
});

app.post('/api/exhibitions/:id/exhibitors/:exhibitorId/verify', requireUser, (req, res) => {
  const user = (req as Request & { user: User }).user;
  try { requireQccConfig(user.id); } catch (error) { const err = error as ApcError; return res.status(503).json({ error: err.code, message: err.message }); }
  const exhibition = getExhibition(req, res);
  if (!exhibition) return;
  const exhibitor = exhibition.exhibitors.find((item) => item.id === req.params.exhibitorId);
  if (!exhibitor) return res.status(404).json({ error: 'EXHIBITOR_NOT_FOUND', message: '参展企业不存在。' });
  exhibitor.qcc = { checkedAt: now(), summary: '核验中…' };
  exhibition.updatedAt = now();
  flushDb(true);
  void runExhibitorCheck(exhibition.id, exhibitor.id);
  res.status(202).json({ ok: true, message: '企查查核验已提交。' });
});

app.get('/api/exhibitions/:id/report.md', requireUser, (req, res) => {
  const exhibition = getExhibition(req, res);
  if (!exhibition) return;
  const profile = companyProfileOf(exhibition.userId);
  if (!profile) return res.status(409).json({ error: 'COMPANY_PROFILE_REQUIRED', message: '企业画像缺失。' });
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${exhibition.id}.md"`);
  res.send(buildExhibitionReport(exhibition, profile));
});

app.get('/api/exhibitions/:id/report.pdf', requireUser, (req, res) => {
  const exhibition = getExhibition(req, res);
  if (!exhibition) return;
  const profile = companyProfileOf(exhibition.userId);
  if (!profile) return res.status(409).json({ error: 'COMPANY_PROFILE_REQUIRED', message: '企业画像缺失。' });
  sendExhibitionPdf(exhibition, profile, res);
});

app.get('/api/exhibitions/:id/report.csv', requireUser, (req, res) => {
  const exhibition = getExhibition(req, res);
  if (!exhibition) return;
  const header = ['企业名称', '关系', '判断理由', '置信度', '国家', '展位', '官网'];
  const rows = exhibition.exhibitors.map((item) => [
    item.name,
    ROLE_LABELS[item.role],
    item.reason,
    String(item.confidence),
    item.country || '',
    item.booth || '',
    item.website || '',
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${exhibition.id}-exhibitors.csv"`);
  res.send(`\uFEFF${csv}\r\n`);
});

/* ==========================================================================
   Agent 内部 API：展会目录读写、工作区文件、报告、企查查审批。
   只接受 MCP 子进程携带的一次性令牌。
   ========================================================================== */

const agentExhibitionView = (item: Exhibition) => ({
  id: item.id,
  name: item.name,
  type: item.type,
  startDate: item.startDate,
  endDate: item.endDate,
  city: item.city,
  country: item.country,
  venue: item.venue,
  organizer: item.organizer,
  website: item.website,
  status: item.status,
  fitScore: item.fitScore,
  score: item.score,
  verdict: item.verdict,
  origin: item.origin || 'discovery',
  agentNote: item.agentNote,
  archivedAt: item.archivedAt,
  updatedAt: item.updatedAt,
});

app.get('/api/agent/context', (req, res) => {
  const grant = requireAgentGrant(req, res, 'catalog:read');
  if (!grant) return;
  const profile = companyProfileOf(grant.userId);
  res.json({
    profile: profile ? {
      name: profile.name,
      industry: profile.industry,
      description: profile.description,
      website: profile.website,
      products: profile.products,
      targetMarkets: profile.targetMarkets,
    } : null,
    exhibitionCount: db.exhibitions.filter((item) => item.userId === grant.userId && !item.archivedAt).length,
    archivedCount: db.exhibitions.filter((item) => item.userId === grant.userId && item.archivedAt).length,
    workspace: '本次对话工作区（相对路径）',
    chatId: grant.chatId,
  });
});

app.get('/api/agent/exhibitions', (req, res) => {
  const grant = requireAgentGrant(req, res, 'catalog:read');
  if (!grant) return;
  const query = String(req.query.query || '').trim().toLowerCase();
  const status = String(req.query.status || '').trim();
  const includeArchived = req.query.includeArchived === '1';
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const items = db.exhibitions
    .filter((item) => item.userId === grant.userId)
    .filter((item) => includeArchived || !item.archivedAt)
    .filter((item) => !status || item.status === status)
    .filter((item) => !query || `${item.name} ${item.city} ${item.country}`.toLowerCase().includes(query))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
    .map(agentExhibitionView);
  res.json({ total: items.length, exhibitions: items });
});

app.get('/api/agent/exhibitions/:id', (req, res) => {
  const grant = requireAgentGrant(req, res, 'catalog:read');
  if (!grant) return;
  const exhibition = db.exhibitions.find((item) => item.id === req.params.id && item.userId === grant.userId);
  if (!exhibition) return res.status(404).json({ error: 'NOT_FOUND', message: '展会不存在。' });
  res.json({ exhibition: { ...agentExhibitionView(exhibition), cost: refreshCost(exhibition).cost, sources: exhibition.sources, fitReasons: exhibition.fitReasons, mismatchReasons: exhibition.mismatchReasons, actionPlan: exhibition.actionPlan } });
});

app.post('/api/agent/exhibitions', (req, res) => {
  const grant = requireAgentGrant(req, res, 'catalog:write');
  if (!grant) return;
  try {
    const { exhibition, duplicate } = createAgentExhibition(grant.userId, req.body || {});
    flushDb(true);
    res.status(duplicate ? 200 : 201).json({ duplicate, exhibition: agentExhibitionView(exhibition) });
  } catch (error) {
    const err = error as ApcError;
    res.status(400).json({ error: err.code || 'INVALID_EXHIBITION', message: err.message });
  }
});

app.patch('/api/agent/exhibitions/:id', (req, res) => {
  const grant = requireAgentGrant(req, res, 'catalog:write');
  if (!grant) return;
  const exhibition = db.exhibitions.find((item) => item.id === req.params.id && item.userId === grant.userId);
  if (!exhibition) return res.status(404).json({ error: 'NOT_FOUND', message: '展会不存在。' });
  try {
    updateAgentExhibition(exhibition, req.body || {});
    flushDb(true);
    res.json({ exhibition: agentExhibitionView(exhibition) });
  } catch (error) {
    const err = error as ApcError;
    res.status(400).json({ error: err.code || 'INVALID_EXHIBITION', message: err.message });
  }
});

app.post('/api/agent/exhibitions/:id/archive', (req, res) => {
  const grant = requireAgentGrant(req, res, 'catalog:write');
  if (!grant) return;
  const exhibition = db.exhibitions.find((item) => item.id === req.params.id && item.userId === grant.userId);
  if (!exhibition) return res.status(404).json({ error: 'NOT_FOUND', message: '展会不存在。' });
  exhibition.archivedAt = now();
  const reason = asText(req.body?.reason, 500);
  if (reason) exhibition.changes.push({ at: now(), type: 'status', detail: `归档：${reason}` });
  exhibition.updatedAt = now();
  flushDb(true);
  res.json({ ok: true, exhibition: agentExhibitionView(exhibition) });
});

app.post('/api/agent/exhibitions/:id/restore', (req, res) => {
  const grant = requireAgentGrant(req, res, 'catalog:write');
  if (!grant) return;
  const exhibition = db.exhibitions.find((item) => item.id === req.params.id && item.userId === grant.userId);
  if (!exhibition) return res.status(404).json({ error: 'NOT_FOUND', message: '展会不存在。' });
  delete exhibition.archivedAt;
  exhibition.updatedAt = now();
  flushDb(true);
  res.json({ ok: true, exhibition: agentExhibitionView(exhibition) });
});

app.get('/api/agent/crawlers', (req, res) => {
  const grant = requireAgentGrant(req, res, 'catalog:read');
  if (!grant) return;
  const scripts = [
    { file: 'trafilatura_extract.py', engine: 'Trafilatura', license: 'Apache-2.0', requires: 'requests, trafilatura', usage: 'python3 trafilatura_extract.py --file urls.txt --out out/trafilatura' },
    { file: 'crawl4ai_fetch.py', engine: 'Crawl4AI', license: 'Apache-2.0', requires: 'crawl4ai', usage: 'python3 crawl4ai_fetch.py --file urls.txt --out out/crawl4ai' },
    { file: 'scrapling_fetch.py', engine: 'Scrapling', license: 'BSD-3-Clause', requires: 'scrapling', usage: 'python3 scrapling_fetch.py --file urls.txt --out out/scrapling' },
    { file: 'firecrawl_client.py', engine: 'Firecrawl', license: 'AGPL-3.0', requires: 'FIRECRAWL_API_KEY', usage: 'FIRECRAWL_API_KEY=... python3 firecrawl_client.py --file urls.txt --out out/firecrawl' },
    { file: 'scrapy_batch/scrapy.cfg', engine: 'Scrapy', license: 'BSD-3-Clause', requires: 'scrapy', usage: 'cd scrapy_batch && scrapy crawl batch -a urls=../urls.txt -O ../out/scrapy/records.jsonl' },
  ].map((item) => ({ ...item, exists: fs.existsSync(path.join(crawlerDir, item.file)) }));
  res.json({
    dir: crawlerDir,
    python: process.env.SHIZHENG_PYTHON || 'python3',
    install: `cd ${crawlerDir} && ./setup.sh          # 核心依赖\ncd ${crawlerDir} && ./setup.sh --optional  # 动态抓取/Scrapy`,
    readme: path.join(crawlerDir, 'README.md'),
    scripts,
    note: '脚本是可选工具，依赖需要用户在本机安装；采集时遵守 robots.txt 与目标站点条款。',
  });
});

app.get('/api/agent/files', (req, res) => {
  const grant = requireAgentGrant(req, res, 'file:write');
  if (!grant) return;
  const files = listWorkspaceFiles(grant.chatId).map((file) => ({
    ...file,
    downloadUrl: downloadUrl(grant.chatId, file.path),
  }));
  res.json({ files });
});

app.post('/api/agent/files', (req, res) => {
  const grant = requireAgentGrant(req, res, 'file:write');
  if (!grant) return;
  const relative = asText(req.body?.path, 300);
  const content = typeof req.body?.content === 'string' ? req.body.content : '';
  if (Buffer.byteLength(content, 'utf8') > 5 * 1024 * 1024) return res.status(413).json({ error: 'FILE_TOO_LARGE', message: '单个文件不能超过 5 MB。' });
  try {
    const written = writeWorkspaceFile(grant.chatId, relative, content);
    res.json({ ...written, downloadUrl: downloadUrl(grant.chatId, written.path) });
  } catch (error) {
    const err = error as ApcError;
    res.status(400).json({ error: err.code || 'INVALID_FILE_PATH', message: err.message });
  }
});

app.post('/api/agent/report', (req, res) => {
  const grant = requireAgentGrant(req, res, 'file:write');
  if (!grant) return;
  const title = asText(req.body?.title, 160);
  const markdown = typeof req.body?.markdown === 'string' ? req.body.markdown : '';
  const issues = validateReport(title, markdown);
  if (issues.length) return res.status(422).json({ error: 'REPORT_INVALID', message: issues.join(' '), issues });
  const slug = (title || 'report').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'report';
  const stamp = new Date().toISOString().slice(0, 10);
  const preferred = asText(req.body?.filename, 120).replace(/[\/:*?"<>|]/g, '-') || `${slug}-${stamp}.md`;
  let relative = `reports/${preferred.endsWith('.md') ? preferred : `${preferred}.md`}`;
  let suffix = 2;
  while (fs.existsSync(path.join(chatWorkspace(grant.chatId), relative))) {
    relative = `reports/${preferred.replace(/\.md$/, '')}-${suffix}.md`;
    suffix += 1;
  }
  try {
    const written = writeWorkspaceFile(grant.chatId, relative, markdown);
    res.status(201).json({ ...written, title, downloadUrl: downloadUrl(grant.chatId, written.path), pdfUrl: downloadUrl(grant.chatId, written.path, 'pdf') });
  } catch (error) {
    const err = error as ApcError;
    res.status(400).json({ error: err.code || 'INVALID_FILE_PATH', message: err.message });
  }
});

app.post('/api/agent/qcc/verify', async (req, res) => {
  const grant = requireAgentGrant(req, res, 'qcc:request');
  if (!grant) return;
  try { requireQccConfig(grant.userId); } catch (error) { const err = error as ApcError; return res.status(503).json({ error: err.code, message: err.message }); }
  const companies = Array.isArray(req.body?.companies)
    ? req.body.companies.map((item: unknown) => asText(item, 120)).filter(Boolean).slice(0, 5)
    : [asText(req.body?.company, 120)].filter(Boolean);
  if (!companies.length) return res.status(400).json({ error: 'COMPANY_REQUIRED', message: '请提供要核验的企业名称。' });
  const approval = createApproval(grant.userId, grant.chatId, companies);
  res.status(202).json({
    approvalId: approval.id,
    status: 'pending',
    companies: approval.companies,
    message: '已提交给用户审核。不要重复提交；先向用户说明需要在界面上确认，审核通过后系统会自动核验并继续。',
  });
});

// 仅测试环境：为已登录用户的指定对话签发一次性 Agent 令牌，供自动化测试使用。
if (process.env.SHIZHENG_TEST_MODE === '1') {
  app.post('/api/test/agent-grant', requireUser, (req, res) => {
    const user = (req as Request & { user: User }).user;
    const chatId = asText(req.body?.chatId, 80);
    const chat = db.chats.find((item) => item.id === chatId && item.userId === user.id);
    if (!chat) return res.status(404).json({ error: 'NOT_FOUND', message: '对话不存在。' });
    res.json({ token: issueAgentGrant(user.id, chat.id) });
  });
}

app.get('/api/files', requireUser, (req, res) => {
  const user = (req as Request & { user: User }).user;
  const chats = db.chats.filter((item) => item.userId === user.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const files = chats.flatMap((chat) => listWorkspaceFiles(chat.id).map((file) => ({
    ...file,
    chatId: chat.id,
    chatTitle: chat.title,
    downloadUrl: downloadUrl(chat.id, file.path),
    ...(file.name.endsWith('.md') ? { pdfUrl: downloadUrl(chat.id, file.path, 'pdf') } : {}),
  }))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  res.json({ files, chatCount: chats.length, totalBytes: files.reduce((sum, file) => sum + file.size, 0) });
});

app.get('/api/chats/:id/files', requireUser, (req, res) => {
  const chat = getChat(req, res);
  if (!chat) return;
  res.json({ files: listWorkspaceFiles(chat.id).map((file) => ({ ...file, downloadUrl: downloadUrl(chat.id, file.path), ...(file.name.endsWith('.md') ? { pdfUrl: downloadUrl(chat.id, file.path, 'pdf') } : {}) })) });
});

app.get('/api/chats/:id/files/download', (req, res) => {
  const user = currentUser(req);
  const chat = db.chats.find((item) => item.id === req.params.id);
  if (!chat) return res.status(404).json({ error: 'NOT_FOUND', message: '对话不存在。' });
  const owned = Boolean(user && chat.userId === user.id);
  if (!owned && !verifyDownload(req, chat.id, 'file')) return res.status(401).json({ error: 'UNAUTHENTICATED', message: '请先登录，或使用带签名的下载链接。' });
  const absolute = resolveWorkspaceFile(chat.id, req.query.path);
  if (!absolute || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return res.status(404).json({ error: 'FILE_NOT_FOUND', message: '文件不存在。' });
  const name = path.basename(absolute);
  const ascii = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const type = name.endsWith('.md') ? 'text/markdown; charset=utf-8'
    : name.endsWith('.csv') ? 'text/csv; charset=utf-8'
      : name.endsWith('.json') ? 'application/json; charset=utf-8'
        : name.endsWith('.txt') ? 'text/plain; charset=utf-8'
          : name.endsWith('.png') ? 'image/png'
            : name.endsWith('.jpg') || name.endsWith('.jpeg') ? 'image/jpeg'
              : 'application/octet-stream';
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader('Content-Length', String(fs.statSync(absolute).size));
  fs.createReadStream(absolute).pipe(res);
});

app.get('/api/chats/:id/files/report.pdf', (req, res) => {
  const user = currentUser(req);
  const chat = db.chats.find((item) => item.id === req.params.id);
  if (!chat) return res.status(404).json({ error: 'NOT_FOUND', message: '对话不存在。' });
  const owned = Boolean(user && chat.userId === user.id);
  if (!owned && !verifyDownload(req, chat.id, 'pdf')) return res.status(401).json({ error: 'UNAUTHENTICATED', message: '请先登录，或使用带签名的下载链接。' });
  const absolute = resolveWorkspaceFile(chat.id, req.query.path);
  if (!absolute || !absolute.endsWith('.md') || !fs.existsSync(absolute)) return res.status(404).json({ error: 'FILE_NOT_FOUND', message: 'Markdown 报告不存在。' });
  const markdown = fs.readFileSync(absolute, 'utf8');
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(absolute, '.md');
  sendMarkdownPdf(markdown, title, res);
});

app.get('/api/chats/:id/approvals', requireUser, (req, res) => {
  const chat = getChat(req, res);
  if (!chat) return;
  res.json({ approvals: db.approvals.filter((item) => item.chatId === chat.id && item.status === 'pending') });
});

app.get('/api/approvals/:id', requireUser, (req, res) => {
  const user = (req as Request & { user: User }).user;
  const approval = db.approvals.find((item) => item.id === req.params.id && item.userId === user.id);
  if (!approval) return res.status(404).json({ error: 'NOT_FOUND', message: '审批请求不存在。' });
  res.json({ approval });
});

app.post('/api/approvals/:id/decide', requireUser, (req, res) => {
  const user = (req as Request & { user: User }).user;
  const approval = db.approvals.find((item) => item.id === req.params.id && item.userId === user.id);
  if (!approval) return res.status(404).json({ error: 'NOT_FOUND', message: '审批请求不存在。' });
  if (approval.status !== 'pending') return res.status(409).json({ error: 'ALREADY_DECIDED', message: '该请求已处理。' });
  const decision = req.body?.decision;
  if (decision !== 'approve' && decision !== 'reject') return res.status(400).json({ error: 'INVALID_DECISION', message: '请选择同意或拒绝。' });
  approval.decidedAt = now();
  const chat = db.chats.find((item) => item.id === approval.chatId);
  if (decision === 'reject') {
    approval.status = 'rejected';
    chat?.messages.push({ id: id('msg'), role: 'system', text: '已跳过企查查核验。', at: now() });
    if (chat) chat.updatedAt = now();
    flushDb(true);
    return res.json({ approval });
  }
  approval.status = 'approved';
  chat?.messages.push({ id: id('msg'), role: 'system', text: '已同意企查查核验，正在调用企查查 MCP…', at: now() });
  if (chat) chat.updatedAt = now();
  flushDb(true);
  void runQccApproval(approval);
  res.json({ approval });
});

async function runQccApproval(approval: Approval) {
  approval.status = 'running';
  flushDb(true);
  const bridge = new DeepSeekAcpBridge(approval.userId);
  try {
    const companies = approval.companies.join('、');
    const result = await withTimeout(bridge.run(`你是企业核验 Agent。请只使用已挂载的企查查 MCP 工具核验以下企业：${companies}。逐家列出：主体全称、统一社会信用代码、法定代表人、注册资本、成立日期、经营状态、注册地址、风险提示。找不到或存在多个同名主体时明确说明，不要猜测。最后用简体中文 Markdown 汇总，并保留可回溯的字段来源。`), 8 * 60 * 1000, '企查查核验超时');
    const text = cleanFinalAgentText(result.finalText);
    if (!text) throw new ApcError('QCC_EMPTY_RESULT', '企查查 MCP 未返回核验结果。');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const written = writeWorkspaceFile(approval.chatId, `qcc/verification-${stamp}.md`, `# 企查查核验\n\n企业：${companies}\n\n${text}\n`);
    approval.status = 'done';
    approval.resultPath = written.path;
    approval.note = text.slice(0, 800);
    const chat = db.chats.find((item) => item.id === approval.chatId);
    chat?.messages.push({ id: id('msg'), role: 'system', text: `企查查核验完成，结果已保存：${written.path}`, at: now() });
    flushDb(true);
    queueChatContinuation(approval.chatId, `【企查查核验完成】结果已保存到工作区文件 ${written.path}。请读取该文件，把核验结论写入正式报告，并调用 shizheng_report_save 生成可供下载的最终报告。`);
  } catch (error) {
    approval.status = 'failed';
    approval.error = error instanceof Error ? error.message : '企查查核验失败';
    flushDb(true);
    queueChatContinuation(approval.chatId, `【企查查核验失败】${approval.error}。请在报告中注明“企查查核验未完成”，然后继续用其他来源完成报告，并调用 shizheng_report_save 生成可供下载的最终报告。`);
  } finally {
    bridge.close();
  }
}

/* ==========================================================================
   直连对话 Agent：不拼接任何提示词，原样转发到 DeepSeek Harness ACP。
   ========================================================================== */

const chatBridges = new Map<string, DeepSeekAcpBridge>();

function getChat(req: Request, res: Response) {
  const user = (req as Request & { user: User }).user;
  const chat = db.chats.find((item) => item.id === req.params.id && item.userId === user.id);
  if (!chat) { res.status(404).json({ error: 'NOT_FOUND', message: '对话不存在或无权访问。' }); return; }
  return chat;
}

async function runChat(chatId: string) {
  const chat = db.chats.find((item) => item.id === chatId);
  if (!chat) return;
  const lastUser = [...chat.messages].reverse().find((message) => message.role === 'user');
  if (!lastUser) return;
  const attempt = async (sessionId: string | undefined, bridge: DeepSeekAcpBridge) => {
    const result = await withTimeout(bridge.runChat(sessionId, lastUser.text, (message) => {
      const event = summarizeAcpUpdate(message);
      const at = now();
      chat.activity.push({ label: event.label, detail: event.text.slice(0, 200), at, status: 'running' });
      if (chat.activity.length > 80) chat.activity.splice(0, chat.activity.length - 80);
      trace.push({ label: event.label, detail: event.text.slice(0, 400), at });
      if (trace.length > 80) trace.splice(0, trace.length - 80);
      flushDb();
    }), 20 * 60 * 1000, '对话超时');
    return { result, bridge };
  };
  const trace: { label: string; detail?: string; at: string }[] = [];
  const workspace = chatWorkspace(chat.id);
  let bridge = chatBridges.get(chatId) ?? new DeepSeekAcpBridge(chat.userId, workspace, 'chat', chat.id);
  chatBridges.set(chatId, bridge);
  chat.status = 'running';
  chat.error = undefined;
  chat.updatedAt = now();
  flushDb(true);
  try {
    let result
    try {
      result = (await attempt(chat.harnessSessionId, bridge)).result;
    } catch (error) {
      // Harness 重启后旧 session 往往不可用：清掉会话，开新 session 重试一次（不注入历史或提示词）。
      if (!chat.harnessSessionId) throw error;
      chat.harnessSessionId = undefined;
      chat.messages.push({ id: id('msg'), role: 'system', text: '上一次 Harness 会话已失效，已开始新会话（之前的上下文不再保留）。', at: now() });
      bridge.close();
      chatBridges.delete(chatId);
      bridge = new DeepSeekAcpBridge(chat.userId, workspace, 'chat', chat.id);
      chatBridges.set(chatId, bridge);
      result = (await attempt(undefined, bridge)).result;
    }
    chat.harnessSessionId = result.sessionId;
    chat.messages.push({ id: id('msg'), role: 'assistant', text: result.finalText.trim() || '（没有返回文本）', at: now(), trace: [...trace] });
    chat.status = 'idle';
    chat.updatedAt = now();
    flushDb(true);
    drainChatContinuations(chatId);
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    chat.status = 'failed';
    chat.error = message;
    chat.messages.push({ id: id('msg'), role: 'system', text: `对话失败：${message}`, at: now() });
    chat.updatedAt = now();
    flushDb(true);
    drainChatContinuations(chatId);
  }
}

app.get('/api/chats', requireUser, (req, res) => {
  const user = (req as Request & { user: User }).user;
  res.json(db.chats.filter((item) => item.userId === user.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
});

app.post('/api/chats', requireUser, (req, res) => {
  const user = (req as Request & { user: User }).user;
  const chat: ChatSession = {
    id: id('cht'),
    userId: user.id,
    title: '新对话',
    messages: [],
    activity: [],
    status: 'idle',
    createdAt: now(),
    updatedAt: now(),
  };
  db.chats.push(chat);
  flushDb(true);
  res.status(201).json({ chat });
});

app.get('/api/chats/:id', requireUser, (req, res) => {
  const chat = getChat(req, res);
  if (chat) res.json({ chat });
});

app.post('/api/chats/:id/messages', requireUser, (req, res) => {
  const user = (req as Request & { user: User }).user;
  const chat = getChat(req, res);
  if (!chat) return;
  try { requireHarnessConfig(user.id); } catch (error) { const err = error as ApcError; return res.status(503).json({ error: err.code, message: err.message }); }
  if (chat.status === 'running') return res.status(409).json({ error: 'CHAT_RUNNING', message: '上一条消息还在处理中。' });
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) return res.status(400).json({ error: 'EMPTY_MESSAGE', message: '请输入消息。' });
  if (text.length > 8000) return res.status(400).json({ error: 'MESSAGE_TOO_LONG', message: '单条消息不能超过 8000 字。' });
  chat.messages.push({ id: id('msg'), role: 'user', text, at: now() });
  if (chat.messages.filter((message) => message.role === 'user').length === 1) chat.title = text.length > 24 ? `${text.slice(0, 24)}…` : text;
  chat.status = 'running';
  chat.updatedAt = now();
  flushDb(true);
  void runChat(chat.id);
  res.status(202).json({ chat });
});

app.post('/api/chats/:id/cancel', requireUser, (req, res) => {
  const chat = getChat(req, res);
  if (!chat) return;
  const bridge = chatBridges.get(chat.id);
  if (!bridge) return res.status(409).json({ error: 'NO_ACTIVE_TASK', message: '当前没有可停止的对话。' });
  bridge.close();
  chatBridges.delete(chat.id);
  chat.status = 'failed';
  chat.error = '对话已由用户停止。';
  chat.messages.push({ id: id('msg'), role: 'system', text: '对话已由用户停止。', at: now() });
  chat.updatedAt = now();
  flushDb(true);
  res.json({ chat });
});

app.delete('/api/chats/:id', requireUser, (req, res) => {
  const chat = getChat(req, res);
  if (!chat) return;
  chatBridges.get(chat.id)?.close();
  chatBridges.delete(chat.id);
  db.chats = db.chats.filter((item) => item.id !== chat.id);
  flushDb(true);
  res.status(204).end();
});

if (process.env.SERVE_CLIENT === '1') {
  const clientDir = path.join(rootDir, 'dist');
  app.use(express.static(clientDir));
  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
}
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => { console.error(error); res.status(500).json({ error: 'INTERNAL_ERROR', message: '服务端发生未处理错误。' }); });
const port = Number(process.env.PORT || 8787); app.listen(port, () => console.log(`Domel API listening on :${port}`));
