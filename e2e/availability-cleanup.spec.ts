import { expect, test } from '@playwright/test';
import {
  closeProfile,
  createHousehold,
  goToDate,
  openProfile,
  PAST_DATE,
  signUp,
  TEST_DATE,
  uniqueEmail,
  uploadAvailability,
  waitForAppIdle,
} from './helpers';

test('cleans up availability older than today', async ({ page }) => {
  await signUp(page, uniqueEmail('cleanup'));
  await createHousehold(page, 'Jordan');

  await page.getByRole('button', { name: 'Previous day' }).click();
  await goToDate(page, PAST_DATE);
  await uploadAvailability(page, PAST_DATE);
  await uploadAvailability(page, TEST_DATE);

  await openProfile(page);
  await expect(page.getByTestId(`upload-${PAST_DATE}`)).toBeVisible();
  await expect(page.getByTestId(`upload-${TEST_DATE}`)).toBeVisible();
  await expect(page.getByTestId('cleanup-old-uploads')).toContainText('Clean up 1 past schedule');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('cleanup-old-uploads').click();
  await waitForAppIdle(page);
  await expect(page.getByTestId(`upload-${PAST_DATE}`)).toHaveCount(0);
  await expect(page.getByTestId(`upload-${TEST_DATE}`)).toBeVisible();
  await expect(page.getByTestId('cleanup-old-uploads')).toHaveCount(0);
  await closeProfile(page);
});

test('auto-cleans old availability on load', async ({ page }) => {
  await signUp(page, uniqueEmail('auto-cleanup'));
  await createHousehold(page, 'Riley');

  await page.getByRole('button', { name: 'Previous day' }).click();
  await goToDate(page, PAST_DATE);
  await uploadAvailability(page, PAST_DATE);
  await waitForAppIdle(page);

  await page.reload();
  await expect(page.getByTestId('day-board')).toBeVisible();
  await waitForAppIdle(page);

  await openProfile(page);
  await expect(page.getByTestId(`upload-${PAST_DATE}`)).toHaveCount(0);
  await closeProfile(page);
});
