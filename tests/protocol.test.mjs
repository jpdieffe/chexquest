import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCode,validPacket,validConfig,newCode} from '../site/protocol.js';
import {IpxNet} from '../site/room.js';
test('Two-character invitations validate and normalize',()=>{
  assert.equal(parseCode(' ab '),'AB');for(const code of ['','A','ABC','00','<A'])assert.equal(parseCode(code),null);
  for(let i=0;i<100;i++)assert.equal(parseCode(newCode())?.length,2);
});
test('Network packets and game configuration are bounded',()=>{
  assert(validPacket(new Uint8Array(80)));assert(!validPacket(new Uint8Array(2049)));assert(!validPacket(new Uint8Array()));assert(!validPacket([1,2]));
  assert(validConfig({level:5,skill:4}));for(const data of [{level:6,skill:2},{level:1,skill:0},{level:1.2,skill:2},null])assert(!validConfig(data));
});
test('IPX transport copies packets, routes only to the other player, and respects connection state',()=>{
  const messages=[],room={isHost:true,accepted:true,send:data=>{messages.push(data);return true;},fail:assert.fail},net=new IpxNet(room),packet=new Uint8Array([1,2,3]);
  assert.equal(net.sendBinary(packet,2),3);packet[0]=9;assert.equal(messages[0].data[0],1);assert.equal(net.sendBinary(packet,3),-1);
  net.receive(packet);packet[1]=9;assert.deepEqual(net.recvBinary(),{peerId:2,data:new Uint8Array([9,2,3])});assert.equal(net.recvBinary(),null);
  room.accepted=false;assert.equal(net.sendBinary(packet,2),0);
});
