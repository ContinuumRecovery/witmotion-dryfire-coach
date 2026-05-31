const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport:{width:1440,height:900} })).newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  page.on('console', m => { if (m.type()==='error') console.log('ERR:', m.text()); });
  await page.goto('https://continuumrecovery.github.io/witmotion-dryfire-coach/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  // Become laptop
  await page.click('#role-laptop-btn').catch(()=>{});
  await page.waitForTimeout(300);
  await page.fill('#laptop-code', 'TESTAB');
  await page.click('#laptop-join');
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const ov = document.getElementById('role-overlay'); if (ov) ov.style.display='none'; });

  // QuickDraw is in a closure — we can only test through its public API.
  // We can call captureCalibration() directly to inject vector data.
  const result = await page.evaluate(() => {
    if (typeof QuickDraw === 'undefined' || !QuickDraw.captureCalibration) return {error:'QuickDraw missing'};

    // Simulate the photo mount: chip rotated 90° around barrel.
    // Target (gun level): gravity in IMU frame = (1, 0, 0)  [chip's +X = world -Z, but rotated]
    // Wait — match the test: gT (target) was {x:1, y:0, z:0}, gD (down -30°) was {x:0.866, y:0, z:0.5}
    const gT = { x: 1.0, y: 0.0, z: 0.0 };
    const gD = { x: 0.866, y: 0.0, z: 0.5 };

    // Use captureCalibration with explicit accel arg (third param)
    QuickDraw.captureCalibration('target', 0, gT);
    QuickDraw.captureCalibration('down', -30, gD); // pitch arg gets overridden by vector recomputation

    // Now simulate a live BLE sample by directly setting onImu state via fake call.
    // onImu is internal — instead, check that captureCalibration set things up by calling
    // getCurrentPitch with an injected accel via a fake onImu call.

    // The internal onImu is hooked to BLE. To test live readings, we need to invoke it.
    // Workaround: read the stored calibration via localStorage, and also try calling getCurrentPitch after a manual stub.
    const stored = JSON.parse(localStorage.getItem('df_gun_cal'));

    // Live test: simulate the sensor at -15° pitch (halfway down)
    // That gravity = (cos(15°), 0, sin(15°)) = (0.966, 0, 0.259)
    // We can fake the live reading by stuffing onImu._lastAcc via the QuickDraw closure...
    // Easiest: trigger onImu by dispatching a fake characteristicvaluechanged. Skip — just
    // verify the stored cal vectors are correct.
    return {
      stored,
      isCalibrated: QuickDraw.isCalibrated ? QuickDraw.isCalibrated() : null,
      currentPitch: QuickDraw.getCurrentPitch(),
      currentAccel: QuickDraw.getCurrentAccel ? QuickDraw.getCurrentAccel() : null,
    };
  });
  console.log('RESULT:', JSON.stringify(result, null, 2));

  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
