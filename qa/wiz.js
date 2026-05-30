const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['Pixel 5'] });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PE:' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CE:' + m.text()); });
  const url = 'https://continuumrecovery.github.io/witmotion-dryfire-coach/?v=' + Date.now();
  await page.goto(url, { waitUntil: 'networkidle' });

  // Wait for wizard to auto-open (350ms delay)
  await page.waitForTimeout(700);
  const isOpen1 = await page.locator('#wiz').evaluate(el => el.classList.contains('open'));
  const title1 = await page.locator('#wiz-title').innerText();
  const screen1Title = await page.locator('.wiz-screen.on h4').innerText();

  await page.screenshot({ path: '/home/user/workspace/dryfire/qa/wiz1.png', fullPage: false });

  // Next → screen 2
  await page.locator('#wiz-next').click();
  await page.waitForTimeout(300);
  const screen2Title = await page.locator('.wiz-screen.on h4').innerText();
  await page.screenshot({ path: '/home/user/workspace/dryfire/qa/wiz2.png', fullPage: false });

  // Pick "manual" via wizard mode card
  await page.locator('.wiz-mode[data-pick="manual"]').click();
  await page.waitForTimeout(250);
  const screen3Title = await page.locator('.wiz-screen.on h4').innerText();
  await page.screenshot({ path: '/home/user/workspace/dryfire/qa/wiz3.png', fullPage: false });

  // Got it → closes
  const nextText = await page.locator('#wiz-next').innerText();
  await page.locator('#wiz-next').click();
  await page.waitForTimeout(250);
  const isOpen2 = await page.locator('#wiz').evaluate(el => el.classList.contains('open'));

  // Verify Manual mode was actually picked
  const modeOn = await page.locator('#mode-seg button.on').innerText();

  // Verify aruco status feedback string appears when in aruco mode (no camera = stays "searching")
  await page.locator('#mode-seg button[data-mode="aruco"]').click();
  await page.waitForTimeout(100);
  const targetStatus = await page.locator('#target-status').innerText();

  // Open via help link
  await page.locator('#btn-setup-help').click();
  await page.waitForTimeout(250);
  const isOpen3 = await page.locator('#wiz').evaluate(el => el.classList.contains('open'));

  // Mobile screenshot full page (wizard closed)
  await page.locator('#wiz-close').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: '/home/user/workspace/dryfire/qa/mobile2.png', fullPage: true });

  console.log(JSON.stringify({
    isOpen1, title1, screen1Title, screen2Title, screen3Title, nextText,
    isOpen2, modeOn, targetStatus, isOpen3,
    errs
  }, null, 2));

  await browser.close();
})();
