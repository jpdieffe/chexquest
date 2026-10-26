import {PROTOCOL,newCode,parseCode,validPacket,validConfig} from './protocol.js';
const PREFIX='chexquest-coop-v1-';
const advice=()=>/Android/i.test(navigator.userAgent)?'Allow Nearby devices / Local network for your browser in Android Settings, then retry.':'Allow local-network access if your browser asks. Check Wi-Fi isolation, or use a TURN relay in Connection help.';
function errorText(error){return ({'peer-unavailable':'That room is not hosted. Check the code and ask your friend to keep their tab open.','network':'The room service is unreachable. Check your connection and retry.','server-error':'The room service is unavailable. Try again shortly.','browser-incompatible':'This browser does not support WebRTC. Use current Chrome or Safari.','webrtc':`Could not connect the two devices. ${advice()}`})[error?.type]||error?.message||String(error);}

export class Room{
  constructor(events={},settings={}){this.events=events;this.settings=settings;this.closed=false;this.accepted=false;this.started=false;}
  emit(name,...args){this.events[name]?.(...args);}
  async open(host,code){
    this.isHost=host;this.code=host?newCode():parseCode(code);
    if(!this.code)throw new Error('Enter a two-character room code.');
    const iceServers=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:global.stun.twilio.com:3478'}];
    if(this.settings.turn)iceServers.push({urls:this.settings.turn,username:this.settings.username,credential:this.settings.credential});
    const options={debug:0,config:{iceServers}};
    if(this.settings.host)Object.assign(options,{host:this.settings.host,port:443,path:this.settings.path||'/',secure:true});
    for(let attempt=0;;attempt++){
      try{await this.reserve(host?PREFIX+this.code:undefined,options);break;}
      catch(error){this.peer?.destroy();if(this.closed||!host||error.type!=='unavailable-id'||attempt>=19)throw new Error(errorText(error));this.code=newCode();}
    }
    this.peer.on('error',error=>this.fail(errorText(error)));
    this.peer.on('disconnected',()=>{if(!this.closed&&!this.peer.destroyed)this.peer.reconnect();});
    this.peer.on('connection',connection=>{
      if(!this.isHost||this.connection||this.started){connection.on('open',()=>{connection.send({type:'busy'});setTimeout(()=>connection.close(),150);});return;}
      this.attach(connection);
    });
    if(!host)this.attach(this.peer.connect(PREFIX+this.code,{reliable:true,serialization:'binary',metadata:{protocol:PROTOCOL}}));
    this.heartbeat=setInterval(()=>{
      if(!this.accepted)return;
      if(performance.now()-this.lastHeard>15000){this.connection?.close();return;}
      this.send({type:'ping',at:Date.now()});
    },2000);
    return this.code;
  }
  reserve(id,options){
    const peer=this.peer=new Peer(id,options);
    return new Promise((resolve,reject)=>{
      const finish=error=>{clearTimeout(timer);peer.off('open',onOpen);peer.off('error',onError);this.cancelOpen=null;error?reject(error):resolve();};
      const onOpen=()=>finish(),onError=error=>finish(error);
      const timer=setTimeout(()=>finish(new Error('The room service did not respond. Try again.')),20000);
      this.cancelOpen=()=>finish(new Error('Room closed.'));peer.on('open',onOpen);peer.on('error',onError);
    });
  }
  attach(connection){
    this.connection=connection;this.lastHeard=performance.now();
    const timeout=()=>this.fail(`Room found, but the devices could not connect. ${advice()}`);
    this.connectTimer=setTimeout(timeout,30000);
    connection.peerConnection?.addEventListener('iceconnectionstatechange',()=>{
      if(this.connection!==connection)return;
      if(connection.peerConnection.iceConnectionState==='checking')this.emit('status','Room found. Connecting to your friend...');
      if(connection.peerConnection.iceConnectionState==='failed')timeout();
    });
    connection.on('open',()=>{if(this.closed){connection.close();return;}if(!this.isHost)this.send({type:'hello',protocol:PROTOCOL});});
    connection.on('data',message=>{
      if(this.connection!==connection||!message)return;
      this.lastHeard=performance.now();
      if(message.type==='busy'){this.fail('This room already has two players or has started. Ask the host to create a new room.');return;}
      if(message.type==='hello'&&this.isHost&&!this.accepted){
        if(message.protocol!==PROTOCOL){this.fail('Game versions differ. Both players should reload.');return;}
        this.accepted=true;clearTimeout(this.connectTimer);this.send({type:'welcome',protocol:PROTOCOL});this.emit('connected');return;
      }
      if(message.type==='welcome'&&!this.isHost&&!this.accepted&&message.protocol===PROTOCOL){this.accepted=true;clearTimeout(this.connectTimer);this.emit('connected');return;}
      if(!this.accepted)return;
      if(message.type==='ipx'){
        const data=message.data instanceof ArrayBuffer?new Uint8Array(message.data):message.data;
        if(validPacket(data))this.emit('packet',data);
      }else if(message.type==='launch'&&!this.isHost&&validConfig(message))this.emit('launch',message);
      else if(message.type==='ping'&&Number.isFinite(message.at))this.send({type:'pong',at:message.at});
      else if(message.type==='pong'&&Number.isFinite(message.at))this.emit('latency',Math.max(0,Date.now()-message.at));
      else if(message.type==='visibility'&&typeof message.hidden==='boolean')this.emit('visibility',message.hidden);
      else if(message.type==='ready')this.emit('ready');
    });
    connection.on('close',()=>{
      if(this.connection!==connection)return;
      const accepted=this.accepted;this.accepted=false;this.connection=null;clearTimeout(this.connectTimer);
      if(!this.closed&&accepted)this.emit('disconnected');
    });
    connection.on('error',error=>this.fail(errorText(error)));
  }
  send(message){if(!this.connection?.open)return false;try{this.connection.send(message);return true;}catch{return false;}}
  fail(message){clearTimeout(this.connectTimer);if(!this.accepted){const connection=this.connection;this.connection=null;connection?.close();}this.emit('error',message);}
  close(){this.closed=true;this.cancelOpen?.();clearInterval(this.heartbeat);clearTimeout(this.connectTimer);this.connection?.close();this.peer?.destroy();this.accepted=false;}
}

// The emulator's supported Net interface carries its original IPX packets over
// the room's WebRTC data channel. Both devices run the actual CHEX.EXE game.
export class IpxNet{
  constructor(room){this.room=room;this.peerId=room.isHost?1:2;this.remoteId=room.isHost?2:1;this.connected=new Set();this.queue=[];this.sent=0;this.received=0;}
  wait(){}
  async registerAlias(){}
  unregisterAlias(){}
  async queryAliases(){return [];}
  sendBinary(data,peerId){
    if(!validPacket(data)||peerId!==this.remoteId)return -1;
    if(!this.room.accepted)return 0;
    if(this.room.send({type:'ipx',data:data.slice()})){this.sent++;this.connected.add(peerId);return data.length;}return 0;
  }
  receive(data){if(this.queue.length>=1024){this.room.fail('The game connection fell too far behind. Create a new room.');return;}this.queue.push({data:data.slice(),peerId:this.remoteId});this.received++;}
  recvBinary(){return this.queue.shift()||null;}
  disconnect(peerId){this.connected.delete(peerId);}
}
