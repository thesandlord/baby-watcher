import { expect, test } from '@playwright/test';
import {
  NEXT_DATE,
  TEST_DATE,
  closeProfile,
  createHousehold,
  dragSlot,
  expectMembersInProfile,
  generateDay,
  joinHousehold,
  openProfile,
  overrideSlot,
  signUp,
  uniqueEmail,
  uploadAvailability,
  waitForAppIdle,
} from './helpers';

test('two players share generation, overrides, swaps, uploads, and regeneration', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const bob = await bobContext.newPage();

  try {
    await signUp(alice, uniqueEmail('alice'));
    const inviteCode = await createHousehold(alice, 'Alice');

    await signUp(bob, uniqueEmail('bob'));
    await joinHousehold(bob, 'Bob', inviteCode);

    await alice.reload();
    await expectMembersInProfile(alice, ['Alice', 'Bob']);
    await expectMembersInProfile(bob, ['Alice', 'Bob']);

    await expect(alice.getByRole('heading', { level: 1 })).toHaveText('Aug 10-15');
    await expect(alice.getByTestId(`slot-${TEST_DATE}-08:00`)).toHaveCount(0);
    await expect(alice.getByTestId(`generate-${TEST_DATE}`)).toHaveText('Generate slots');
    await expect(alice.getByTestId(`upload-status-${TEST_DATE}`)).toHaveText('0/2 uploaded');

    await alice.getByTestId(`upload-status-${TEST_DATE}`).click();
    const initialUploadStatus = alice.getByRole('dialog', {
      name: 'Upload status for Tuesday, Aug 11',
    });
    await expect(initialUploadStatus).toContainText('AliceNot uploaded');
    await expect(initialUploadStatus).toContainText('BobNot uploaded');
    await initialUploadStatus.getByRole('button', { name: 'Close' }).click();

    await uploadAvailability(alice);
    await expect(alice.getByTestId(`slot-${TEST_DATE}-08:00`)).toHaveCount(0);
    await expect(alice.getByTestId(`upload-status-${TEST_DATE}`)).toHaveText('1/2 uploaded');
    await alice.getByTestId(`upload-status-${TEST_DATE}`).click();
    const partialUploadStatus = alice.getByRole('dialog', {
      name: 'Upload status for Tuesday, Aug 11',
    });
    await expect(partialUploadStatus).toContainText('AliceUploaded');
    await expect(partialUploadStatus).toContainText('BobNot uploaded');
    await partialUploadStatus.getByRole('button', { name: 'Close' }).click();
    await openProfile(alice);
    await expect(alice.getByTestId(`upload-${TEST_DATE}`)).toContainText('2 busy periods');
    await closeProfile(alice);

    await openProfile(bob);
    await expect(bob.getByTestId(`upload-${TEST_DATE}`)).toHaveCount(0);
    await closeProfile(bob);
    await uploadAvailability(bob);
    await expect(bob.getByTestId(`upload-status-${TEST_DATE}`)).toHaveText('2/2 uploaded');
    await bob.getByTestId(`upload-status-${TEST_DATE}`).click();
    const completeUploadStatus = bob.getByRole('dialog', {
      name: 'Upload status for Tuesday, Aug 11',
    });
    await expect(completeUploadStatus).toContainText('AliceUploaded');
    await expect(completeUploadStatus).toContainText('BobUploaded');
    await completeUploadStatus.getByRole('button', { name: 'Close' }).click();

    await generateDay(alice);
    await expect(alice.locator(`[data-testid^="slot-${TEST_DATE}-"]`)).toHaveCount(18);
    await expect(alice.getByTestId(`slot-${TEST_DATE}-09:00`)).toContainText('Unassigned');

    await bob.reload();
    await expect(bob.getByTestId(`slot-${TEST_DATE}-08:00`)).toBeVisible();
    await expect(bob.getByTestId(`slot-${TEST_DATE}-09:00`)).toContainText('Unassigned');

    await overrideSlot(alice, TEST_DATE, '08:00', 'Bob');
    await expect(alice.getByTestId(`slot-${TEST_DATE}-08:00`)).toContainText('Bob');
    await expect(alice.getByTestId(`slot-${TEST_DATE}-08:00`).locator('.manual-dot')).toBeVisible();
    await bob.reload();
    await expect(bob.getByTestId(`slot-${TEST_DATE}-08:00`)).toContainText('Bob');

    await overrideSlot(alice, TEST_DATE, '08:00', 'Alice');
    await overrideSlot(alice, TEST_DATE, '08:30', 'Bob');
    await dragSlot(
      alice,
      { date: TEST_DATE, start: '08:00' },
      { date: TEST_DATE, start: '08:30' }
    );
    await expect(alice.getByTestId(`slot-${TEST_DATE}-08:00`)).toContainText('Bob');
    await expect(alice.getByTestId(`slot-${TEST_DATE}-08:30`)).toContainText('Alice');

    await generateDay(alice, NEXT_DATE);
    await overrideSlot(alice, TEST_DATE, '08:30', 'Alice');
    await overrideSlot(alice, NEXT_DATE, '08:00', 'Bob');
    await dragSlot(
      alice,
      { date: TEST_DATE, start: '08:30' },
      { date: NEXT_DATE, start: '08:00' }
    );
    await expect(alice.getByTestId(`slot-${TEST_DATE}-08:30`)).toContainText('Bob');
    await expect(alice.getByTestId(`slot-${NEXT_DATE}-08:00`)).toContainText('Alice');

    await bob.reload();
    await expect(bob.getByTestId(`slot-${TEST_DATE}-08:30`)).toContainText('Bob');
    await expect(bob.getByTestId(`slot-${NEXT_DATE}-08:00`)).toContainText('Alice');

    await Promise.all([
      overrideSlot(alice, TEST_DATE, '10:00', 'Alice'),
      overrideSlot(bob, TEST_DATE, '10:30', 'Bob'),
    ]);
    await alice.reload();
    await bob.reload();
    for (const page of [alice, bob]) {
      await expect(page.getByTestId(`slot-${TEST_DATE}-10:00`)).toContainText('Alice');
      await expect(page.getByTestId(`slot-${TEST_DATE}-10:30`)).toContainText('Bob');
    }

    await overrideSlot(alice, TEST_DATE, '11:00', 'Bob');
    const dismissRegenerate = alice.waitForEvent('dialog').then((dialog) => dialog.dismiss());
    await alice.getByTestId(`generate-${TEST_DATE}`).click();
    await dismissRegenerate;
    await waitForAppIdle(alice);
    await expect(alice.getByTestId(`slot-${TEST_DATE}-11:00`).locator('.manual-dot')).toBeVisible();

    const acceptRegenerate = alice.waitForEvent('dialog').then((dialog) => dialog.accept());
    await alice.getByTestId(`generate-${TEST_DATE}`).click();
    await acceptRegenerate;
    await waitForAppIdle(alice);
    await expect(alice.getByTestId(`slot-${TEST_DATE}-11:00`).locator('.manual-dot')).toHaveCount(0);
    await bob.reload();
    await expect(bob.getByTestId(`slot-${TEST_DATE}-11:00`).locator('.manual-dot')).toHaveCount(0);

    await openProfile(alice);
    await alice.getByTestId(`upload-${TEST_DATE}`).locator('summary').click();
    alice.once('dialog', (dialog) => dialog.accept());
    await alice.getByTestId(`upload-delete-${TEST_DATE}`).click();
    await expect(alice.getByTestId(`upload-${TEST_DATE}`)).toHaveCount(0);
    await closeProfile(alice);

    await openProfile(bob);
    await expect(bob.getByTestId(`upload-${TEST_DATE}`)).toBeVisible();
    await closeProfile(bob);

    const initialRange = await alice.getByRole('heading', { level: 1 }).textContent();
    await alice.getByRole('button', { name: 'Next week' }).click();
    await expect(alice.getByRole('heading', { level: 1 })).not.toHaveText(initialRange!);
    await alice.getByRole('button', { name: 'Today' }).click();
    await expect(alice.getByTestId(`day-${TEST_DATE}`)).toHaveClass(/active/);
  } finally {
    await aliceContext.close();
    await bobContext.close();
  }
});
