const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['Pixel 5'] });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CON:' + m.text()); });
  const url = 'https://continuumrecovery.github.io/witmotion-dryfire-coach/?v=' + Date.now();
  await page.goto(url, { waitUntil: 'networkidle' });

  // verify step indicator present
  const stepTag = await page.locator('#calib-tag').innerText();
  const stepLabel = await page.locator('#steps-label').innerText();
  const calibBtn = await page.locator('#btn-calib').innerText();
  const aimBtn = await page.locator('#btn-aim').innerText();
  const startBtn = await page.locator('#btn-start').innerText();
  const heroTag = await page.locator('#hero-tag').innerText();

  // simulate manual mode + tap Lock → Clear, observe toast
  await page.locator('[data-mode="manual"]').click();
  await page.locator('#btn-calib').click();
  await page.waitForTimeout(200);
  const calibBtn2 = await page.locator('#btn-calib').innerText();
  const toast1 = await page.locator('#stage-toast').innerText().catch(()=>'(none)');

  // click Clear → expect toast + step reset
  await page.locator('#btn-clear').click();
  await page.waitForTimeout(150);
  const toast2 = await page.locator('#stage-toast').innerText().catch(()=>'(none)');
  const stepAfterClear = await page.locator('#calib-tag').innerText();
  const calibBtn3 = await page.locator('#btn-calib').innerText();

  // test Reset
  await page.locator('#btn-reset').click();
  await page.waitForTimeout(150);
  const toast3 = await page.locator('#stage-toast').innerText().catch(()=>'(none)');

  // mobile screenshot
  await page.screenshot({ path: '/home/user/workspace/dryfire/qa/mobile.png', fullPage: true });

  // doc height for scroll check
  const docH = await page.evaluate(()=>document.documentElement.scrollHeight);
  const winH = await page.evaluate(()=>window.innerHeight);

  console.log(JSON.stringify({
    stepTag, stepLabel, calibBtn, aimBtn, startBtn, heroTag,
    calibBtn2, toast1, toast2, stepAfterClear, calibBtn3, toast3,
    docH, winH, scrollRatio: (docH/winH).toFixed(2),
    errs
  }, null, 2));
  await browser.close();
})();
