import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:4323';
const OUT_DIR = process.env.SCREENSHOT_DIR ?? '/tmp/baby-watcher-pr-screenshots';

mkdirSync(OUT_DIR, { recursive: true });

async function shot(page, name) {
  const path = join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log(path);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(BASE_URL);
await shot(page, '01-login-screen');

await page.getByLabel('Email').fill('alice@example.com');
await page.getByLabel('Password').fill('password123');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByTestId('day-board').waitFor({ timeout: 15000 });
const activeDate = (await page.getByTestId('day-board').getAttribute('data-date')) ?? '';
await shot(page, '02-day-schedule-board');

await page.locator('[data-testid^="add-meeting-"]').first().click();
await page.getByRole('dialog', { name: 'Add meeting' }).waitFor();
await shot(page, '03-add-meeting-modal');
await page.getByRole('button', { name: 'Cancel' }).click();

const meeting = page.locator('.day-meeting-block').first();
if (await meeting.count()) {
  await meeting.click();
  await page.getByRole('dialog', { name: 'Edit meeting' }).waitFor();
  await shot(page, '04-edit-meeting-modal');
  await page.getByRole('button', { name: 'Cancel' }).click();
}

if (activeDate) {
  await page.getByTestId(`slot-${activeDate}-08:00`).click();
  await page.getByRole('dialog', { name: 'Override watcher' }).waitFor();
  await shot(page, '05-override-watcher-modal');
  await page.getByRole('button', { name: 'Unassigned' }).click();

  await page.getByTestId(`upload-status-${activeDate}`).click();
  await page.getByRole('dialog', { name: /Upload status/ }).waitFor();
  await shot(page, '06-upload-status-modal');
  await page.getByRole('button', { name: 'Close' }).click();
}

await page.getByRole('button', { name: 'Upload meetings' }).click();
await page.getByRole('dialog', { name: 'Upload calendar screenshot' }).waitFor();
await shot(page, '07-upload-calendar-modal');
await page.getByRole('button', { name: 'Cancel' }).click();

await page.getByRole('button', { name: 'Open profile and household menu' }).click();
await page.getByRole('dialog', { name: 'Household menu' }).waitFor();
await shot(page, '08-household-menu');

await browser.close();
console.log(`Screenshots saved to ${OUT_DIR}`);
