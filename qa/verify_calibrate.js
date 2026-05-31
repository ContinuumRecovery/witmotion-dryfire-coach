/* Playwright: verify the laptop calibrate button actually triggers phone-side calibration.
   Run: node qa/verify_calibrate.js
*/
const { chromium, devices } = require('playwright');
const URL = `https://continuumrecovery.github.io/witmotion-dryfire-coach/?v=${Date.now()}`;
const log = (...a) => console.log('[QA]', ...a);

async function pair(browser){
  const phoneCtx = await browser.newContext({
    ...devices['Pixel 5'],
    permissions: ['camera','microphone'],
  });
  const phone = await phoneCtx.newPage();
  phone.on('console', m => {
    const t = m.text();
    if (t.includes('calibrat') || t.includes('cmd') || t.includes('Re-calibrat')) log('[phone console]', t.substring(0,160));
  });
  phone.on('pageerror', e => log('[phone error]', e.message.substring(0,200)));
  await phone.goto(URL, { waitUntil: 'networkidle' });
  await phone.click('#role-phone-btn');
  await phone.waitForFunction(() => (document.getElementById('phone-code')?.textContent || '').length >= 5, { timeout: 15000 });
  const code = await phone.$eval('#phone-code', el => el.textContent.trim());
  log('Phone code:', code);
  await phone.waitForTimeout(1500);

  const laptopCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['microphone'],
  });
  const laptop = await laptopCtx.newPage();
  laptop.on('console', m => {
    const t = m.text();
    if (t.includes('calibrat') || t.includes('sendCmd') || t.includes('not connected')) log('[laptop console]', t.substring(0,160));
  });
  laptop.on('pageerror', e => log('[laptop error]', e.message.substring(0,200)));
  await laptop.goto(URL, { waitUntil: 'networkidle' });
  await laptop.click('#role-laptop-btn');
  await laptop.waitForTimeout(600);
  try { await laptop.fill('#laptop-code', code, { timeout: 4000 }); await laptop.click('#laptop-join'); } catch(e){}
  try { await phone.click('#wiz-close', { timeout: 2000 }); } catch(e){}
  try { await laptop.click('#wiz-close', { timeout: 2000 }); } catch(e){}
  await laptop.waitForTimeout(2500);
  return { phone, laptop };
}

async function main(){
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--no-sandbox']
  });
  try {
    const { phone, laptop } = await pair(browser);

    // 1. Verify pairing is up
    const paired = await laptop.evaluate(() => (typeof Role !== 'undefined') && Role.isConnected && Role.isConnected());
    log('Laptop paired?', paired);

    // 2. Check that #ctrl-calibrate exists and is wired
    const calBtnInfo = await laptop.evaluate(() => {
      const b = document.getElementById('ctrl-calibrate');
      if (!b) return { exists:false };
      return {
        exists: true,
        wired: !!b._wired,
        visible: b.offsetParent !== null,
        text: b.textContent.trim(),
        rect: b.getBoundingClientRect()
      };
    });
    log('ctrl-calibrate:', JSON.stringify(calBtnInfo));

    // 3. Also check setup-cal-target
    const sw2Info = await laptop.evaluate(() => {
      const b = document.getElementById('setup-cal-target');
      if (!b) return { exists:false };
      return { exists:true, wired:!!b._wired, visible: b.offsetParent !== null, text: b.textContent.trim() };
    });
    log('setup-cal-target:', JSON.stringify(sw2Info));

    // 4. Install a listener on the phone for incoming calibrate cmd
    await phone.evaluate(() => {
      window.__sawCalibrate = false;
      const orig = window._dfPhone?.onLaptopMessage;
      if (orig){
        window._dfPhone.onLaptopMessage = function(m){
          if (m && m.type === 'cmd' && m.cmd === 'calibrate'){ window.__sawCalibrate = true; console.log('[phone got calibrate cmd]'); }
          return orig.call(this, m);
        };
      }
      // Track calibrationLocked / cornerHistory clear
      window.__calStateBefore = { locked: typeof calibrationLocked !== 'undefined' ? calibrationLocked : null, histLen: typeof cornerHistory !== 'undefined' ? cornerHistory.length : null };
    });

    // 5. Hook the phone's #btn-calib click so we can detect when it gets clicked
    await phone.evaluate(() => {
      window.__btnCalibClicks = 0;
      const b = document.getElementById('btn-calib');
      if (b){
        b.addEventListener('click', () => { window.__btnCalibClicks++; console.log('[phone btn-calib clicked]'); }, true);
      }
      window.__modeBefore = (typeof mode !== 'undefined') ? mode : null;
    });

    // 6. Click the calibrate button on laptop
    log('Clicking #ctrl-calibrate...');
    await laptop.click('#ctrl-calibrate');
    await laptop.waitForTimeout(1500);

    const phoneAfter = await phone.evaluate(() => ({
      sawCalibrate: window.__sawCalibrate,
      btnCalibClicks: window.__btnCalibClicks,
      modeBefore: window.__modeBefore,
      stateBefore: window.__calStateBefore,
      stateAfter: { locked: typeof calibrationLocked !== 'undefined' ? calibrationLocked : null, histLen: typeof cornerHistory !== 'undefined' ? cornerHistory.length : null }
    }));
    log('Phone after click:', JSON.stringify(phoneAfter));

    // 6. Click the wizard step-2 calibrate button
    log('Clicking #setup-cal-target (wizard)...');
    await phone.evaluate(() => { window.__sawCalibrate = false; });
    await laptop.click('#setup-cal-target');
    await laptop.waitForTimeout(1500);
    const phoneAfter2 = await phone.evaluate(() => window.__sawCalibrate);
    log('Phone saw calibrate from wizard?', phoneAfter2);

    await laptop.screenshot({ path:'qa/verify-calibrate-laptop.png', fullPage:true });
    await phone.screenshot({ path:'qa/verify-calibrate-phone.png', fullPage:false });
    log('Screenshots saved');

  } catch(e){
    log('TEST ERROR', e.message);
  } finally {
    await browser.close();
  }
}
main();
