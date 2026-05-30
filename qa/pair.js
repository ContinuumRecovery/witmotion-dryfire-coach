/* End-to-end smoke test for phone<->laptop pairing.
   Spawns two browser contexts (phone-as-Pixel-5, laptop-as-desktop),
   clicks Phone role on phone, reads the 6-char code, then in the laptop
   context enters the code and waits for the data-channel 'paired' state.
*/
const { chromium, devices } = require('playwright');

const URL = `https://continuumrecovery.github.io/witmotion-dryfire-coach/?v=${Date.now()}`;

async function main(){
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });

  // PHONE
  const phoneCtx = await browser.newContext({ ...devices['Pixel 5'], permissions: ['camera','microphone'] });
  const phone = await phoneCtx.newPage();
  phone.on('console', m => console.log('  [phone]', m.type(), m.text().slice(0, 200)));
  await phone.goto(URL, { waitUntil: 'networkidle' });

  // Take a screenshot of the role chooser
  await phone.screenshot({ path: '/home/user/workspace/dryfire/qa/pair1-chooser.png' });

  // Pick "Phone"
  await phone.click('#role-phone-btn');
  await phone.waitForSelector('#phone-pair.show', { timeout: 5000 });
  await phone.waitForFunction(() => {
    const t = document.getElementById('phone-code')?.textContent || '';
    return t && t !== '——————' && t.length === 6;
  }, { timeout: 15000 });
  const code = await phone.$eval('#phone-code', el => el.textContent.trim());
  console.log('PHONE got code:', code);
  await phone.screenshot({ path: '/home/user/workspace/dryfire/qa/pair2-phone-code.png' });

  // Wait briefly so PeerJS broker registers the host id
  await phone.waitForTimeout(2500);

  // LAPTOP
  const laptopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const laptop = await laptopCtx.newPage();
  laptop.on('console', m => console.log('  [laptop]', m.type(), m.text().slice(0, 200)));
  await laptop.goto(URL, { waitUntil: 'networkidle' });
  await laptop.screenshot({ path: '/home/user/workspace/dryfire/qa/pair3-laptop-chooser.png' });

  await laptop.click('#role-laptop-btn');
  await laptop.waitForSelector('#laptop-pair.show', { timeout: 5000 });
  await laptop.fill('#laptop-code', code);
  await laptop.click('#laptop-join');
  await laptop.screenshot({ path: '/home/user/workspace/dryfire/qa/pair4-laptop-connecting.png' });

  // Wait for either success or error
  try {
    await laptop.waitForFunction(() => {
      const t = document.getElementById('laptop-status')?.textContent || '';
      return t.includes('✓') || t.toLowerCase().includes('not found') || t.toLowerCase().includes('error');
    }, { timeout: 20000 });
  } catch(e){
    console.log('LAPTOP wait timed out');
  }
  const laptopStatus = await laptop.$eval('#laptop-status', el => el.textContent);
  const phoneStatus  = await phone.$eval('#phone-status',  el => el.textContent);
  console.log('LAPTOP status:', laptopStatus);
  console.log('PHONE  status:', phoneStatus);

  // Give a moment for video stream
  await laptop.waitForTimeout(2500);
  await laptop.screenshot({ path: '/home/user/workspace/dryfire/qa/pair5-laptop-paired.png', fullPage: false });
  await phone.screenshot({ path: '/home/user/workspace/dryfire/qa/pair6-phone-paired.png' });

  // Check that body has role-laptop class
  const role = await laptop.$eval('body', b => Array.from(b.classList).join(' '));
  console.log('LAPTOP body classes:', role);

  // Check that dashboard panels exist and are visible
  const dashVisible = await laptop.$eval('#laptop-dash', el => getComputedStyle(el).display);
  console.log('LAPTOP dash display:', dashVisible);

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
