import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
const code=buildSync({entryPoints:['src/asset-loader.ts'],bundle:true,platform:'node',format:'esm',write:false}).outputFiles[0].contents;
const {fetchJSON,fetchBuffer,createBackgroundLoader}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const originalFetch=globalThis.fetch;
test.afterEach(()=>{globalThis.fetch=originalFetch;});
test('a 200 response whose body connection closes is retried through complete JSON decoding',async()=>{
 const calls=[];globalThis.fetch=async(url,options)=>{calls.push(options);return calls.length===1?new Response(new ReadableStream({start(c){c.error(new TypeError('connection closed after 200'));}}),{status:200}):new Response('{"buildings":[]}');};
 assert.deepEqual(await fetchJSON('/data/city-overview.json',{retryDelayMs:0,timeoutMs:1000}),{buildings:[]});assert.equal(calls.length,2);assert.equal(calls[1].cache,'reload');
});
test('deadline covers a body that stalls after successful response headers',async()=>{
 let signal;globalThis.fetch=async(_url,options)=>{signal=options.signal;return{ok:true,json:()=>new Promise(()=>{})};};
 await assert.rejects(fetchJSON('/data/stalled.json',{attempts:1,timeoutMs:20}),/stalled.json/);assert.ok(signal.aborted);
});
test('a permanent missing asset fails once with its URL, without repeated 404 requests',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return new Response('missing',{status:404});};
 await assert.rejects(fetchJSON('/data/missing.json',{retryDelayMs:0}),/missing.json/);assert.equal(calls,1);
});
test('binary engine downloads also retry incomplete bodies',async()=>{
 let calls=0;globalThis.fetch=async()=>++calls===1?{ok:true,arrayBuffer:async()=>{throw new TypeError('body interrupted');}}:new Response(new Uint8Array([0,97,115,109]));
 assert.deepEqual([...new Uint8Array(await fetchBuffer('/assets/engine.wasm',{retryDelayMs:0}))],[0,97,115,109]);assert.equal(calls,2);
});
test('optional failure does not reject startup and retry reloads only failed features',async(t)=>{
 t.mock.method(console,'warn',()=>{});
 let city=0,coast=0;const states=[],loader=createBackgroundLoader([{label:'city',load:async()=>{if(++city===1)throw new TypeError('network interrupted');}},{label:'coast',load:async()=>{coast++;}}],state=>states.push(state));
 await assert.doesNotReject(loader.run());assert.deepEqual(states.at(-1),{running:false,completed:1,total:2,failed:['city']});await loader.run();assert.deepEqual(states.at(-1),{running:false,completed:2,total:2,failed:[]});assert.equal(city,2);assert.equal(coast,1);
});
