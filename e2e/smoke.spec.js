// Browser smoke tests: the built app against the stub casino (playwright.config.js starts both).
import { expect, test } from '@playwright/test';

const STUB = 'http://127.0.0.1:9911';

async function stub(path, body) {
  const r = await fetch(STUB + path, { method: 'POST', body: JSON.stringify(body ?? {}) });
  return r.json();
}

test.beforeEach(async ({ page }) => {
  await stub('/test/control', { status: 'open', status_reason: '' });
  // Never the real casino: stand in an empty bar and theme.
  await page.route('https://casino.grovestreet.zip/**', route =>
    route.fulfill({ status: 200, contentType: route.request().url().endsWith('.js') ? 'text/javascript' : 'text/css', body: '' }));
});

async function land(page, username = 'smoke') {
  const { token } = await stub('/test/token', { username });
  await page.goto('/?gc_token=' + token);
  await expect(page.locator('[data-test=message]')).toHaveText('PULL THE HANDLE');
}

test('a player lands from the lobby and sees the machine, the bar and the balance', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await land(page);
  expect(page.url()).not.toContain('gc_token');
  await expect(page.locator('script[src="https://casino.grovestreet.zip/bar.js"][data-game="classic777"]')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText('777');
  await expect(page.locator('.reel')).toHaveCount(3);
  await expect(page.locator('[data-test=balance]')).toHaveText(/^\d[\d.]* tok$/);
  await expect(page.locator('[data-test=balance-euro]')).toHaveText(/^€ \d[\d.]*,\d\d$/);
  await expect(page.locator('body')).not.toContainText('$');
  expect(errors).toEqual([]);
});

test('SPIN pulls the handle and the server decides the reels', async ({ page }) => {
  await land(page, 'spinner');
  await page.locator('.btn-spin').click();
  await expect(page.locator('[data-test=message]')).not.toHaveText('PULL THE HANDLE');
  await expect(page.locator('.btn-spin')).toBeEnabled({ timeout: 15_000 });
  await expect(page.locator('[data-test=message]')).toHaveText(/PULL AGAIN|WINNER|JACKPOT/);
  await expect(page.locator('[data-test=win]')).toHaveText(/^€ \d+,\d\d$/);
});

test('dragging the handle all the way down spins', async ({ page }) => {
  await land(page, 'dragger');
  const ball = await page.locator('#lever-grab').boundingBox();
  const x = ball.x + ball.width / 2;
  const y = ball.y + ball.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(x, y + i * 25);
  await page.mouse.up();
  await expect(page.locator('.btn-spin')).toBeDisabled();
  await expect(page.locator('.btn-spin')).toBeEnabled({ timeout: 15_000 });
});

test('maintenance stops new spins and says why; demo shows the mark', async ({ page }) => {
  await land(page, 'watcher');
  await stub('/test/control', { status: 'maintenance', status_reason: 'update to 1.0.9' });
  await expect(page.locator('.reel-notice')).toContainText('Maintenance: update to 1.0.9');
  await expect(page.locator('.btn-spin')).toBeDisabled();
  await stub('/test/control', { status: 'demo' });
  await expect(page.locator('.demo-ribbon')).toBeVisible();
  await expect(page.locator('.btn-spin')).toBeEnabled();
});

test('a visitor without a seat is sent to the casino for one', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL(/\/play\/classic777$/);
});
