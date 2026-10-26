export const PROTOCOL='chexquest-native-coop-v1';
export const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function parseCode(value){const code=String(value||'').trim().toUpperCase();return code.length===2&&[...code].every(c=>ALPHABET.includes(c))?code:null;}
export function newCode(){const n=new Uint8Array(2);crypto.getRandomValues(n);return [...n].map(v=>ALPHABET[v%ALPHABET.length]).join('');}
export function validConfig(data){return data&&Number.isInteger(data.level)&&data.level>=1&&data.level<=5&&Number.isInteger(data.skill)&&data.skill>=1&&data.skill<=4;}
export function validPacket(data){return data instanceof Uint8Array&&data.length>0&&data.length<=2048;}
