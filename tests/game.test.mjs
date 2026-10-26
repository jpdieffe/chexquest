import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('Original EXE/IWAD, all five co-op starts, geometry, and result-screen patch',()=>{
  const result=spawnSync(process.platform==='win32'?'python':'python3',['tests/game_test.py'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+result.stderr);
});
