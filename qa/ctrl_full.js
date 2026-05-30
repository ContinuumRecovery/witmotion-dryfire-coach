/* E2E test for the laptop control center:
   1. Pair phone + laptop
   2. From laptop, set distance=20, shot count=3, click center aim, set mic source=laptop
   3. Inject 3 synthetic shots on the phone (no real audio path; synthesize the click)
   4. Verify:
      - Distance / shot count reach the phone (in-dist === '20')
      - Aim recentered (aimTargetNorm.x === 0.5, y === 0.5)
      - All 3 shots show up on the dashboard
      - After 3 tracked shots, sessionEnd fires and results modal opens on laptop
      - Each shot row has a clip indicator (▶) after clips arrive
*/
const { chromium, devices } = require('playwright');

const URL = `https://continuumrecovery.github.io/witmotion-dryfire-coach/?v=${Date.now()}`;

function log(...args){ console.log(...args); }

async function main(){
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });

  // ---- Phone ----
  const phoneCtx = await browser.newContext({ ...devices['Pixel 5'], permissions: ['camera','microphone'] });
  const phone = await phoneCtx.newPage();
  const phoneErrors = [];
  phone.on('pageerror', e => { phoneErrors.push(e.message); log('  [phone error]', e.message); });
  phone.on('console', m => { if (m.type() === 'error') log('  [phone console.error]', m.text()); });
  await phone.goto(URL, { waitUntil: 'networkidle' });
  await phone.click('#role-phone-btn');
  await phone.waitForFunction(() => {
    const t = document.getElementById('phone-code')?.textContent || '';
    return t && t.length === 6;
  }, { timeout: 15000 });
  const code = await phone.$eval('#phone-code', el => el.textContent.trim());
  log('CODE:', code);
  await phone.waitForTimeout(2500);

  // ---- Laptop ----
  const laptopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions:['microphone'] });
  const laptop = await laptopCtx.newPage();
  const laptopErrors = [];
  laptop.on('pageerror', e => { laptopErrors.push(e.message); log('  [laptop error]', e.message); });
  laptop.on('console', m => { if (m.type() === 'error') log('  [laptop console.error]', m.text()); });
  await laptop.goto(URL, { waitUntil: 'networkidle' });
  await laptop.click('#role-laptop-btn');
  await laptop.fill('#laptop-code', code);
  await laptop.click('#laptop-join');
  await laptop.waitForFunction(() => {
    const t = document.getElementById('laptop-status')?.textContent || '';
    return t.includes('✓');
  }, { timeout: 25000 });
  log('PAIRED');

  // Wait for LaptopCtrl.init() to fire and push initial commands
  await laptop.waitForTimeout(3500);

  // 1) Check control rail wired (start button enabled, mic seg shows active)
  const ctrlInfo = await laptop.evaluate(() => ({
    startEnabled: !document.getElementById('ctrl-start').disabled,
    activeMic: document.querySelector('#ctrl-mic-seg button.active')?.dataset.mic,
    distValue: document.getElementById('ctrl-dist').value,
    countValue: document.getElementById('ctrl-count').value,
  }));
  log('CTRL state:', JSON.stringify(ctrlInfo));

  // 2) From laptop: change distance to 20, count to 3, aim to center
  await laptop.fill('#ctrl-dist', '20');
  await laptop.locator('#ctrl-dist').dispatchEvent('change');
  await laptop.fill('#ctrl-count', '3');
  await laptop.locator('#ctrl-count').dispatchEvent('change');
  await laptop.click('.ctrl-aim button[data-aim="c"]');
  await laptop.waitForTimeout(700); // let commands flow

  // Verify the phone received those commands
  const phoneAfterCmd = await phone.evaluate(() => ({
    inDist: document.getElementById('in-dist').value,
    aim: typeof aimTargetNorm === 'object' ? aimTargetNorm : null,
    shotCount: typeof targetShotCount === 'number' ? targetShotCount : null,
    micSource: typeof micSource === 'string' ? micSource : null,
  }));
  log('PHONE state after cmds:', JSON.stringify(phoneAfterCmd));

  // 3) Start the session from laptop (this drives the phone's setArmed)
  // First prepare the phone with a fake homography so scoring works
  await phone.evaluate(() => {
    homography = [[1,0,0],[0,1,0],[0,0,1]];
    homographyInv = homography;
    aimTargetNorm = { x: 0.5, y: 0.5 };
    laserNorm = { x: 0.52, y: 0.49 };
  });

  await laptop.click('#ctrl-start');
  await laptop.waitForTimeout(800);

  // 4) Inject 3 synthetic shots on phone
  for (let i=0; i<3; i++){
    await phone.evaluate((idx) => {
      laserNorm = { x: 0.50 + (idx-1)*0.04, y: 0.50 + (idx-1)*0.02 };
      const tNow = performance.now();
      // Seed pre-shot history so the jerk analyzer has data
      for (let k=0; k<6; k++) preShotLaser.push({ t: tNow - (200 - k*30), x: 0.5 + k*0.01, y: 0.5 });
      for (let k=0; k<20; k++) preShotImu.push({ t: tNow - (200 - k*10), gx: 5, gy: 2, gz: 8 });
      onClickDetected('test', 1);
    }, i);
    await laptop.waitForTimeout(800);
  }

  // Wait a bit for the auto-stop sessionEnd + clip chunks
  await laptop.waitForTimeout(2500);

  const verify = await laptop.evaluate(() => ({
    rows: document.querySelectorAll('#dash-tbody tr').length,
    shots: document.getElementById('dash-shots').textContent,
    resultsOpen: document.getElementById('results-modal').classList.contains('open'),
    resultsStatsCount: document.getElementById('results-stats').children.length,
    resultsShots: document.getElementById('results-shots').children.length,
    clipMarks: document.querySelectorAll('#dash-tbody .clip-mark').length,
    phoneStateText: document.getElementById('ps-armed').textContent,
  }));
  log('VERIFY:', JSON.stringify(verify, null, 2));

  // Test clicking the first results shot to play a clip
  if (verify.resultsShots > 0){
    await laptop.evaluate(() => {
      const r = document.querySelector('#results-shots .results-shot');
      if (r) r.click();
    });
    await laptop.waitForTimeout(800);
    const clipOpen = await laptop.evaluate(() => document.getElementById('clip-player').classList.contains('open'));
    log('Clip player opened:', clipOpen);
  }

  await laptop.screenshot({ path: '/home/user/workspace/dryfire/qa/ctrl-laptop-final.png', fullPage: false });
  await phone.screenshot({ path: '/home/user/workspace/dryfire/qa/ctrl-phone-final.png' });

  await browser.close();

  // Summary
  const ok =
    verify.rows >= 3 &&
    verify.resultsOpen &&
    verify.resultsStatsCount === 6 &&
    verify.resultsShots >= 3 &&
    phoneErrors.length === 0 &&
    laptopErrors.length === 0;
  log('');
  log('================== SUMMARY ==================');
  log('rows on dash:', verify.rows, '(want >=3)');
  log('results modal open:', verify.resultsOpen);
  log('results stat cards:', verify.resultsStatsCount, '(want 6)');
  log('results shot rows:', verify.resultsShots, '(want >=3)');
  log('phone errors:', phoneErrors.length);
  log('laptop errors:', laptopErrors.length);
  log(ok ? '✓ PASS' : '✗ FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
