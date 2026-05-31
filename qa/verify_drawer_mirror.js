const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1145, height: 980 } });
  const page = await ctx.newPage();
  const url = 'https://continuumrecovery.github.io/witmotion-dryfire-coach/?cb=' + Date.now();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('df_wiz_seen', '1'));
  await page.reload({ waitUntil: 'networkidle' });
  const roleLaptop = await page.$('#role-laptop-btn');
  if (roleLaptop) {
    await roleLaptop.click();
    await page.fill('#laptop-code', 'ABCDEF');
    await page.click('#laptop-join');
    await page.waitForTimeout(2500);
    await page.evaluate(() => { const o = document.getElementById('role-overlay'); if (o) o.style.display = 'none'; });
  }
  await page.waitForTimeout(1200);
  await page.click('#tb-settings');
  await page.waitForTimeout(1000);

  // Verify mirror exists & is reachable above scrim
  const info = await page.evaluate(() => {
    const drawerSel = document.getElementById('drawer-rect-style');
    const origSel = document.getElementById('rect-style');
    return {
      drawerSelExists: !!drawerSel,
      drawerSelValue: drawerSel?.value,
      origSelValue: origSel?.value,
    };
  });
  console.log('initial:', JSON.stringify(info));

  // Change via drawer dropdown
  await page.selectOption('#drawer-rect-style', 'silhouette');
  await page.waitForTimeout(500);

  const after = await page.evaluate(() => ({
    drawerSelValue: document.getElementById('drawer-rect-style')?.value,
    origSelValue: document.getElementById('rect-style')?.value,
    rectOptsStyle: typeof rectOpts !== 'undefined' ? rectOpts.style : 'n/a',
    storage: localStorage.getItem('df_rect_opts'),
  }));
  console.log('after change drawer→silhouette:', JSON.stringify(after, null, 2));

  await page.screenshot({ path: 'qa/verify-drawer-mirror-silhouette.png' });

  // Also change in reverse direction (original control → drawer mirror updates)
  await page.evaluate(() => { const o = document.getElementById('drawer-scrim'); if (o) o.style.display='none'; });
  await page.selectOption('#rect-style', 'grid');
  await page.waitForTimeout(400);
  const sync = await page.evaluate(() => ({
    drawerSelValue: document.getElementById('drawer-rect-style')?.value,
    origSelValue: document.getElementById('rect-style')?.value,
    rectOptsStyle: typeof rectOpts !== 'undefined' ? rectOpts.style : 'n/a',
  }));
  console.log('after change original→grid:', JSON.stringify(sync, null, 2));

  await browser.close();
})();
