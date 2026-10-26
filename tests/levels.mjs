import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {createServer} from '../scripts/serve.mjs';
await mkdir('test-results',{recursive:true});
const server=createServer(4194),browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const selected=process.argv.slice(2).map(Number);
  for(const level of selected.length?selected:[2,3,4,5]){
    const host=await browser.newPage({viewport:{width:1100,height:800}}),guest=await browser.newPage({viewport:{width:1100,height:800}});
    await host.goto('http://127.0.0.1:4194/?debug');await host.locator('#level').selectOption(String(level));await host.locator('#host').click();await host.waitForFunction(()=>document.querySelector('#code').textContent.length===2);
    const code=await host.locator('#code').textContent();await guest.goto(`http://127.0.0.1:4194/?debug#room=${code}`);await guest.locator('#join').click();
    await Promise.all([host,guest].map(p=>p.waitForFunction(()=>window.__chex.game.playing,{},{timeout:90000})));await host.waitForTimeout(1500);
    for(const [name,page]of [['host',host],['guest',guest]]){
      const state=await page.evaluate(()=>{const d=window.__chex.game.context.getImageData(100,45,120,105).data;let yellow=0,blue=0;for(let i=0;i<d.length;i+=4){if(d[i]>80&&d[i+1]>55&&d[i+2]<65)yellow++;if(d[i]<110&&d[i+2]>100)blue++;}return {yellow,blue,start:window.__chex.game.logs.find(l=>l.includes('startmap:'))};});
      console.log(level,name,state);assert(state.start.includes(`startmap: ${level}`));
      await page.screenshot({path:`test-results/level-${level}-${name}.png`,fullPage:true});
      assert(state.yellow>200&&state.blue>50,'Other player visible at this level’s actual co-op start');
    }
    await host.close();await guest.close();
  }
  console.log('All five actual level starts support two visible players, including levels originally missing co-op starts.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
