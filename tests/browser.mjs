import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {createServer} from '../scripts/serve.mjs';
await mkdir('test-results',{recursive:true});
const server=createServer(4191),browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4191/?debug&nomonsters');await page.screenshot({path:'test-results/lobby.png',fullPage:true});await page.locator('#solo').click();
  try{await page.waitForFunction(()=>window.__chex?.game?.playing,{},{timeout:60000});}
  catch(error){console.log(await page.evaluate(()=>window.__chex.game.logs));await page.screenshot({path:'test-results/solo-failure.png',fullPage:true});throw error;}
  await page.waitForTimeout(1500);await page.screenshot({path:'test-results/solo.png',fullPage:true});
  for(const viewport of [{width:844,height:390},{width:393,height:852}]){
    await page.setViewportSize(viewport);await page.evaluate(()=>document.body.classList.add('touch-controls'));await page.waitForTimeout(300);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`test-results/solo-${viewport.width}.png`,fullPage:true});
  }
  assert.deepEqual(errors,[]);console.log('Original Chex Quest boots; desktop and phone layouts fit.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
