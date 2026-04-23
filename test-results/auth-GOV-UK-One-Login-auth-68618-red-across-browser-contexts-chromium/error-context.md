# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> GOV.UK One Login auth flow >> session is not shared across browser contexts
- Location: e2e/auth.spec.ts:43:3

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected: "http://localhost:8080/"
Received: "http://localhost:8080/api/auth/sign-in/social?provider=gov-uk-one-login&callbackURL=/"
Timeout:  5000ms

Call log:
  - Expect "toHaveURL" with timeout 5000ms
    9 × unexpected value "http://localhost:8080/api/auth/sign-in/social?provider=gov-uk-one-login&callbackURL=/"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('GOV.UK One Login auth flow', () => {
  4  | 
  5  |   test('unauthenticated home page shows sign-in link', async ({ page }) => {
  6  |     await page.goto('/');
  7  |     await expect(page.locator('h1')).toHaveText('GOV.UK One Login POC');
  8  |     await expect(page.getByRole('link', { name: 'Sign in with GOV.UK One Login' })).toBeVisible();
  9  |     await expect(page.locator('h1')).not.toHaveText('Signed in');
  10 |     await expect(page.getByRole('link', { name: 'Sign out' })).not.toBeVisible();
  11 |   });
  12 | 
  13 |   test('sign-in completes the full OAuth2 PKCE + private_key_jwt flow', async ({ page }) => {
  14 |     await page.goto('/');
  15 |     await page.getByRole('link', { name: 'Sign in with GOV.UK One Login' }).click();
  16 | 
  17 |     // Playwright follows the full redirect chain:
  18 |     //   /api/auth/sign-in/social -> simulator /authorize (302) -> /api/auth/callback -> /
  19 |     await expect(page).toHaveURL('/', { timeout: 10_000 });
  20 |     await expect(page.locator('h1')).toHaveText('Signed in');
  21 | 
  22 |     const userJson = await page.locator('pre').textContent();
  23 |     expect(userJson).toBeTruthy();
  24 |     const user = JSON.parse(userJson!);
  25 |     expect(user).toHaveProperty('id');
  26 |     expect(user).toHaveProperty('email');
  27 | 
  28 |     await expect(page.getByRole('link', { name: 'Sign out' })).toBeVisible();
  29 |   });
  30 | 
  31 |   test('sign-out returns to unauthenticated state', async ({ page }) => {
  32 |     await page.goto('/');
  33 |     await page.getByRole('link', { name: 'Sign in with GOV.UK One Login' }).click();
  34 |     await expect(page).toHaveURL('/');
  35 |     await expect(page.locator('h1')).toHaveText('Signed in');
  36 | 
  37 |     await page.getByRole('link', { name: 'Sign out' }).click();
  38 |     await expect(page).toHaveURL('/');
  39 |     await expect(page.locator('h1')).toHaveText('GOV.UK One Login POC');
  40 |     await expect(page.getByRole('link', { name: 'Sign in with GOV.UK One Login' })).toBeVisible();
  41 |   });
  42 | 
  43 |   test('session is not shared across browser contexts', async ({ browser }) => {
  44 |     const contextA = await browser.newContext();
  45 |     const pageA = await contextA.newPage();
  46 |     await pageA.goto('/');
  47 |     await pageA.getByRole('link', { name: 'Sign in with GOV.UK One Login' }).click();
> 48 |     await expect(pageA).toHaveURL('/');
     |                         ^ Error: expect(page).toHaveURL(expected) failed
  49 |     await expect(pageA.locator('h1')).toHaveText('Signed in');
  50 | 
  51 |     const contextB = await browser.newContext();
  52 |     const pageB = await contextB.newPage();
  53 |     await pageB.goto('/');
  54 |     await expect(pageB.locator('h1')).toHaveText('GOV.UK One Login POC');
  55 | 
  56 |     await contextA.close();
  57 |     await contextB.close();
  58 |   });
  59 | 
  60 | });
  61 | 
```