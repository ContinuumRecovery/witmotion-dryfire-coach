// Verify (1) drawer Session Settings not smushed and (2) Gun-cal modal has Zero + Target + Down buttons
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const url = 'https://continuumrecovery.github.io/witmotion-dryfire-coach/?cb=' + Date.now();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('df_wiz_seen', '1'));
  await page.reload({ waitUntil: 'networkidle' });
  // Choose laptop role
  const roleLaptop = await page.$('#role-laptop-btn');
  if (roleLaptop) {
    await roleLaptop.click();
    await page.fill('#laptop-code', 'ABCDEF');
    await page.click('#laptop-join');
    await page.waitForTimeout(2500);
    await page.evaluate(() => { const o = document.getElementById('role-overlay'); if (o) o.style.display = 'none'; });
  }
  await page.waitForTimeout(800);

  // Open the settings drawer
  const tb = await page.$('#tb-settings');
  if (!tb) { console.log('NO #tb-settings'); await browser.close(); return; }
  await tb.click();
  await page.waitForTimeout(800);

  // Screenshot full drawer
  const drawer = await page.$('#settings-drawer');
  if (drawer) {
    await drawer.screenshot({ path: 'qa/verify-drawer-session.png' });
    console.log('drawer screenshot saved');
  }

  // Now open the Gun-cal modal
  const gc = await page.$('#ctrl-gun-cal');
  if (gc) {
    await gc.click();
    await page.waitForTimeout(600);
    // The drawer scrim sits on top — push it under so it doesn't intercept modal clicks during this test
    await page.evaluate(() => { const s = document.getElementById('drawer-scrim'); if (s) s.style.display = 'none'; const d = document.getElementById('settings-drawer'); if (d) d.style.display = 'none'; });
    const modal = await page.$('#guncal-modal');
    if (modal) {
      await modal.screenshot({ path: 'qa/verify-guncal-3buttons.png' });
      console.log('gun-cal modal screenshot saved');
    }
    // Confirm the 3 new buttons exist
    const ids = await page.evaluate(() => ({
      zero: !!document.getElementById('guncal-zero'),
      target: !!document.getElementById('guncal-capture-target'),
      down: !!document.getElementById('guncal-capture-down'),
      cancel: !!document.getElementById('guncal-cancel'),
      raw: !!document.getElementById('guncal-pitch-raw'),
      pitch: !!document.getElementById('guncal-pitch'),
      captured: document.getElementById('guncal-captured')?.textContent,
    }));
    console.log('IDs present:', JSON.stringify(ids, null, 2));

    // Simulate IMU pitch via QuickDraw's getCurrentPitch (override) so we can exercise zero
    await page.evaluate(() => {
      // Patch QuickDraw.getCurrentPitch to return a number; the GunCal local poll uses it.
      if (typeof QuickDraw !== 'undefined') {
        QuickDraw.getCurrentPitch = () => -12.5;
        QuickDraw.getCurrentAccel = () => ({ x: 0, y: 0.21, z: 0.97, t: Date.now() });
      }
      // Force the local pitch poll to start (it only starts when hasLocalImu()).
      // Easier: just poke setPitch directly via a manual handler exposed on window.
      // Instead, manually dispatch the pitch into the modal via the modal's onPitchMsg path.
      if (typeof GunCal !== 'undefined' && GunCal.onPitchMsg) GunCal.onPitchMsg(-12.5);
    });
    await page.waitForTimeout(300);

    // Press Set zero
    await page.click('#guncal-zero');
    await page.waitForTimeout(200);
    // Fake a slightly different pitch (target pose)
    await page.evaluate(() => { if (typeof GunCal !== 'undefined' && GunCal.onPitchMsg) GunCal.onPitchMsg(-11.9); });
    await page.waitForTimeout(200);
    await page.click('#guncal-capture-target');
    await page.waitForTimeout(200);
    // Fake a low-ready pitch
    await page.evaluate(() => { if (typeof GunCal !== 'undefined' && GunCal.onPitchMsg) GunCal.onPitchMsg(-55.2); });
    await page.waitForTimeout(200);
    await page.click('#guncal-capture-down');
    await page.waitForTimeout(400);

    // Final screenshot showing all 3 captured rows
    await modal.screenshot({ path: 'qa/verify-guncal-after-capture.png' });
    const finalText = await page.evaluate(() => ({
      captured: document.getElementById('guncal-captured')?.textContent,
      hint: document.getElementById('guncal-hint')?.textContent,
      hintColor: document.getElementById('guncal-hint')?.style.color,
      pitchBig: document.getElementById('guncal-pitch')?.textContent,
      pitchRaw: document.getElementById('guncal-pitch-raw')?.textContent,
    }));
    console.log('Final modal state:', JSON.stringify(finalText, null, 2));
  }
  await browser.close();
})();
