import {Room,IpxNet} from './room.js';
import {Game,KEYS} from './game.js';
import {parseCode} from './protocol.js';
const $=s=>document.querySelector(s),canvas=$('#game');
let room,net,game,mode,booting=false,wakeLock,launchTimer,connectedReady=false;
const debug=new URLSearchParams(location.search).has('debug');
function status(text){$('#status').textContent=text;$('#lobby-status').textContent=text;}
function overlay(title,text){$('#overlay').hidden=false;$('#overlay-title').textContent=title;$('#overlay-text').textContent=text;}
function fail(error){const text=error?.message||String(error);clearTimeout(launchTimer);status(text);if(game){game.release();overlay('Mission interrupted',text+' Use Leave to start a new room.');}for(const b of document.querySelectorAll('#lobby button'))b.disabled=false;}
function settings(){return {turn:$('#turn').value.trim(),username:$('#turn-user').value,credential:$('#turn-password').value,host:$('#peer-host').value.trim(),path:$('#peer-path').value.trim()};}
function config(){return {level:Number($('#level').value),skill:Number($('#skill').value)};}
async function wake(){try{wakeLock=await navigator.wakeLock?.request('screen');}catch{}}
function showPlayer(){document.body.classList.add('playing');$('#lobby').hidden=true;$('#player').hidden=false;wake();}
function createGame(){
  game=new Game(canvas,{
    networkReady:()=>{if(mode==='host'){room.send({type:'launch',...config()});status('Your friend is loading. Synchronizing the two warriors...');}},
    playing:()=>{clearTimeout(launchTimer);$('#overlay').hidden=true;status(mode==='solo'?'Mission started. Good luck, Chex Warrior!':'Co-op online. Find your friend in front of you.');canvas.focus();room?.send({type:'ready'});},
    error:fail,exit:()=>{if(game?.playing)fail('Chex Quest has closed.');}
  });
  // Start audio in the actual tap/click gesture, before downloading or signaling.
  game.enableAudio().catch(()=>{$('#sound').textContent='Enable sound';});
}
async function launch(options){
  if(booting||game.ci)return;booting=true;if(room)room.started=true;
  overlay('Assembling your squad','Loading the original Chex Quest. Both players will start in the same level.');
  launchTimer=setTimeout(()=>fail('The game did not finish connecting. Keep both tabs visible and try a new room.'),90000);
  try{await game.start({...options,net,host:mode==='host',nomonsters:debug&&new URLSearchParams(location.search).has('nomonsters')});}
  catch(error){fail(error);}finally{booting=false;}
}
function createRoom(){
  return new Room({
    status,error:fail,
    connected:()=>{net=new IpxNet(room);connectedReady=true;status('Connected to your friend. Preparing the mission...');if(mode==='host')launch(config());else overlay('Friend connected','Waiting for the host’s game to be ready...');},
    packet:data=>net?.receive(data),launch:options=>launch(options),ready:()=>{if(game.playing)status('Both warriors are ready. Zorch together!');},
    latency:ms=>{$('#latency').textContent=`${ms} ms`;},
    visibility:hidden=>{if(hidden){game.release();status('Your friend’s tab is hidden. Waiting for them to return...');}else status('Your friend is back. Continue your mission.');},
    disconnected:()=>{connectedReady=false;game?.release();game?.ci?.pause();fail('Your friend disconnected. The original co-op session cannot add a replacement player midway; create a new room to play together again.');}
  },settings());
}
async function begin(wanted,code){
  if(mode)return;mode=wanted;createGame();showPlayer();
  $('#player-name').textContent=wanted==='solo'?'Chex Warrior':wanted==='host'?'Player 1 · Host':'Player 2';
  try{
    if(wanted==='solo'){await launch(config());return;}
    overlay(wanted==='host'?'Opening your room':'Joining your friend','Connecting to the room service...');room=createRoom();const roomCode=await room.open(wanted==='host',code);
    $('#code').textContent=roomCode;$('#room-label').hidden=false;$('#invite').hidden=false;
    if(!connectedReady){if(wanted==='host'){overlay(`ROOM ${roomCode}`,'Share this code or tap Invite. Your mission starts when your friend joins.');status('Waiting for your friend. Keep this tab open.');}else{overlay('Connecting to your friend',`Joining room ${roomCode}...`);status('Connecting to your friend...');}}
  }catch(error){fail(error);}
}
$('#host').onclick=()=>begin('host');$('#solo').onclick=()=>begin('solo');
$('#join-form').onsubmit=e=>{e.preventDefault();const code=parseCode($('#room-code').value);if(!code){status('Enter a two-character room code.');return;}begin('guest',code);};
$('#invite').onclick=async()=>{const url=new URL(location.href);url.search='';url.hash=`room=${room.code}`;try{await navigator.clipboard.writeText(url.href);status(`Invite copied. Room ${room.code}.`);}catch{status(`Share room ${room.code}: ${url.href}`);}};
$('#leave').onclick=()=>{game?.release();room?.close();location.href=location.pathname;};
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#player').requestFullscreen();await screen.orientation?.lock?.('landscape');}catch{status('Turn your phone sideways for the widest view.');}};
$('#sound').onclick=async()=>{if(!game)return;const enabling=game.audio?.state!=='running'||$('#sound').textContent==='Enable sound';await game.enableAudio();game.muted=enabling?false:!game.muted;$('#sound').textContent=game.muted?'Sound off':'Sound on';};
function touch(on){document.body.classList.toggle('touch-controls',on);$('#touch-toggle').setAttribute('aria-pressed',String(on));}
touch(matchMedia('(pointer:coarse)').matches);$('#touch-toggle').onclick=()=>touch(!document.body.classList.contains('touch-controls'));
$('#mouse-lock').onclick=()=>canvas.requestPointerLock?.();
canvas.addEventListener('click',()=>{canvas.focus();if(!document.body.classList.contains('touch-controls'))canvas.requestPointerLock?.();game?.enableAudio();});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas&&game?.ci)game.ci.sendMouseRelativeMotion(e.movementX/640,0);});
canvas.addEventListener('mousedown',e=>{if(e.button===0&&document.pointerLockElement===canvas)game?.ci?.sendMouseButton(0,true);});
document.addEventListener('mouseup',()=>game?.ci?.sendMouseButton(0,false));canvas.addEventListener('contextmenu',e=>e.preventDefault());
function codeFor(e){return KEYS[e.code]??(/^Key[A-Z]$/.test(e.code)?e.code.charCodeAt(3):/^Digit[0-9]$/.test(e.code)?e.code.charCodeAt(5):undefined);}
document.addEventListener('keydown',e=>{if(!game?.ci||e.target.matches('input,select')||e.metaKey)return;const code=codeFor(e);if(code!==undefined){e.preventDefault();game.key(e.code,code,true);}});
document.addEventListener('keyup',e=>{if(!game)return;const code=codeFor(e);if(code!==undefined)game.key(e.code,code,false);});
for(const button of document.querySelectorAll('[data-key]')){
  button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);button.classList.add('pressed');game?.key(`touch-${e.pointerId}`,Number(button.dataset.key),true);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,e=>{button.classList.remove('pressed');game?.key(`touch-${e.pointerId}`,Number(button.dataset.key),false);});
}
$('#weapon').onchange=e=>{if(e.target.value)game?.ci?.simulateKeyPress(e.target.value.charCodeAt(0));e.target.value='';};
$('#map').onclick=()=>game?.ci?.simulateKeyPress(258);$('#menu').onclick=()=>{document.exitPointerLock?.();game?.ci?.simulateKeyPress(256);$('#menu-keys').hidden=!$('#menu-keys').hidden;};
for(const button of document.querySelectorAll('[data-tap]'))button.onclick=()=>game?.ci?.simulateKeyPress(Number(button.dataset.tap));
function release(){game?.release();for(const b of document.querySelectorAll('.pressed'))b.classList.remove('pressed');}
window.addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{if(document.hidden)release();else wake();room?.send({type:'visibility',hidden:document.hidden});});
const invite=parseCode(new URLSearchParams(location.hash.slice(1)).get('room'));if(invite)$('#room-code').value=invite;
if(debug)window.__chex={get game(){return game;},get room(){return room;},get net(){return net;},get mode(){return mode;}};
