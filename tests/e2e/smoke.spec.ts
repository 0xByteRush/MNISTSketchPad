// Smoke test against the production build (npm run smoke).
// Draw a stroke, press Read it!, the answer card appears; no console errors, no external requests.
import { expect, test } from '@playwright/test';

test('draw, read, answer; clean console; nothing leaves the machine', async ({ page, baseURL }) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('request', (req) => {
    const url = req.url();
    if (!url.startsWith(baseURL!) && !url.startsWith('data:') && !url.startsWith('blob:')) external.push(url);
  });

  await page.goto('/?idle=0');
  const read = page.locator('#btn-read');
  await expect(read).toBeDisabled();

  // Draw a "7" on the pad with the mouse.
  const box = (await page.locator('#pad').boundingBox())!;
  const at = (fx: number, fy: number): [number, number] => [box.x + box.width * fx, box.y + box.height * fy];
  await page.mouse.move(...at(0.25, 0.2));
  await page.mouse.down();
  await page.mouse.move(...at(0.75, 0.2), { steps: 8 });
  await page.mouse.move(...at(0.45, 0.85), { steps: 12 });
  await page.mouse.up();

  await expect(read).toBeEnabled();
  await read.click();
  await expect(page.locator('#caption')).toContainText('784');

  // Tap the stage to skip to the answer.
  await page.mouse.click(...at(2.2, 0.5));
  await expect(page.locator('#card')).toHaveClass(/show/);
  await expect(page.locator('#card .card-digit')).toHaveText('7');
  await expect(page.locator('#btn-replay')).toBeVisible();

  // Mash the controls mid-animation: nothing may break.
  for (let i = 0; i < 5; i++) {
    await page.locator('#btn-replay').click();
    await page.mouse.click(...at(2.2, 0.5));
  }
  await page.locator('#btn-replay').click();
  await page.locator('#btn-clear').click();
  await expect(page.locator('#card')).not.toHaveClass(/show/);
  await expect(read).toBeDisabled();

  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
