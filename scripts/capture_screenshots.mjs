// Captures README screenshots from the running app (default http://127.0.0.1:8001).
// Usage: node scripts/capture_screenshots.mjs
// Requires: npm i -D playwright  (uses installed Edge/Chrome, no browser download)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.MYCOGUARD_URL || 'http://127.0.0.1:8001';
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/screenshots');

mkdirSync(OUT_DIR, { recursive: true });

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      /* try next channel */
    }
  }
  return chromium.launch({ headless: true }); // bundled fallback
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(BASE, { waitUntil: 'networkidle' });

// 1) Landing: manual trait mode with live SVG canvas + empty state.
await page.waitForTimeout(600);
await page.screenshot({ path: resolve(OUT_DIR, 'screenshot-1-landing.png') });

// 2) One-click scenario → risk result with confidence interval, rule hits,
//    offline expert narrative, and the prominent disclaimer banner.
await page.getByRole('button', { name: /大青褶伞特征组合/ }).click();
await page.getByRole('button', { name: /开始分析/ }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: resolve(OUT_DIR, 'screenshot-2-high-risk-result.png'), fullPage: true });

// 3) Photo mode tab (dropzone UI + sample entry).
await page.getByRole('tab', { name: /拍照识别/ }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: resolve(OUT_DIR, 'screenshot-3-photo-mode.png') });

// 4) Sample photo loaded into the preview (no camera needed).
const sample = page.locator('.sample-chip').first();
await sample.click();
await page.waitForTimeout(800);
await page.screenshot({ path: resolve(OUT_DIR, 'screenshot-4-photo-sample.png') });

await browser.close();
console.log('screenshots written to', OUT_DIR);
