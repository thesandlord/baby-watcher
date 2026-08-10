import { expect, type Page } from '@playwright/test';

export const TEST_DATE = '2026-08-11';
export const NEXT_DATE = '2026-08-12';
export const PASSWORD = 'password123';

export function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

export async function signUp(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Need an account? Sign up' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Set up your household' })).toBeVisible();
}

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('week-grid')).toBeVisible();
}

export async function createHousehold(page: Page, name: string): Promise<string> {
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Create household' }).click();
  await expect(page.getByTestId('week-grid')).toBeVisible();
  await openProfile(page);
  const inviteCode = (await page.getByTestId('invite-code').textContent())?.trim();
  expect(inviteCode).toMatch(/^[A-Z0-9]{6}$/);
  await closeProfile(page);
  return inviteCode!;
}

export async function joinHousehold(
  page: Page,
  name: string,
  inviteCode: string
): Promise<void> {
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Invite code').fill(inviteCode);
  await page.getByRole('button', { name: 'Join household' }).click();
  await expect(page.getByTestId('week-grid')).toBeVisible();
}

export async function openProfile(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open profile and household menu' }).click();
  await expect(page.getByRole('dialog', { name: 'Household menu' })).toBeVisible();
}

export async function closeProfile(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Close menu' }).click();
  await expect(page.getByRole('dialog', { name: 'Household menu' })).toBeHidden();
}

export async function expectMembersInProfile(page: Page, names: string[]): Promise<void> {
  await openProfile(page);
  const menu = page.getByRole('dialog', { name: 'Household menu' });
  for (const name of names) {
    await expect(menu).toContainText(name);
  }
  await closeProfile(page);
}

export async function uploadAvailability(page: Page, date = TEST_DATE): Promise<void> {
  await page.getByTestId(`day-${date}`).click();
  await page.getByRole('button', { name: 'Upload meetings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Upload calendar screenshot' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Take a photo' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Upload an image' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Use sample day' }).click();
  await expect(dialog).toBeHidden({ timeout: 10000 });
}

export async function generateDay(page: Page, date = TEST_DATE): Promise<void> {
  await page.getByTestId(`generate-${date}`).click();
  await expect(page.getByTestId(`slot-${date}-08:00`)).toBeVisible();
  await waitForAppIdle(page);
}

export async function overrideSlot(
  page: Page,
  date: string,
  start: string,
  watcherName: string
): Promise<void> {
  await page.getByTestId(`slot-${date}-${start}`).click();
  const dialog = page.getByRole('dialog', { name: 'Override watcher' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: watcherName, exact: true }).click();
  await expect(dialog).toBeHidden();
  await waitForAppIdle(page);
}

export async function waitForAppIdle(page: Page): Promise<void> {
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-busy', 'false');
}

export async function dragSlot(
  page: Page,
  source: { date: string; start: string },
  target: { date: string; start: string }
): Promise<void> {
  const sourceSlot = page.getByTestId(`slot-${source.date}-${source.start}`);
  const targetSlot = page.getByTestId(`slot-${target.date}-${target.start}`);
  const sourceBox = await sourceSlot.boundingBox();
  const targetBox = await targetSlot.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error('Cannot drag slots that are outside the viewport.');
  }

  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2 + 12,
    sourceBox.y + sourceBox.height / 2,
    { steps: 4 }
  );
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 12 }
  );
  await page.mouse.up();
  await waitForAppIdle(page);
}
