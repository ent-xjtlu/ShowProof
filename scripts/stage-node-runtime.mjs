import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const version = process.versions.node.split('.').map(Number)
if (version[0] < 24 || (version[0] === 24 && version[1] < 9)) {
  throw new Error(`构建 DeepSeek Harness ACP 安装包需要 Node >=24.9，当前是 ${process.version}`)
}

const outputDir = path.resolve('build/node-runtime')
const output = path.join(outputDir, process.platform === 'win32' ? 'node.exe' : 'node')
fs.mkdirSync(outputDir, { recursive: true })
fs.copyFileSync(process.execPath, output)
if (process.platform !== 'win32') fs.chmodSync(output, 0o755)
const pnpmSource = path.resolve('node_modules/pnpm')
const pnpmTarget = path.resolve('build/pnpm')
fs.cpSync(pnpmSource, pnpmTarget, { recursive: true })
const playwrightRuntime = path.resolve('build/playwright-runtime')
fs.mkdirSync(path.join(playwrightRuntime, 'node_modules'), { recursive: true })
fs.copyFileSync(path.resolve('server/playwright-mcp.mjs'), path.join(playwrightRuntime, 'playwright-mcp.mjs'))
fs.copyFileSync(path.resolve('server/urlSafety.mjs'), path.join(playwrightRuntime, 'urlSafety.mjs'))
fs.cpSync(path.resolve('node_modules/playwright'), path.join(playwrightRuntime, 'node_modules/playwright'), { recursive: true })
fs.cpSync(path.resolve('node_modules/playwright-core'), path.join(playwrightRuntime, 'node_modules/playwright-core'), { recursive: true })
const browsersTarget = path.resolve('build/playwright-browsers')
const hasChromium = fs.existsSync(browsersTarget) && fs.readdirSync(browsersTarget, { withFileTypes: true, recursive: true }).some((entry) => entry.isDirectory() && entry.name.startsWith('chromium-'))
if (!hasChromium) {
  fs.mkdirSync(browsersTarget, { recursive: true })
  execFileSync(process.execPath, [path.resolve('node_modules/playwright/cli.js'), 'install', 'chromium'], {
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersTarget },
    stdio: 'inherit',
  })
}
for (const entry of fs.readdirSync(browsersTarget)) {
  if (entry.startsWith('ffmpeg-') || entry.startsWith('chromium_headless_shell-')) fs.rmSync(path.join(browsersTarget, entry), { recursive: true, force: true })
}
console.log(`staged Node runtime ${process.version} -> ${output}`)
