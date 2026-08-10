import { expect, test } from '@playwright/test';
import {
  NEXT_DATE,
  TEST_DATE,
  closeProfile,
  createHousehold,
  generateDay,
  goToDate,
  openProfile,
  overrideSlot,
  signUp,
  switchToThreeDayView,
  uniqueEmail,
  uploadAvailability,
} from './helpers';

test('manages days and extracted schedules independently', async ({ page }) => {
  await signUp(page, uniqueEmail('calendar'));
  await createHousehold(page, 'Casey');

  await generateDay(page, TEST_DATE);
  await expect(page.getByTestId(`slot-${TEST_DATE}-08:00`)).toContainText('Casey');
  await expect(page.getByTestId(`slot-${NEXT_DATE}-08:00`)).toHaveCount(0);

  await overrideSlot(page, TEST_DATE, '08:00', 'Unassigned');
  await expect(page.getByTestId(`slot-${TEST_DATE}-08:00`)).toContainText('Unassigned');

  await uploadAvailability(page, NEXT_DATE);
  await openProfile(page);
  const upload = page.getByTestId(`upload-${NEXT_DATE}`);
  await upload.locator('summary').click();
  await expect(upload).toContainText('09:00–09:30');

  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByTestId(`upload-delete-${NEXT_DATE}`).click();
  await expect(upload).toBeVisible();

  await page.getByTestId(`upload-view-${NEXT_DATE}`).click();
  await expect(page.getByTestId('day-board')).toHaveAttribute('data-date', NEXT_DATE);

  await openProfile(page);
  await page.getByTestId(`upload-${NEXT_DATE}`).locator('summary').click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId(`upload-delete-${NEXT_DATE}`).click();
  await expect(page.getByTestId(`upload-${NEXT_DATE}`)).toHaveCount(0);
  await closeProfile(page);

  await goToDate(page, TEST_DATE);
  await expect(page.getByTestId(`slot-${TEST_DATE}-08:00`)).toContainText('Unassigned');
});
