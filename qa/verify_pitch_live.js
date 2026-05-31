const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport:{width:1440,height:900} })).newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.goto('https://continuumrecovery.github.io/witmotion-dryfire-coach/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.click('#role-laptop-btn').catch(()=>{});
  await page.waitForTimeout(300);
  await page.fill('#laptop-code', 'TESTAB');
  await page.click('#laptop-join');
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const ov = document.getElementById('role-overlay'); if (ov) ov.style.display='none'; });

  const result = await page.evaluate(() => {
    // Inject a fake notifyChar so QuickDraw's ensureBleHook attaches a listener,
    // then dispatch fake BLE packets to it.
    // BLE notify event has ev.target.value = DataView with WitMotion 0x55 0x61 packet.
    function makePacket(ax, ay, az){
      const buf = new ArrayBuffer(20);
      const dv = new DataView(buf);
      dv.setUint8(0, 0x55);
      dv.setUint8(1, 0x61);
      function s16(v){ const i = Math.round(v * 32768 / 16); return (i < 0 ? i + 0x10000 : i) & 0xFFFF; }
      const wx = s16(ax), wy = s16(ay), wz = s16(az);
      dv.setUint8(2, wx & 0xFF); dv.setUint8(3, (wx>>8) & 0xFF);
      dv.setUint8(4, wy & 0xFF); dv.setUint8(5, (wy>>8) & 0xFF);
      dv.setUint8(6, wz & 0xFF); dv.setUint8(7, (wz>>8) & 0xFF);
      return dv;
    }

    // Set up a fake notifyChar via eval so the let-scoped binding is overwritten
    const listeners = [];
    window._fakeListeners = listeners;
    eval('notifyChar = { addEventListener: function(name, fn){ window._fakeListeners.push(fn); } };');
    // wait a tick for ensureBleHook to fire (interval 500ms)
    return new Promise(resolve => {
      setTimeout(() => {
        function fire(ax, ay, az){
          const dv = makePacket(ax, ay, az);
          for (const fn of listeners){
            try { fn({ target: { value: dv } }); } catch(e){}
          }
        }
        // Calibrate target at level (gT = (1,0,0)) and down at -30° (gD = (0.866, 0, 0.5))
        // Step 1: send target accel, then capture
        fire(1.0, 0.0, 0.0);
        QuickDraw.captureCalibration('target', 0); // accel auto-pulled from onImu._lastAcc
        // Step 2: send down accel, then capture
        fire(0.866, 0.0, 0.5);
        QuickDraw.captureCalibration('down', 0);
        // Now sweep live readings at various pitches
        const readings = [];
        const testPitches = [-30, -15, -5, 0, 5, 15];
        for (const p of testPitches){
          const t = p * Math.PI/180;
          // gun in IMU frame for this mount: ax = cos(t), ay = 0, az = -sin(t)
          // (For our test mount: gravity rotates in xz plane.)
          fire(Math.cos(t), 0, -Math.sin(t));
          readings.push({ simulatedPitch: p, measured: QuickDraw.getCurrentPitch() });
        }
        resolve({
          listenerCount: listeners.length,
          stored: JSON.parse(localStorage.getItem('df_gun_cal')),
          readings,
        });
      }, 800);
    });
  });
  console.log('RESULT:', JSON.stringify(result, null, 2));

  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
