import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
const code=buildSync({entryPoints:['src/resource-recovery.ts'],bundle:true,platform:'node',format:'esm',write:false}).outputFiles[0].text+'\nexport {AssetDownloadError};';
const {recoverResource,AssetDownloadError}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('interrupted startup resources retry with capped backoff without restarting the view',async()=>{
 let calls=0;const waits=[],messages=[];
 const value=await recoverResource('地图',async()=>{if(++calls<8)throw new AssetDownloadError('closed');return 'ready';},{wait:async ms=>waits.push(ms),report:text=>messages.push(text)});
 assert.equal(value,'ready');assert.deepEqual(waits,[3000,6000,12000,24000,30000,30000,30000]);assert.ok(messages.every(text=>text.includes('自动重试')));
});
test('permanently missing resources and model bugs are reported instead of endless retries',async()=>{
 let waits=0;const options={wait:async()=>waits++,report:()=>{}};
 await assert.rejects(recoverResource('missing',async()=>{throw new AssetDownloadError('404',true);},options),/404/);
 await assert.rejects(recoverResource('model',async()=>{throw new TypeError('model bug');},options),/model bug/);assert.equal(waits,0);
});
