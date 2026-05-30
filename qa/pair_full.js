/* Full E2E:
   1. Phone picks role + waits for laptop
   2. Laptop joins via code
   3. Synthetic shot on phone -> verify laptop dash table has a row
*/
const { chromium, devices } = require('playwright');

const URL = `https://continuumrecovery.github.io/witmotion-dryfire-coach/?v=${Date.now()}`;

async function main(){
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
  const phoneCtx = await browser.newContext({ ...devices['Pixel 5'], permissions: ['camera','microphone'] });
  const phone = await phoneCtx.newPage();
  phone.on('pageerror', e => console.log('  [phone error]', e.message));
  await phone.goto(URL, { waitUntil: 'networkidle' });
  await phone.click('#role-phone-btn');
  await phone.waitForFunction(() => {
    const t = document.getElementById('phone-code')?.textContent || '';
    return t && t.length === 6 && t !== '——————';
  }, { timeout: 15000 });
  const code = await phone.$eval('#phone-code', el => el.textContent.trim());
  console.log('CODE:', code);
  await phone.waitForTimeout(2500);

  const laptopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const laptop = await laptopCtx.newPage();
  laptop.on('pageerror', e => console.log('  [laptop error]', e.message));
  await laptop.goto(URL, { waitUntil: 'networkidle' });
  await laptop.click('#role-laptop-btn');
  await laptop.fill('#laptop-code', code);
  await laptop.click('#laptop-join');
  await laptop.waitForFunction(() => {
    const t = document.getElementById('laptop-status')?.textContent || '';
    return t.includes('✓');
  }, { timeout: 25000 });
  console.log('PAIRED');
  await laptop.waitForTimeout(1500);

  // Inject a synthetic shot on the phone
  await phone.evaluate(() => {
    // Force armed + homography + aim so the scoring path runs end-to-end.
    homography = [[1,0,0],[0,1,0],[0,0,1]];
    homographyInv = homography;
    aimTargetNorm = { x: 0.5, y: 0.5 };
    laserNorm = { x: 0.55, y: 0.48 };
    sessionArmed = true;
    if (typeof setArmed === 'function') setArmed(true);
    // Pre-load some pre-shot history so the jerk analyzer has data
    const tNow = performance.now();
    for (let i=0; i<6; i++){
      preShotLaser.push({ t: tNow - (200 - i*30), x: 0.5 + i*0.01, y: 0.5 });
    }
    for (let i=0; i<20; i++){
      preShotImu.push({ t: tNow - (200 - i*10), gx: 5, gy: 2, gz: 8 });
    }
    // Trigger
    onClickDetected('test', 1);
  });

  await laptop.waitForTimeout(1500);

  const rows = await laptop.$$eval('#dash-tbody tr', trs => trs.length);
  const shots = await laptop.$eval('#dash-shots', el => el.textContent);
  const dir   = await laptop.$eval('#dash-jerk-dir', el => el.textContent);
  const mag   = await laptop.$eval('#dash-jerk-mag', el => el.textContent);
  const verdict = await laptop.$eval('#dash-jerk-verdict', el => el.textContent);
  console.log('DASH rows:', rows, 'shots stat:', shots);
  console.log('JERK direction:', dir, '| magnitude:', mag, '| verdict:', verdict);

  await laptop.screenshot({ path: '/home/user/workspace/dryfire/qa/full-laptop-after-shot.png', fullPage: false });
  await phone.screenshot({ path: '/home/user/workspace/dryfire/qa/full-phone-after-shot.png' });

  await browser.close();
  console.log(rows >= 1 ? 'PASS' : 'FAIL: no shot row on laptop');
}

main().catch(e => { console.error(e); process.exit(1); });
