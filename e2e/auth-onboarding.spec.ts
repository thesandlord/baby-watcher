import { expect, test } from '@playwright/test';
import {
  PASSWORD,
  createHousehold,
  openProfile,
  signIn,
  signUp,
  uniqueEmail,
} from './helpers';

test('creates a household, persists the session, toggles theme, and signs out', async ({ page }) => {
  const email = uniqueEmail('owner');
  await signUp(page, email);
  await createHousehold(page, 'Owner Alice');

  await page.reload();
  await expect(page.getByTestId('week-grid')).toBeVisible();
  await expect(page.getByText('Owner Alice', { exact: true }).first()).toBeVisible();

  await openProfile(page);
  const themeButton = page.getByRole('button', { name: 'Switch to dark mode' });
  await themeButton.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Baby Watcher' })).toBeVisible();

  await signIn(page, email);
  await expect(page.getByText('Owner Alice', { exact: true }).first()).toBeVisible();
});

test('shows errors for invalid credentials and invite codes', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(uniqueEmail('missing'));
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.error-banner')).toBeVisible();

  await signUp(page, uniqueEmail('joiner'));
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.getByLabel('Your name').fill('Lost Joiner');
  await page.getByLabel('Invite code').fill('ZZZZZZ');
  await page.getByRole('button', { name: 'Join household' }).click();
  await expect(page.locator('.error-banner')).toContainText('Household not found');
});
