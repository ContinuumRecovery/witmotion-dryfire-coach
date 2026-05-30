const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['Pixel 5'] });
  const page = await ctx.newPage();
  const url = 'https://continuumrecovery.github.io/witmotion-dryfire-coach/?v=' + Date.now();
  await page.goto(url, { waitUntil: 'networkidle' });

  // Simulate a perfect synthetic shot via console (no camera needed)
  const result = await page.evaluate(() => {
    // Need homography and aim set. Fake homography via direct module access is hard.
    // Instead just call onClickDetected with synthetic data after manually setting state.
    try {
      // Try injecting state through page-level (these are module-scoped, won't work).
      // Instead, simulate calibrated state by setting target-status directly and
      // verifying the test-shot button path that falls through to pushUntrackedShot.
      document.getElementById('btn-test').click();
      return { clicked: true };
    } catch(e){ return { err: e.message }; }
  });
  await page.waitForTimeout(400);
  const toast = await page.locator('#stage-toast').innerText().catch(()=>'(none)');
  const heroTag = await page.locator('#hero-tag').innerText();
  const shots = await page.locator('#ss-shots').innerText();
  console.log(JSON.stringify({ result, toast, heroTag, shots }));

  await page.screenshot({ path: '/home/user/workspace/dryfire/qa/post-shot.png', fullPage: false });
  await browser.close();
})();
