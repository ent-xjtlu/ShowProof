import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const port = 8899;
const testDataDir = path.resolve('tests/.tmp-data');
let child;
async function waitForHealth() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await fetch(`http://localhost:${port}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('server did not start');
}

test.before(async () => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
  const tsxCli = path.resolve('node_modules/tsx/dist/cli.mjs');
  const probeArgs = ['-e', "require('node:fs').writeFileSync(require('node:path').join(process.env.DATA_DIR, 'spawn-cwd.txt'), process.cwd())"];
  child = spawn(process.execPath, [tsxCli, 'server/index.ts'], { env: { ...process.env, PORT: String(port), DATA_DIR: testDataDir, DEEPSEEK_HARNESS_COMMAND: '', DEEPSEEK_HARNESS_ARGS: JSON.stringify(probeArgs), DEEPSEEK_API_KEY: '' }, stdio: 'ignore' });
  await waitForHealth();
  const setup = await fetch(`http://localhost:${port}/api/auth/setup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Test analyst', email: 'test@example.com', password: 'test-password-123' }) });
  assert.equal(setup.status, 201);
});
test.after(() => { child?.kill('SIGTERM'); fs.rmSync(testDataDir, { recursive: true, force: true }); });

test('health reports missing external integrations explicitly', async () => {
  const payload = await (await fetch(`http://localhost:${port}/api/health`)).json();
  assert.equal(payload.ok, true);
  assert.equal(payload.integrations.acp, 'missing');
  assert.equal(payload.integrations.qccMcp, 'missing');
});

test('research is blocked when ACP is not configured', async () => {
  const login = await fetch(`http://localhost:${port}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'test@example.com', password: 'test-password-123' }) });
  const { token } = await login.json();
  const response = await fetch(`http://localhost:${port}/api/research`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ query: '测试研究' }) });
  const payload = await response.json();
  assert.equal(response.status, 503);
  assert.equal(payload.error, 'DEEPSEEK_API_KEY_NOT_CONFIGURED');
});

test('integration settings never return raw credentials', async () => {
  const login = await fetch(`http://localhost:${port}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'test@example.com', password: 'test-password-123' }) });
  const { token } = await login.json();
  const response = await fetch(`http://localhost:${port}/api/integrations`, { headers: { authorization: `Bearer ${token}` } });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(typeof payload.acp.configured, 'boolean');
  assert.equal(Object.hasOwn(payload, 'deepseekApiKey'), false);
  assert.equal(Object.hasOwn(payload, 'qccApiKey'), false);
});

test('ACP settings are stored without returning the API key', async () => {
  const login = await fetch(`http://localhost:${port}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'test@example.com', password: 'test-password-123' }) });
  const { token } = await login.json();
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const saved = await fetch(`http://localhost:${port}/api/integrations`, { method: 'PUT', headers, body: JSON.stringify({ deepseekApiKey: 'secret-test-key' }) });
  assert.equal(saved.status, 200);
  const payload = await (await fetch(`http://localhost:${port}/api/integrations`, { headers: { authorization: `Bearer ${token}` } })).json();
  assert.equal(payload.acp.configured, true);
  assert.equal(Object.hasOwn(payload.acp, 'apiKey'), false);
});

test('research launches its child in a physical per-user workspace', async () => {
  const login = await fetch(`http://localhost:${port}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'test@example.com', password: 'test-password-123' }) });
  const { user, token } = await login.json();
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const saved = await fetch(`http://localhost:${port}/api/integrations`, { method: 'PUT', headers, body: JSON.stringify({ deepseekApiKey: 'test-key' }) });
  assert.equal(saved.status, 200);
  const task = await fetch(`http://localhost:${port}/api/research`, { method: 'POST', headers, body: JSON.stringify({ query: 'workspace probe' }) });
  assert.equal(task.status, 202);
  const marker = path.join(testDataDir, 'spawn-cwd.txt');
  for (let attempt = 0; attempt < 100 && !fs.existsSync(marker); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(fs.readFileSync(marker, 'utf8'), fs.realpathSync(path.join(testDataDir, 'research-workspaces', user.id)));
});

test('custom ACP provider accepts all three supported protocols without returning its key', async () => {
  const login = await fetch(`http://localhost:${port}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'test@example.com', password: 'test-password-123' }) });
  const { token } = await login.json();
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  for (const protocol of ['openai-completions', 'anthropic-messages', 'openai-responses']) {
    const saved = await fetch(`http://localhost:${port}/api/integrations`, { method: 'PUT', headers, body: JSON.stringify({ provider: 'custom', customApi: { protocol, baseUrl: 'https://gateway.example.com/v1', model: 'test-model', apiKey: 'sk-custom-test' } }) });
    assert.equal(saved.status, 200);
    const payload = await (await fetch(`http://localhost:${port}/api/integrations`, { headers: { authorization: `Bearer ${token}` } })).json();
    assert.equal(payload.acp.provider, 'custom');
    assert.equal(payload.customApi.protocol, protocol);
    assert.equal(payload.customApi.baseUrl, 'https://gateway.example.com/v1');
    assert.equal(Object.hasOwn(payload.customApi, 'apiKey'), false);
  }
});

test('web fetch safety rejects loopback and private network targets', async () => {
  const { isSafeHttpUrl } = await import('../server/urlSafety.mjs');
  assert.equal(await isSafeHttpUrl('http://127.0.0.1:8787'), false);
  assert.equal(await isSafeHttpUrl('http://localhost:8787'), false);
  assert.equal(await isSafeHttpUrl('http://192.168.1.10'), false);
});

test('exhibition workspace requires a company profile and starts empty', async () => {
  const login = await fetch(`http://localhost:${port}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'test@example.com', password: 'test-password-123' }) });
  const { token } = await login.json();
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  const configured = await fetch(`http://localhost:${port}/api/integrations`, { method: 'PUT', headers, body: JSON.stringify({ provider: 'custom', customApi: { protocol: 'openai-completions', baseUrl: 'https://gateway.example.com/v1', model: 'test-model', apiKey: 'sk-custom-test' } }) });
  assert.equal(configured.status, 200);

  const blocked = await fetch(`http://localhost:${port}/api/discoveries`, { method: 'POST', headers });
  assert.equal(blocked.status, 400);
  assert.equal((await blocked.json()).error, 'COMPANY_PROFILE_REQUIRED');

  const empty = await (await fetch(`http://localhost:${port}/api/exhibitions`, { headers })).json();
  assert.deepEqual(empty, []);

  const missing = await fetch(`http://localhost:${port}/api/exhibitions/exh_missing`, { headers });
  assert.equal(missing.status, 404);

  const saved = await fetch(`http://localhost:${port}/api/company`, { method: 'PUT', headers, body: JSON.stringify({ name: '测试企业', description: '工业视觉检测设备', industry: '工业自动化', filters: { countries: ['中国'], years: [2027] }, cost: { boothAreaSqm: 18, staffCount: 4, originCity: '苏州' } }) });
  assert.equal(saved.status, 200);
  const read = await (await fetch(`http://localhost:${port}/api/company`, { headers })).json();
  assert.equal(read.profile.name, '测试企业');
  assert.equal(read.profile.filters.years[0], 2027);
  assert.equal(read.profile.cost.boothAreaSqm, 18);
});
