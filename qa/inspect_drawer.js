const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  // Use a viewport close to the user's screenshot (looks like ~1145x980)
  const ctx = await browser.newContext({ viewport: { width: 1145, height: 980 } });
  const page = await ctx.newPage();
  const url = 'https://continuumrecovery.github.io/witmotion-dryfire-coach/?cb=' + Date.now();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('df_wiz_seen', '1'));
  await page.reload({ waitUntil: 'networkidle' });
  const roleLaptop = await page.$('#role-laptop-btn');
  if (roleLaptop) {
    await roleLaptop.click();
    await page.fill('#laptop-code', 'ABCDEF');
    await page.click('#laptop-join');
    await page.waitForTimeout(2500);
    await page.evaluate(() => { const o = document.getElementById('role-overlay'); if (o) o.style.display = 'none'; });
  }
  await page.waitForTimeout(800);
  await page.click('#tb-settings');
  await page.waitForTimeout(900);

  const info = await page.evaluate(() => {
    const grid = document.querySelector('#drawer-session-slot .ctrl-grid');
    const drawer = document.getElementById('settings-drawer');
    const styleEl = document.head.querySelector('style:last-of-type');
    const dq = drawer ? drawer.getBoundingClientRect() : null;
    const gq = grid ? grid.getBoundingClientRect() : null;
    const cs = grid ? getComputedStyle(grid) : null;
    // dump styles injected
    const styles = [...document.head.querySelectorAll('style')].map(s => s.textContent.length);
    return {
      drawerExists: !!drawer,
      drawerWidth: dq?.width,
      gridExists: !!grid,
      gridWidth: gq?.width,
      gridCols: cs?.gridTemplateColumns,
      styleBlocksLengths: styles,
      drawerHTMLPreview: drawer ? drawer.outerHTML.slice(0, 200) : null,
    };
  });
  console.log(JSON.stringify(info, null, 2));

  await page.screenshot({ path: 'qa/inspect-drawer.png', fullPage: false });
  await browser.close();
})();
