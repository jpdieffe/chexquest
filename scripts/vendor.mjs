import {copyFile, mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
await mkdir('site/vendor',{recursive:true});
for(const name of ['emulators.js','wdosbox.js','wdosbox.wasm','wlibzip.js','wlibzip.wasm'])
  await copyFile(`node_modules/emulators/dist/${name}`,`site/vendor/${name}`);
await copyFile('node_modules/peerjs/dist/peerjs.min.js','site/vendor/peerjs.min.js');
await copyFile('node_modules/emulators/LICENSE','site/vendor/emulators-LICENSE.txt');
await copyFile('node_modules/peerjs/LICENSE','site/vendor/peerjs-LICENSE.txt');
const built=spawnSync(process.platform==='win32'?'python':'python3',['scripts/game.py'],{stdio:'inherit'});
if(built.status!==0)process.exit(built.status||1);
