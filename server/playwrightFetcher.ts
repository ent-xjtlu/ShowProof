import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { assertSafeHttpUrl, isSafeHttpUrl } from './urlSafety.js';

const browserPath = process.env.PLAYWRIGHT_BROWSERS_PATH || path.resolve('build/playwright-browsers');

function findChromiumExecutable(root: string): string | undefined {
  if (!fs.existsSync(root)) return undefined;
  const names = process.platform === 'win32' ? ['chrome.exe', 'chrome-headless-shell.exe'] : process.platform === 'darwin' ? ['Chromium', 'chrome-headless-shell'] : ['chrome', 'chrome-headless-shell'];
  const visit = (directory: string): string | undefined => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const found = visit(candidate);
        if (found) return found;
      } else if (names.includes(entry.name)) return candidate;
    }
    return undefined;
  };
  return visit(root);
}

const chromiumExecutable = findChromiumExecutable(browserPath);

export type PageFetchResult = {
  text: string;
  title: string;
  finalUrl: string;
  method: 'http' | 'playwright' | 'failed';
};

let browserPromise: Promise<Browser> | undefined;

async function getBrowser(): Promise<Browser> {
  browserPromise ||= chromium.launch({ headless: true, ...(chromiumExecutable ? { executablePath: chromiumExecutable } : {}) });
  try {
    return await browserPromise;
  } catch (error) {
    browserPromise = undefined;
    throw error;
  }
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

async function fetchWithHttp(url: string): Promise<PageFetchResult | null> {
  try {
    let currentUrl = url;
    let response: Response | undefined;
    for (let redirect = 0; redirect <= 3; redirect += 1) {
      if (!(await isSafeHttpUrl(currentUrl))) return null;
      response = await fetch(currentUrl, { redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { 'user-agent': 'ShizhengResearch/0.1 (+local ACP)' } });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get('location');
      if (!location || redirect === 3) return null;
      currentUrl = new URL(location, currentUrl).toString();
    }
    if (!response || !response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return null;
    const text = cleanText((await response.text()).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));
    if (text.length < 240 || /(just a moment|enable javascript|captcha|access denied|checking your browser|cf-chl)/i.test(text)) return null;
    return { text, title: '', finalUrl: response.url || url, method: 'http' };
  } catch {
    return null;
  }
}

async function fetchWithPlaywright(url: string): Promise<PageFetchResult> {
  let browser: Browser | undefined;
  try {
    await assertSafeHttpUrl(url);
    browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: 'ShizhengResearch/0.1 (Playwright Chromium)',
      javaScriptEnabled: true,
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForLoadState('networkidle', { timeout: 7000 }).catch(() => undefined);
    const text = cleanText(await page.locator('body').innerText({ timeout: 7000 }));
    const title = cleanText(await page.title());
    const finalUrl = page.url();
    await context.close();
    if (text.length < 120) return { text: '', title, finalUrl, method: 'failed' };
    return { text, title, finalUrl, method: 'playwright' };
  } catch {
    return { text: '', title: '', finalUrl: url, method: 'failed' };
  }
}

export async function fetchPageWithFallback(url: string): Promise<PageFetchResult> {
  if (!/^https?:\/\//i.test(url) || !(await isSafeHttpUrl(url))) return { text: '', title: '', finalUrl: url, method: 'failed' };
  return (await fetchWithHttp(url)) || fetchWithPlaywright(url);
}

export async function closePlaywrightBrowser(): Promise<void> {
  const browser = await browserPromise?.catch(() => undefined);
  browserPromise = undefined;
  await browser?.close();
}
