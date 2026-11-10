import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

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
