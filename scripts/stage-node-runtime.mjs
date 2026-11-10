import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

/**
 * 为当前目标平台准备随包运行时：
 * - linux：本机 Node + 本机 Playwright Chromium
 * - win：下载 Windows x64 node.exe + Windows Chromium（交叉构建用）
 *
 * 用法：node scripts/stage-node-runtime.mjs [--platform=win]
 */

const target = process.argv.includes('--platform=win') ? 'win' : 'linux'
const version = process.versions.node.split('.').map(Number)
if (version[0] < 24 || (version[0] === 24 && version[1] < 9)) {
  throw new Error(`构建安装包需要 Node >=24.9，当前是 ${process.version}`)
}

const buildDir = path.resolve('build')
const nodeRuntime = path.join(buildDir, 'node-runtime')
const browsersTarget = path.join(buildDir, 'playwright-browsers')
const markerPath = path.join(buildDir, '.runtime-platform')
fs.mkdirSync(buildDir, { recursive: true })

const previous = fs.existsSync(markerPath) ? fs.readFileSync(markerPath, 'utf8').trim() : ''
if (previous && previous !== target) {
  console.log(`运行时从 ${previous} 切换到 ${target}，清理旧目录…`)
  fs.rmSync(nodeRuntime, { recursive: true, force: true })
  fs.rmSync(browsersTarget, { recursive: true, force: true })
}
fs.mkdirSync(nodeRuntime, { recursive: true })

if (target === 'linux') {
  const output = path.join(nodeRuntime, 'node')
  fs.copyFileSync(process.execPath, output)
  fs.chmodSync(output, 0o755)
} else {
  const output = path.join(nodeRuntime, 'node.exe')
  if (!fs.existsSync(output)) {
    const url = `https://nodejs.org/dist/${process.version}/win-x64/node.exe`
    console.log(`下载 Windows Node 运行时：${url}`)
    execFileSync('curl', ['-L', '--fail', '--retry', '2', '-o', output, url], { stdio: 'inherit' })
  }
  console.log(`Windows Node runtime -> ${output} (${(fs.statSync(output).size / 1024 / 1024).toFixed(1)} MB)`)
}

const pnpmSource = path.resolve('node_modules/pnpm')
const pnpmTarget = path.join(buildDir, 'pnpm')
fs.cpSync(pnpmSource, pnpmTarget, { recursive: true })

const playwrightRuntime = path.join(buildDir, 'playwright-runtime')
fs.rmSync(playwrightRuntime, { recursive: true, force: true })
fs.mkdirSync(playwrightRuntime, { recursive: true })
fs.copyFileSync(path.resolve('server/playwright-mcp.mjs'), path.join(playwrightRuntime, 'playwright-mcp.mjs'))
fs.copyFileSync(path.resolve('server/urlSafety.mjs'), path.join(playwrightRuntime, 'urlSafety.mjs'))
fs.copyFileSync(path.resolve('server/agent-mcp.mjs'), path.join(playwrightRuntime, 'agent-mcp.mjs'))
const runtimeModules = path.join(playwrightRuntime, 'runtime-deps', 'node_modules')
fs.mkdirSync(runtimeModules, { recursive: true })
fs.cpSync(path.resolve('node_modules/playwright'), path.join(runtimeModules, 'playwright'), { recursive: true })
fs.cpSync(path.resolve('node_modules/playwright-core'), path.join(runtimeModules, 'playwright-core'), { recursive: true })

// OCR：复制 tesseract.js 及其依赖到 Playwright MCP 运行时，并把中英文语言包放到 build/ocr-data。
const ocrData = path.join(buildDir, 'ocr-data')
fs.mkdirSync(ocrData, { recursive: true })
for (const [pkg, lang] of [['@tesseract.js-data/chi_sim', 'chi_sim'], ['@tesseract.js-data/eng', 'eng']]) {
  const source = path.resolve('node_modules', pkg, '4.0.0', `${lang}.traineddata.gz`)
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(ocrData, `${lang}.traineddata.gz`))
}
const projectRequire = createRequire(path.resolve('package.json'))
try {
  const fflatePackage = projectRequire.resolve('fflate/package.json')
  fs.cpSync(path.dirname(fflatePackage), path.join(runtimeModules, 'fflate'), { recursive: true })
} catch { /* fflate 缺失时 MinerU 标准 API 的 zip 解压不可用 */ }
const tesseractRequire = createRequire(path.resolve('node_modules/tesseract.js/package.json'))
for (const dep of ['tesseract.js', 'tesseract.js-core', 'bmp-js', 'idb-keyval', 'is-url', 'node-fetch', 'regenerator-runtime', 'wasm-feature-detect', 'zlibjs']) {
  let packageJson
  try { packageJson = tesseractRequire.resolve(`${dep}/package.json`) } catch { continue }
  const source = path.dirname(packageJson)
  fs.cpSync(source, path.join(runtimeModules, dep), { recursive: true })
}

const hasChromium = fs.existsSync(browsersTarget)
  && fs.readdirSync(browsersTarget, { withFileTypes: true, recursive: true }).some((entry) => entry.isDirectory() && entry.name.startsWith('chromium-'))

if (!hasChromium && target === 'win') {
  fs.mkdirSync(browsersTarget, { recursive: true })
  execFileSync(process.execPath, [path.resolve('node_modules/playwright/cli.js'), 'install', 'chromium'], {
    env: { ...process.env, PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: 'win64', PLAYWRIGHT_BROWSERS_PATH: browsersTarget },
    stdio: 'inherit',
  })
}

if (!hasChromium && target === 'linux') {
  fs.mkdirSync(browsersTarget, { recursive: true })
  execFileSync(process.execPath, [path.resolve('node_modules/playwright/cli.js'), 'install', 'chromium'], {
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersTarget },
    stdio: 'inherit',
  })
}

if (fs.existsSync(browsersTarget)) {
  for (const entry of fs.readdirSync(browsersTarget)) {
    if (entry.startsWith('ffmpeg-') || entry.startsWith('chromium_headless_shell-')) {
      fs.rmSync(path.join(browsersTarget, entry), { recursive: true, force: true })
    }
  }
}

fs.writeFileSync(markerPath, target)
console.log(`staged ${target} runtime: node=${fs.readdirSync(nodeRuntime).join(',')} browsers=${fs.existsSync(browsersTarget) ? fs.readdirSync(browsersTarget).join(',') : 'none'}`)
