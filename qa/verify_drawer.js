const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.goto('https://continuumrecovery.github.io/witmotion-dryfire-coach/', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('df_wiz_seen','1');
    localStorage.setItem('df_role','laptop');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  // Force hide any blocking overlays for headless test
  await page.evaluate(() => {
    const ov = document.getElementById('role-overlay'); if (ov) ov.style.display='none';
    const ww = document.getElementById('setup-wizard'); // may be moved into drawer already
  });

  // Confirm Settings button exists and visible
  const hasBtn = await page.locator('#tb-settings').count();
  console.log('tb-settings count:', hasBtn);

  // Click Settings
  await page.click('#tb-settings');
  await page.waitForTimeout(600);
  const drawerOpen = await page.evaluate(() => {
    const d = document.getElementById('settings-drawer');
    return d ? d.classList.contains('open') || getComputedStyle(d).transform : 'NONE';
  });
  console.log('drawer state:', drawerOpen);
  await page.screenshot({ path: 'qa/verify-drawer-open.png', fullPage: false });

  // Test volume slider — set value then read back
  const volBefore = await page.locator('#drawer-vol').inputValue().catch(()=>'NA');
  await page.locator('#drawer-vol').evaluate(el => { el.value = 0.42; el.dispatchEvent(new Event('input', {bubbles:true})); });
  await page.waitForTimeout(200);
  const volAfter = await page.locator('#drawer-vol').inputValue().catch(()=>'NA');
  const pctTxt = await page.locator('#drawer-vol-pct').textContent().catch(()=>'NA');
  console.log('vol before/after:', volBefore, '->', volAfter, 'pct=', pctTxt);

  // Confirm setup wizard moved into drawer slot
  const setupInDrawer = await page.evaluate(() => {
    const slot = document.getElementById('drawer-setup-slot');
    return slot ? slot.children.length : -1;
  });
  const sessionInDrawer = await page.evaluate(() => {
    const slot = document.getElementById('drawer-session-slot');
    return slot ? slot.children.length : -1;
  });
  const actionsInDrawer = await page.evaluate(() => {
    const slot = document.getElementById('drawer-actions-slot');
    return slot ? slot.children.length : -1;
  });
  console.log('slot child counts setup/session/actions:', setupInDrawer, sessionInDrawer, actionsInDrawer);

  // Close drawer via Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const drawerClosed = await page.evaluate(() => {
    const d = document.getElementById('settings-drawer');
    return d ? !d.classList.contains('open') : false;
  });
  console.log('drawer closed after Esc:', drawerClosed);
  await page.screenshot({ path: 'qa/verify-drawer-closed.png', fullPage: false });

  // Verify old sound widget is hidden
  const oldHidden = await page.evaluate(() => {
    const w = document.getElementById('sound-widget');
    if (!w) return 'absent';
    return getComputedStyle(w).display;
  });
  console.log('old sound-widget display:', oldHidden);

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
