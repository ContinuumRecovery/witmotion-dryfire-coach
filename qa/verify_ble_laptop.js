// Verify the laptop now has a Connect IMU sensor button + status line.
const { chromium } = require('playwright');
const URL = 'https://continuumrecovery.github.io/witmotion-dryfire-coach/';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERR:', e.message));

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.setItem('df_wiz_seen','1'); });
  await page.waitForTimeout(800);
  // Click "This is my Laptop" to enter laptop mode (so wireControlRail runs)
  // Force-enter laptop mode and ensure Dash.init runs (which calls wireControlRail)
  await page.evaluate(() => {
    document.body.classList.add('role-laptop');
    document.getElementById('role-overlay').style.display = 'none';
    // Re-trigger any laptop init helpers that depend on Role.isLaptop()
    try {
      // Force Role to think we're laptop (best-effort — the module's role var is closed-over,
      // but wireControlRail also re-checks isLaptop. We monkey-patch isLaptop globally.)
      if (typeof Role !== 'undefined'){
        Role.isLaptop = () => true; Role.isPhone = () => false;
      }
    } catch(e){}
    // Manually invoke wireControlRail if available on the closure scope by clicking the body
  });
  // Reload after stamping role into localStorage to let Role re-detect cleanly
  await page.evaluate(() => { localStorage.setItem('df_role','laptop'); });
  await page.waitForTimeout(500);

  const info = await page.evaluate(() => {
    const btn = document.getElementById('ctrl-ble-laptop');
    const status = document.getElementById('ctrl-ble-status');
    return {
      btnPresent: !!btn,
      btnLabel: btn ? btn.textContent.trim() : null,
      btnDisabled: btn ? !!btn.disabled : null,
      btnTitle: btn ? btn.title : null,
      statusText: status ? status.textContent.trim() : null,
      hasConnectBLE: typeof window.connectBLE === 'function',
      hasOnWitNotify: typeof window.onWitNotify === 'function',
      bluetoothApi: !!navigator.bluetooth,
    };
  });
  console.log('LAPTOP BLE INFO:', JSON.stringify(info, null, 2));

  await page.screenshot({ path: 'qa/verify-ble-laptop.png', fullPage: false });

  // Hover the button to capture its tooltip area
  const btn = await page.$('#ctrl-ble-laptop');
  if (btn){
    const box = await btn.boundingBox();
    console.log('Button bounding box:', JSON.stringify(box));
    if (box) await btn.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'qa/verify-ble-laptop-btn.png', clip: box ? { x: Math.max(0, box.x-40), y: Math.max(0, box.y-30), width: Math.min(900, box.width+200), height: Math.min(120, box.height+60) } : undefined });
  }

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
