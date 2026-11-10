import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

// 交叉构建会切换 build/ 下的运行时；开发前若平台不匹配，先恢复本机运行时。
const expected = process.platform === 'win32' ? 'win' : 'linux'
const markerPath = path.resolve('build/.runtime-platform')
const marker = fs.existsSync(markerPath) ? fs.readFileSync(markerPath, 'utf8').trim() : ''
if (marker && marker !== expected) {
  console.log(`检测到 ${marker} 运行时，恢复为 ${expected} 运行时…`)
  execFileSync(process.execPath, [path.resolve('scripts/stage-node-runtime.mjs')], { stdio: 'inherit' })
}

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
