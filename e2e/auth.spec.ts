import { test, expect } from '@playwright/test';

test.describe('GOV.UK One Login auth flow', () => {

  test('unauthenticated home page shows sign-in link', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('GOV.UK One Login POC');
    await expect(page.getByRole('link', { name: 'Sign in with GOV.UK One Login' })).toBeVisible();
    await expect(page.locator('h1')).not.toHaveText('Signed in');
    await expect(page.getByRole('link', { name: 'Sign out' })).not.toBeVisible();
  });

  test('sign-in completes the full OAuth2 PKCE + private_key_jwt flow', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Sign in with GOV.UK One Login' }).click();

    // Playwright follows the full redirect chain:
    //   /api/auth/sign-in/social -> simulator /authorize (302) -> /api/auth/callback -> /
    await expect(page).toHaveURL('/', { timeout: 10_000 });
    await expect(page.locator('h1')).toHaveText('Signed in');

    const userJson = await page.locator('pre').textContent();
    expect(userJson).toBeTruthy();
    const user = JSON.parse(userJson!);
    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('email');

    await expect(page.getByRole('link', { name: 'Sign out' })).toBeVisible();
  });

  test('sign-out returns to unauthenticated state', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Sign in with GOV.UK One Login' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.locator('h1')).toHaveText('Signed in');

    await page.getByRole('link', { name: 'Sign out' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.locator('h1')).toHaveText('GOV.UK One Login POC');
    await expect(page.getByRole('link', { name: 'Sign in with GOV.UK One Login' })).toBeVisible();
  });

  test('session is not shared across browser contexts', async ({ browser }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await pageA.goto('/');
    await pageA.getByRole('link', { name: 'Sign in with GOV.UK One Login' }).click();
    await expect(pageA).toHaveURL('/');
    await expect(pageA.locator('h1')).toHaveText('Signed in');

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await pageB.goto('/');
    await expect(pageB.locator('h1')).toHaveText('GOV.UK One Login POC');

    await contextA.close();
    await contextB.close();
  });

});
