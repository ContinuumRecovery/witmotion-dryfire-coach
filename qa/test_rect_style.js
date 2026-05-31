const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
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

  const before = await page.evaluate(() => {
    const sel = document.getElementById('rect-style');
    const has = !!sel;
    const visible = sel ? sel.offsetParent !== null : false;
    const rect = sel ? sel.getBoundingClientRect() : null;
    return { has, visible, value: sel?.value, rectW: rect?.width, rectVisible: rect?.width > 0 && rect?.height > 0 };
  });
  console.log('rect-style before:', JSON.stringify(before));

  // Try to change via JS (UI may be tiny)
  const changeResult = await page.evaluate(() => {
    const sel = document.getElementById('rect-style');
    if (!sel) return { error: 'no select' };
    sel.value = 'silhouette';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    // After change, read window state
    return {
      selValue: sel.value,
      windowRectOptsStyle: (typeof rectOpts !== 'undefined') ? rectOpts.style : 'no rectOpts',
      storage: localStorage.getItem('df_rect_opts'),
    };
  });
  console.log('after change to silhouette:', JSON.stringify(changeResult, null, 2));

  await page.waitForTimeout(400);
  await page.screenshot({ path: 'qa/test-rect-silhouette.png' });

  // Now reload and see if it persists
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  // Re-dismiss role
  const rl2 = await page.$('#role-laptop-btn');
  if (rl2) {
    await rl2.click();
    await page.fill('#laptop-code', 'ABCDEF');
    await page.click('#laptop-join');
    await page.waitForTimeout(2500);
    await page.evaluate(() => { const o = document.getElementById('role-overlay'); if (o) o.style.display = 'none'; });
  }
  await page.waitForTimeout(800);

  const persisted = await page.evaluate(() => ({
    selValue: document.getElementById('rect-style')?.value,
    rectOptsStyle: (typeof rectOpts !== 'undefined') ? rectOpts.style : 'n/a',
    storage: localStorage.getItem('df_rect_opts'),
  }));
  console.log('after reload:', JSON.stringify(persisted, null, 2));

  await page.screenshot({ path: 'qa/test-rect-after-reload.png' });
  await browser.close();
})();
