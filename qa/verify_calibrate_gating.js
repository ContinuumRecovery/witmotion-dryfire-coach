const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport:{width:1440,height:900} })).newPage();
  await page.goto('https://continuumrecovery.github.io/witmotion-dryfire-coach/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  // Click "Laptop" role button
  await page.click('#role-laptop-btn').catch(()=>{});
  await page.waitForTimeout(400);
  // Now we're at the join code screen. Let's just enter a fake code to invoke joinAsLaptop
  await page.fill('#laptop-code', 'TESTAB');
  await page.click('#laptop-join');
  await page.waitForTimeout(3000); // init() poller (400ms) + calAvailPoll (800ms)
  // Force-close any open overlays
  await page.evaluate(() => { const ov = document.getElementById('role-overlay'); if (ov) ov.style.display='none'; });
  await page.click('#tb-settings');
  await page.waitForTimeout(1200);
  const d = await page.evaluate(() => {
    const b = document.getElementById('ctrl-calibrate');
    return {
      btn_disabled: b && b.disabled,
      btn_opacity: b && getComputedStyle(b).opacity,
      btn_title: b && b.title,
      paired: !!(window.Role && Role.isConnected && Role.isConnected()),
      pollExists: !!window._calAvailPoll,
      isLaptop: Role && Role.isLaptop && Role.isLaptop(),
      bodyClasses: document.body.className,
    };
  });
  console.log('STATE:', JSON.stringify(d,null,2));
  await page.locator('#ctrl-calibrate').click({ force: true });
  await page.waitForTimeout(400);
  const help = await page.locator('#ctrl-calibrate-help').textContent();
  console.log('help after click:', JSON.stringify(help));
  await page.screenshot({ path: 'qa/verify-calibrate-disabled.png' });
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
