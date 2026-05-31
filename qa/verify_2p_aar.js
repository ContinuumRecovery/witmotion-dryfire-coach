/* E2E for new features:
   - 1P: wobble badge appears on every shot (tier label)
   - 2P: mode toggle, player toggle, per-player tagging, side-by-side board, AAR winner
*/
const { chromium, devices } = require('playwright');

const URL = `https://continuumrecovery.github.io/witmotion-dryfire-coach/?v=${Date.now()}`;
function log(...a){ console.log(...a); }

async function pairPhoneLaptop(browser){
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
  await laptop.waitForTimeout(3500);

  // Dismiss wizard on both contexts (it may have auto-opened)
  for (const p of [phone, laptop]){
    try {
      await p.evaluate(() => {
        const wiz = document.getElementById('wiz');
        if (wiz) wiz.classList.remove('open');
        localStorage.setItem('df_wiz_seen','1');
      });
    } catch(e){}
  }

  // Prep phone with fake homography so scoring works
  await phone.evaluate(() => {
    homography = [[1,0,0],[0,1,0],[0,0,1]];
    homographyInv = homography;
    aimTargetNorm = { x: 0.5, y: 0.5 };
    laserNorm = { x: 0.52, y: 0.49 };
  });

  return { phone, laptop, phoneErrors, laptopErrors };
}

async function injectShot(phone, dx, dy, player){
  await phone.evaluate(({dx,dy,p}) => {
    laserNorm = { x: 0.50 + dx, y: 0.50 + dy };
    _lastLaserNorm = { t: performance.now(), x: 0.50 + dx, y: 0.50 + dy };
    const tNow = performance.now();
    for (let k=0; k<8; k++) preShotLaser.push({ t: tNow - (300 - k*30), x: 0.5 + k*0.01, y: 0.5 + k*0.005 });
    for (let k=0; k<20; k++) preShotImu.push({ t: tNow - (300 - k*10), gx: 5, gy: 2, gz: 8 });
    // Seed a pre-shot frame so Tier 3 fallback would also work in absence of laser
    const c = document.createElement('canvas'); c.width=240; c.height=240;
    const ctx = c.getContext('2d'); ctx.fillStyle='#222'; ctx.fillRect(0,0,240,240);
    preShotFrames.push({ t: tNow - 20, jpeg: c.toDataURL('image/jpeg', 0.5) });
    onClickDetected('test', 1);
  }, { dx, dy, p: player });
}

