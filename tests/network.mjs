import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {createServer} from '../scripts/serve.mjs';
await mkdir('test-results',{recursive:true});
const base=process.env.CHEX_URL||'http://127.0.0.1:4192/',server=process.env.CHEX_URL?null:createServer(4192),browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const host=await browser.newPage({viewport:{width:1280,height:850}}),guestContext=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true}),guest=await guestContext.newPage(),errors=[];
  for(const page of [host,guest])page.on('pageerror',e=>errors.push(e.message));
  await host.goto(base+'?debug&nomonsters');await host.locator('#host').click();
  await host.waitForFunction(()=>window.__chex?.room?.code&&document.querySelector('#code').textContent.length===2,{},{timeout:30000});
  const code=await host.locator('#code').textContent();console.log('Room',code);
  await guest.goto(`${base}?debug&nomonsters#room=${code}`);await guest.locator('#join').click();
  try{await Promise.all([host,guest].map(page=>page.waitForFunction(()=>window.__chex?.game?.playing,{},{timeout:90000})));}
  catch(error){for(const [name,page]of [['host',host],['guest',guest]]){console.log(name,await page.evaluate(()=>({status:document.querySelector('#status').textContent,logs:window.__chex?.game?.logs,packets:window.__chex?.net&&{sent:window.__chex.net.sent,received:window.__chex.net.received},canvas:[document.querySelector('#game').width,document.querySelector('#game').height]})));await page.screenshot({path:`test-results/connect-failure-${name}.png`,fullPage:true});}throw error;}
  await host.waitForTimeout(2500);
  for(const [name,page]of [['host',host],['guest',guest]]){
    console.log(name,await page.evaluate(()=>({players:window.__chex.game.logs.filter(line=>line.includes('of 2')),packets:{sent:window.__chex.net.sent,received:window.__chex.net.received},frames:window.__chex.game.frames})));
    await page.screenshot({path:`test-results/coop-${name}.png`,fullPage:true});
  }
  const colors=page=>page.evaluate(()=>{const data=window.__chex.game.context.getImageData(115,50,90,90).data;let yellow=0,blue=0;for(let i=0;i<data.length;i+=4){if(data[i]>100&&data[i+1]>65&&data[i+2]<65)yellow++;if(data[i]<100&&data[i+2]>120)blue++;}return {yellow,blue};});
  for(const page of [host,guest]){const c=await colors(page);assert(c.yellow>400&&c.blue>100,'The other Chex Warrior is rendered in front of this player');}
  assert.notEqual(await host.locator('#game').evaluate(c=>c.toDataURL()),await guest.locator('#game').evaluate(c=>c.toDataURL()),'Players have their own views');
  const before=await colors(host);
  const right=await guest.locator('[data-key="68"]').boundingBox(),cdp=await guestContext.newCDPSession(guest);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:right.x+right.width/2,y:right.y+right.height/2}]});
  await guest.waitForTimeout(600);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await guest.waitForTimeout(700);
  const after=await colors(host);console.log('Guest moves out of the host center view',before,after);
  assert(after.yellow<before.yellow*.7,'Guest movement is visible in the host game');
  const ammo=()=>host.locator('#game').evaluate(c=>{const x=document.createElement('canvas');x.width=40;x.height=30;x.getContext('2d').drawImage(c,0,170,40,30,0,0,40,30);return x.toDataURL();});
  const ammoBefore=await ammo();await host.keyboard.down('KeyF');await host.keyboard.down('KeyW');await host.waitForTimeout(350);await host.keyboard.up('KeyW');await host.keyboard.up('KeyF');await host.waitForTimeout(500);
  assert.notEqual(await ammo(),ammoBefore,'Firing consumes native ammunition while movement remains usable');
  assert(await host.evaluate(()=>window.__chex.game.held.size===0));
  // A room is two players, not an unrestricted emulator packet relay.
  const third=await browser.newPage();await third.goto(`${base}#room=${code}`);await third.locator('#join').click();await third.waitForFunction(()=>document.querySelector('#status').textContent.includes('already has two'),{},{timeout:30000});await third.close();
  await guest.close();await host.waitForFunction(()=>document.querySelector('#status').textContent.includes('friend disconnected'),{},{timeout:20000});
  assert.deepEqual(errors,[]);
  console.log('Native co-op, mutual visibility, independent views, mobile movement, firing, third-player rejection, and disconnect handling passed.');
}finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
