const { app, BrowserWindow, shell } = require('electron')
const { join } = require('node:path')
const fs = require('node:fs')
const { spawn } = require('node:child_process')
const { pathToFileURL } = require('node:url')

const port = Number(process.env.PORT || 8787)

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error('本地服务启动超时')
}

function runPnpm(nodeCommand, pnpmCli, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(nodeCommand, [pnpmCli, ...args], {
      cwd,
      env: { ...process.env, ...(nodeCommand === process.execPath ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`DeepSeek Harness 依赖安装失败（${code ?? 'unknown'}）`)))
  })
}

async function prepareHarness() {
  const userData = app.getPath('userData')
  const bundledSource = app.isPackaged ? join(process.resourcesPath, 'harness') : join(__dirname, '..', 'vendor', 'deepseek-harness')
  const runtime = app.isPackaged ? join(userData, 'harness-runtime') : bundledSource
  const bundledNode = join(process.resourcesPath, 'node-runtime', process.platform === 'win32' ? 'node.exe' : 'node')
  const nodeCommand = app.isPackaged && fs.existsSync(bundledNode) ? bundledNode : (process.env.DEEPSEEK_NODE_COMMAND || 'node')
  if (app.isPackaged) {
    process.env.SHIZHENG_REPORT_FONT = join(process.resourcesPath, 'fonts', 'NotoSansCJK-Regular.ttc')
    process.env.SHIZHENG_OCR_LANG_PATH = join(process.resourcesPath, 'ocr-data')
    process.env.SHIZHENG_SCREENSHOT_DIR = join(userData, 'screenshots')
    process.env.SHIZHENG_OCR_CACHE_DIR = join(userData, 'ocr-cache')
  }
  process.env.PLAYWRIGHT_BROWSERS_PATH = app.isPackaged ? join(process.resourcesPath, 'playwright-browsers') : join(__dirname, '..', 'build', 'playwright-browsers')
  process.env.PLAYWRIGHT_MCP_SCRIPT = app.isPackaged ? join(process.resourcesPath, 'playwright-runtime', 'playwright-mcp.mjs') : join(__dirname, '..', 'server', 'playwright-mcp.mjs')
  process.env.SHIZHENG_AGENT_MCP_SCRIPT = app.isPackaged ? join(process.resourcesPath, 'playwright-runtime', 'agent-mcp.mjs') : join(__dirname, '..', 'server', 'agent-mcp.mjs')
  if (app.isPackaged && !fs.existsSync(join(runtime, 'package.json'))) {
    fs.mkdirSync(runtime, { recursive: true })
    fs.cpSync(bundledSource, runtime, { recursive: true, filter: (source) => !source.includes(`${require('node:path').sep}node_modules${require('node:path').sep}`) && !source.includes(`${require('node:path').sep}.git${require('node:path').sep}`) })
  }
  const pnpmCli = app.isPackaged ? join(process.resourcesPath, 'pnpm', 'bin', 'pnpm.cjs') : join(__dirname, '..', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
  if (!fs.existsSync(join(runtime, 'node_modules'))) {
    await runPnpm(nodeCommand, pnpmCli, ['install', '--frozen-lockfile'], runtime)
  }
  process.env.DSH_HOME = join(userData, 'dsh-home')
  process.env.DEEPSEEK_HARNESS_COMMAND = nodeCommand
  process.env.DEEPSEEK_HARNESS_ARGS = JSON.stringify([pnpmCli, '--dir', runtime, 'dsh', '--profile', 'acp'])
}

async function createWindow() {
  process.env.PORT = String(port)
  process.env.SERVE_CLIENT = '1'
  process.env.DATA_DIR = join(app.getPath('userData'), 'data')
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#f4f7f8',
    title: '拾证 · 展会与企业信息助手',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent('<body style="font:16px system-ui;padding:40px;color:#17323d"><h2>正在准备 DeepSeek Harness ACP</h2><p>首次启动会自动安装运行依赖，请保持网络连接。</p></body>')}`)
  await prepareHarness()
  await import(pathToFileURL(join(__dirname, '..', 'dist-server', 'index.mjs')).href)
  await waitForServer()

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  await window.loadURL(`http://127.0.0.1:${port}/`)
}

app.whenReady().then(() => createWindow().catch((error) => {
  console.error(error)
  app.quit()
}))
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow() })