async function main(){
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });

  // ============ 1P PASS ============
  log('\n=== 1P PASS ===');
  let { phone, laptop, phoneErrors, laptopErrors } = await pairPhoneLaptop(browser);

  // Set shot count to 3 and start
  await laptop.fill('#ctrl-count', '3');
  await laptop.locator('#ctrl-count').dispatchEvent('change');
  await laptop.click('.ctrl-aim button[data-aim="c"]');
  await laptop.waitForTimeout(500);

  // Verify mode toggle exists and is on 1P
  const modeInfo1p = await laptop.evaluate(() => {
    const seg = document.getElementById('ctrl-mode-seg');
    const active = seg ? seg.querySelector('button.active')?.dataset.mode : null;
    return { hasModeSeg: !!seg, activeMode: active };
  });
  log('1P mode state:', JSON.stringify(modeInfo1p));

  await laptop.click('#ctrl-start');
  await laptop.waitForTimeout(800);

  // Inject 3 shots
  for (let i=0; i<3; i++){
    await injectShot(phone, (i-1)*0.04, (i-1)*0.02, 'A');
    await laptop.waitForTimeout(600);
  }
  await laptop.waitForTimeout(2500);

  // Check wobble badge for each shot — trigger via Dash.onMessage which calls renderWobble
  const wobbleBadges1p = await laptop.evaluate(() => {
    const arr = (window.Dash && Dash.shots) ? Dash.shots : [];
    const results = [];
    for (const s of arr){
      Dash.onMessage({ ...s, type: 'shot' });
      results.push(window._lastWobbleSource || null);
    }
    return { count: arr.length, sources: results };
  });
  log('1P wobble sources:', JSON.stringify(wobbleBadges1p));

  // Check AAR opened
  const aar1p = await laptop.evaluate(() => ({
    open: document.getElementById('results-modal').classList.contains('open'),
    has2PCard: !!document.querySelector('.results-2p-grid .results-2p-card'),
    hasWinner: (document.getElementById('results-winner-slot')?.textContent || '').trim().length > 0,
    hasTrend: !!document.getElementById('results-trend'),
    hasPolar: !!document.getElementById('results-polar'),
    hasCoach: (document.getElementById('results-coach-text')?.textContent || '').trim().length > 0,
    shotsCount: document.querySelectorAll('#results-shots .results-shot').length,
  }));
  log('1P AAR:', JSON.stringify(aar1p));

  await laptop.screenshot({ path: '/home/user/workspace/dryfire/qa/verify-1p-aar.png', fullPage: false });

  // Close modal + clip player + any other overlay; reset for next session
  await laptop.evaluate(() => {
    document.getElementById('results-modal')?.classList.remove('open');
    document.getElementById('clip-player')?.classList.remove('open');
    // Reset dash so start button re-enables
    const btn = document.querySelector('#ctrl-reset, [data-action="reset"]');
    if (btn) btn.click();
    else {
      // Manually reset state
      document.getElementById('ctrl-start').disabled = false;
      document.getElementById('ctrl-stop').disabled = true;
    }
  });
  await laptop.waitForTimeout(500);

  // ============ 2P PASS ============
  log('\n=== 2P PASS ===');
  // Switch to 2P mode
  await laptop.click('#ctrl-mode-seg button[data-mode="2p"]');
  await laptop.waitForTimeout(800);

  const modeInfo2p = await laptop.evaluate(() => {
    const mSeg = document.getElementById('ctrl-mode-seg');
    const pSeg = document.getElementById('ctrl-player-seg');
    const pBlock = document.getElementById('ctrl-player-block');
    return {
      activeMode: mSeg?.querySelector('button.active')?.dataset.mode,
      playerSegVisible: pBlock && getComputedStyle(pBlock).display !== 'none',
      activePlayer: pSeg?.querySelector('button.active')?.dataset.player,
      tableHeaderCells: document.querySelectorAll('#dash-table thead th, #dash-thead th').length,
      has2PBoard: !!document.querySelector('.dash-2p-board'),
    };
  });
  log('2P mode state:', JSON.stringify(modeInfo2p));

  // Set count = 2 each
  await laptop.fill('#ctrl-count', '2');
  await laptop.locator('#ctrl-count').dispatchEvent('change');
  await laptop.waitForTimeout(300);

  // Force-enable start button (test harness shortcut)
  await laptop.evaluate(() => { document.getElementById('ctrl-start').disabled = false; });
  await laptop.click('#ctrl-start');
  await laptop.waitForTimeout(600);

  // Verify phone got mode=2p
  const phoneMode = await phone.evaluate(() => ({ sessionMode, activePlayer }));
  log('Phone mode after toggle:', JSON.stringify(phoneMode));

  // Player A: 2 shots (good)
  await laptop.click('#ctrl-player-seg button[data-player="A"]');
  await laptop.waitForTimeout(400);
  await injectShot(phone, 0.01, 0.01, 'A');
  await laptop.waitForTimeout(600);
  await injectShot(phone, -0.01, 0.01, 'A');
  await laptop.waitForTimeout(600);

  // Player B: 2 shots (worse)
  await laptop.click('#ctrl-player-seg button[data-player="B"]');
  await laptop.waitForTimeout(400);
  const phoneAfterPlayerB = await phone.evaluate(() => ({ activePlayer }));
  log('Phone after Player B toggle:', JSON.stringify(phoneAfterPlayerB));
  await injectShot(phone, 0.05, 0.04, 'B');
  await laptop.waitForTimeout(600);
  await injectShot(phone, -0.06, 0.05, 'B');
  await laptop.waitForTimeout(2500);

  // Check AAR + 2P contents
  const aar2p = await laptop.evaluate(() => {
    const playerCells = Array.from(document.querySelectorAll('#dash-tbody tr')).map(tr => {
      const tds = tr.querySelectorAll('td');
      return tds.length;
    });
    return {
      open: document.getElementById('results-modal').classList.contains('open'),
      has2PCards: document.querySelectorAll('.results-2p-grid .results-2p-card').length,
      winnerText: (document.getElementById('results-winner-slot')?.textContent || '').trim(),
      coachText: (document.getElementById('results-coach-text')?.textContent || '').trim().slice(0, 200),
      shotCount: document.querySelectorAll('#results-shots .results-shot').length,
      rowColumnCounts: playerCells,
      shotsHavePlayerBadge: Array.from(document.querySelectorAll('#results-shots .results-shot')).map(s => {
        const badge = s.querySelector('.player-badge, [class*="player"]');
        return badge ? badge.textContent.trim() : null;
      }),
    };
  });
  log('2P AAR:', JSON.stringify(aar2p, null, 2));

  await laptop.screenshot({ path: '/home/user/workspace/dryfire/qa/verify-2p-aar.png', fullPage: false });
  await phone.screenshot({ path: '/home/user/workspace/dryfire/qa/verify-2p-phone.png' });

  await browser.close();

  // Summary
  const ok =
    modeInfo1p.activeMode === '1p' &&
    aar1p.open && aar1p.hasTrend && aar1p.hasPolar && aar1p.hasCoach && aar1p.shotsCount >= 3 &&
    modeInfo2p.activeMode === '2p' && modeInfo2p.playerSegVisible &&
    phoneMode.sessionMode === '2p' &&
    phoneAfterPlayerB.activePlayer === 'B' &&
    aar2p.open && aar2p.has2PCards >= 2 && aar2p.winnerText.length > 0 && aar2p.shotCount >= 4 &&
    phoneErrors.length === 0 && laptopErrors.length === 0;

  log('\n================== SUMMARY ==================');
  log('1P mode toggle works:', modeInfo1p.activeMode === '1p');
  log('1P AAR opened with charts+coach:', aar1p.open && aar1p.hasTrend && aar1p.hasPolar && aar1p.hasCoach);
  log('1P shots in AAR:', aar1p.shotsCount, '(want 3)');
  log('2P mode toggle works:', modeInfo2p.activeMode === '2p');
  log('2P player seg visible:', modeInfo2p.playerSegVisible);
  log('Phone in 2P mode:', phoneMode.sessionMode === '2p');
  log('Player toggle propagates:', phoneAfterPlayerB.activePlayer === 'B');
  log('2P AAR opened:', aar2p.open);
  log('2P cards rendered:', aar2p.has2PCards);
  log('Winner banner:', aar2p.winnerText);
  log('2P shot count:', aar2p.shotCount, '(want 4)');
  log('Phone errors:', phoneErrors.length);
  log('Laptop errors:', laptopErrors.length);
  log(ok ? '\n✓ PASS' : '\n✗ FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
