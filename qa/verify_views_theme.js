// Verify new view types, theme toggle, and focus mode on the laptop view.
const { chromium, devices } = require('playwright');
const URL = 'https://continuumrecovery.github.io/witmotion-dryfire-coach/';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERR:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text()); });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('df_wiz_seen','1');
    localStorage.setItem('df_role','laptop');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Inject a few fake shots so the target shows hits
  await page.evaluate(() => {
    try {
      const arr = (window.Dash && window.Dash.shots) || [];
      arr.length = 0;
      arr.push({ poi:{x:0.50, y:0.50}, score:95, t: 1 });
      arr.push({ poi:{x:0.42, y:0.55}, score:60, t: 2 });
      arr.push({ poi:{x:0.58, y:0.46}, score:30, t: 3 });
      arr.push({ poi:{x:0.55, y:0.52}, score:85, t: 4 });
      if (window.Dash && window.Dash.renderRect) window.Dash.renderRect();
    } catch(e){}
  });

  // Confirm taskbar buttons exist
  const haveButtons = await page.evaluate(() => ({
    focus: !!document.getElementById('tb-focus'),
    theme: !!document.getElementById('tb-theme'),
    styleOpts: Array.from(document.querySelectorAll('#rect-style option')).map(o => o.value)
  }));
  console.log('BUTTONS:', JSON.stringify(haveButtons));

  // Ensure target panel is positioned visibly + render directly to a data URL (canvas may be hidden behind panel layout)
  await page.evaluate(() => {
    const p = document.querySelector('.dash-panel[data-window-id="target"]');
    if (p){ p.style.position='fixed'; p.style.left='20px'; p.style.top='20px'; p.style.width='640px'; p.style.height='640px'; p.style.zIndex='10000'; }
  });
  await page.waitForTimeout(400);

  // Cycle through each target style and dump the canvas image
  const styles = ['bullseye','ipsc','b8','dot','silhouette','paper-photo','live','grid'];
  const fs = require('fs');
  for (const s of styles){
    await page.evaluate((v) => {
      const sel = document.getElementById('rect-style');
      sel.value = v;
      sel.dispatchEvent(new Event('change'));
    }, s);
    await page.waitForTimeout(350);
    const dataUrl = await page.evaluate(() => {
      const c = document.getElementById('dash-rect-canvas');
      return c ? c.toDataURL('image/png') : null;
    });
    if (dataUrl){
      const b64 = dataUrl.split(',')[1];
      fs.writeFileSync(`qa/verify-view-${s}.png`, Buffer.from(b64, 'base64'));
      console.log('captured', s);
    } else console.log('NO CANVAS for', s);
  }

  // Hide any overlay that intercepts taskbar clicks
  await page.evaluate(() => {
    const ov = document.getElementById('role-overlay');
    if (ov) ov.style.display='none';
  });

  // Toggle theme: dark -> light
  await page.click('#tb-theme');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'qa/verify-theme-light.png', fullPage: false });
  console.log('theme after click 1:', await page.evaluate(() => document.documentElement.dataset.theme));

  // -> auto
  await page.click('#tb-theme');
  await page.waitForTimeout(300);
  console.log('theme after click 2:', await page.evaluate(() => document.documentElement.dataset.theme + ' (mode=' + localStorage.getItem('df_theme') + ')'));

  // -> dark
  await page.click('#tb-theme');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'qa/verify-theme-dark.png', fullPage: false });
  console.log('theme after click 3:', await page.evaluate(() => document.documentElement.dataset.theme));

  // Focus mode on
  await page.click('#tb-focus');
  await page.waitForTimeout(400);
  const focusState = await page.evaluate(() => ({
    bodyHas: document.body.classList.contains('focus-mode'),
    visible: Array.from(document.querySelectorAll('.dash-panel')).map(p => ({
      id: p.dataset.windowId,
      shown: getComputedStyle(p).display !== 'none'
    }))
  }));
  console.log('FOCUS:', JSON.stringify(focusState));
  await page.screenshot({ path: 'qa/verify-focus-mode.png', fullPage: false });

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
