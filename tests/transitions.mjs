import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {chromium} from '@playwright/test';
import {createServer} from '../scripts/serve.mjs';
await mkdir('test-results',{recursive:true});
assert.equal(spawnSync(process.platform==='win32'?'python':'python3',['tests/exit-fixture.py'],{stdio:'inherit'}).status,0);
const server=createServer(4193),browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const host=await browser.newPage({viewport:{width:1100,height:800}}),guest=await browser.newPage({viewport:{width:1100,height:800}});
  for(const page of [host,guest])await page.route('**/game/chexquest.zip',route=>route.fulfill({path:'test-results/exit-game.zip',contentType:'application/zip'}));
  const startLevel=Number(process.argv[2]||1);
  await host.goto('http://127.0.0.1:4193/?debug&nomonsters');await host.locator('#level').selectOption(String(startLevel));await host.locator('#host').click();await host.waitForFunction(()=>document.querySelector('#code').textContent.length===2);
  const code=await host.locator('#code').textContent();
  await guest.goto(`http://127.0.0.1:4193/?debug&nomonsters#room=${code}`);await guest.locator('#join').click();
  await Promise.all([host,guest].map(p=>p.waitForFunction(()=>window.__chex.game.playing,{},{timeout:90000})));
  await host.waitForTimeout(2000);await host.screenshot({path:'test-results/exit-start.png',fullPage:true});
  const gameplay=()=>{const d=window.__chex.game.context.getImageData(0,172,80,25).data;let blue=0;for(let i=0;i<d.length;i+=4)if(d[i]<60&&d[i+1]<70&&d[i+2]>90)blue++;return blue>250;};
  for(let level=startLevel;level<=5;level++){
    assert(await host.evaluate(gameplay),'The native level is running before its exit switch is used');
    await host.keyboard.press('KeyE',{delay:150});await host.waitForTimeout(1500);
    assert(!await host.evaluate(gameplay),'The real exit switch reaches the native result screen');
    await host.screenshot({path:`test-results/intermission-${level}.png`,fullPage:true});
    if(level<5){
      const deadline=Date.now()+30000;
      while(!await host.evaluate(gameplay)&&Date.now()<deadline){await host.keyboard.press('ControlLeft',{delay:150});await host.waitForTimeout(700);}
      assert(await host.evaluate(gameplay),'Both players advance into the next level');await host.waitForTimeout(500);
    }else await host.waitForTimeout(8000);
    for(const [name,page]of [['host',host],['guest',guest]]){
      const state=await page.evaluate(()=>({width:window.__chex.game.canvas.width,height:window.__chex.game.canvas.height,logs:window.__chex.game.logs.slice(-5),sent:window.__chex.net.sent}));
      console.log('After exit',level,name,state);assert.equal(state.height,200,'Native game has not crashed back to DOS');
      await page.screenshot({path:`test-results/after-exit-${level}-${name}.png`,fullPage:true});
    }
  }
  console.log('Four original exit switches and the native finale exit action completed in co-op.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
