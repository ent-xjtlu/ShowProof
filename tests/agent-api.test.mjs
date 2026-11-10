import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const port = 8898;
const testDataDir = path.resolve('tests/.tmp-agent-data');
let child;
let token;
let chatId;
let agentToken;

async function api(pathname, options = {}, auth = token) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers['content-type'] = 'application/json';
  if (auth) headers.authorization = `Bearer ${auth}`;
  const response = await fetch(`http://localhost:${port}${pathname}`, { ...options, headers });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { status: response.status, headers: response.headers, payload };
}

async function agent(pathname, options = {}) {
  return api(pathname, { ...options, headers: { ...(options.headers || {}), 'x-shizheng-agent-token': agentToken } }, token);
}

test.before(async () => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
  const tsxCli = path.resolve('node_modules/tsx/dist/cli.mjs');
  child = spawn(process.execPath, [tsxCli, 'server/index.ts'], {
    env: { ...process.env, PORT: String(port), DATA_DIR: testDataDir, SHIZHENG_TEST_MODE: '1', DEEPSEEK_HARNESS_COMMAND: '', DEEPSEEK_API_KEY: '', QCC_MCP_COMMAND: '', QCC_MCP_URL: '', QCC_MCP_API_KEY: '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(`http://localhost:${port}/api/health`)).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const setup = await fetch(`http://localhost:${port}/api/auth/setup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Agent tester', email: 'agent@example.com', password: 'test-password-123' }) });
  assert.equal(setup.status, 201);
  token = (await setup.json()).token;
  const chat = await api('/api/chats', { method: 'POST' });
  chatId = chat.payload.chat.id;
  const grant = await api('/api/test/agent-grant', { method: 'POST', body: JSON.stringify({ chatId }) });
  assert.equal(grant.status, 200);
  agentToken = grant.payload.token;
});

test.after(async () => {
  if (child) {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 1500))]);
  }
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test('agent endpoints reject missing or invalid tokens', async () => {
  const response = await fetch(`http://localhost:${port}/api/agent/context`);
  assert.equal(response.status, 401);
  const bad = await fetch(`http://localhost:${port}/api/agent/context`, { headers: { 'x-shizheng-agent-token': 'nope' } });
  assert.equal(bad.status, 401);
});

test('agent can create, list, update, archive and restore an exhibition', async () => {
  const created = await agent('/api/agent/exhibitions', { method: 'POST', body: JSON.stringify({ name: '测试国际工业博览会', city: '上海', country: '中国', startDate: '2027-09-15', endDate: '2027-09-19', website: 'https://example.com' }) });
  assert.equal(created.status, 201);
  assert.equal(created.payload.duplicate, false);
  const id = created.payload.exhibition.id;
  assert.equal(created.payload.exhibition.origin, 'agent');

  const duplicate = await agent('/api/agent/exhibitions', { method: 'POST', body: JSON.stringify({ name: '第27届测试国际工业博览会（TEST）', city: '上海', country: '中国', startDate: '2027-09-20' }) });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.payload.duplicate, true);
  assert.equal(duplicate.payload.exhibition.id, id);

  const listed = await agent('/api/agent/exhibitions?query=测试');
  assert.equal(listed.status, 200, JSON.stringify(listed.payload));
  assert.ok(listed.payload.exhibitions.some((item) => item.id === id));

  const updated = await agent(`/api/agent/exhibitions/${id}`, { method: 'PATCH', body: JSON.stringify({ patch: { venue: '国家会展中心', fitScore: 88 } }) });
  assert.equal(updated.status, 200);
  assert.equal(updated.payload.exhibition.venue, '国家会展中心');
  assert.ok(updated.payload.exhibition.score >= 44);

  const archived = await agent(`/api/agent/exhibitions/${id}/archive`, { method: 'POST', body: JSON.stringify({ reason: '测试归档' }) });
  assert.equal(archived.status, 200);
  assert.ok(archived.payload.exhibition.archivedAt);

  const visible = await api('/api/exhibitions');
  assert.equal(visible.payload.some((item) => item.id === id), false);
  const withArchived = await api('/api/exhibitions?includeArchived=1');
  assert.equal(withArchived.payload.some((item) => item.id === id), true);

  const restored = await agent(`/api/agent/exhibitions/${id}/restore`, { method: 'POST', body: '{}' });
  assert.equal(restored.status, 200);
  assert.ok(!restored.payload.exhibition.archivedAt);
});

test('agent can write, list and download workspace files', async () => {
  const written = await agent('/api/agent/files', { method: 'POST', body: JSON.stringify({ path: 'notes/hello.md', content: '# 你好\n\n测试内容' }) });
  assert.equal(written.status, 200);
  assert.equal(written.payload.path, 'notes/hello.md');

  const listed = await api(`/api/chats/${chatId}/files`);
  assert.equal(listed.status, 200, JSON.stringify(listed.payload));
  assert.ok(listed.payload.files.some((file) => file.path === 'notes/hello.md'));

  const download = await fetch(`http://localhost:${port}/api/chats/${chatId}/files/download?path=notes%2Fhello.md`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition') || '', /attachment/);
  assert.match(await download.text(), /测试内容/);

  const listedFile = listed.payload.files.find((file) => file.path === 'notes/hello.md');
  assert.ok(listedFile.downloadUrl.includes('h='));
  const direct = await fetch(`http://localhost:${port}${listedFile.downloadUrl}`);
  assert.equal(direct.status, 200);
  assert.match(await direct.text(), /测试内容/);
});

test('workspace path traversal is rejected', async () => {
  const traversal = await agent('/api/agent/files', { method: 'POST', body: JSON.stringify({ path: '../db.json', content: 'x' }) });
  assert.equal(traversal.status, 400);
  const download = await fetch(`http://localhost:${port}/api/chats/${chatId}/files/download?path=..%2Fdb.json`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(download.status, 404);
});

test('report validation rejects empty or unsourced reports and accepts a sourced one', async () => {
  const empty = await agent('/api/agent/report', { method: 'POST', body: JSON.stringify({ title: '空报告', markdown: '太短' }) });
  assert.equal(empty.status, 422);

  const valid = await agent('/api/agent/report', { method: 'POST', body: JSON.stringify({ title: '测试报告', markdown: `# 测试报告\n\n${'这是一段用于验证报告保存与下载的正文。'.repeat(30)}\n\n来源：https://example.com/source` }) });
  assert.equal(valid.status, 201);
  assert.match(valid.payload.downloadUrl, /files\/download/);
});

test('QCC verification is rejected when QCC MCP is not configured', async () => {
  const response = await agent('/api/agent/qcc/verify', { method: 'POST', body: JSON.stringify({ companies: ['测试公司'] }) });
  assert.equal(response.status, 503);
  assert.equal(response.payload.error, 'QCC_MCP_NOT_CONFIGURED');
});
