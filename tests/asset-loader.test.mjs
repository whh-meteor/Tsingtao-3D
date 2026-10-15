import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import {splitAsset} from '../scripts/asset-chunks.mjs';
const code=buildSync({entryPoints:['src/asset-loader.ts'],bundle:true,platform:'node',format:'esm',write:false}).outputFiles[0].contents;
const {fetchJSON,fetchBuffer,createBackgroundLoader,configureAssetChunks}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const originalFetch=globalThis.fetch;
test.afterEach(()=>{globalThis.fetch=originalFetch;configureAssetChunks({});});
test('a 200 response whose body connection closes is retried through complete JSON decoding',async()=>{
 const calls=[];globalThis.fetch=async(url,options)=>{calls.push(options);return calls.length===1?new Response(new ReadableStream({start(c){c.error(new TypeError('connection closed after 200'));}}),{status:200}):new Response('{"buildings":[]}');};
 assert.deepEqual(await fetchJSON('/data/city-overview.json',{retryDelayMs:0,timeoutMs:1000}),{buildings:[]});assert.equal(calls.length,2);assert.equal(calls[1].cache,'reload');
});
test('deadline covers a body that stalls after successful response headers',async()=>{
 let signal;globalThis.fetch=async(_url,options)=>{signal=options.signal;return{ok:true,arrayBuffer:()=>new Promise(()=>{})};};
 await assert.rejects(fetchJSON('/data/stalled.json',{attempts:1,timeoutMs:20}),/stalled.json/);assert.ok(signal.aborted);
});

function configureTestAsset(url,source,size=32){const asset=splitAsset(Buffer.from(source),size);configureAssetChunks({[url]:{encoding:'gzip',byteLength:Buffer.byteLength(source),parts:asset.parts.map(p=>({url:p.url,bytes:p.bytes.length}))}});return asset;}

test('a failed initial-map piece is retried without re-downloading successful pieces',async()=>{
 const source=JSON.stringify({buildings:Array.from({length:45},(_,id)=>({id,name:'青岛'+id}))}),asset=configureTestAsset('/data/scene-test.json',source);
 const counts=new Map(),byURL=new Map(asset.parts.map(p=>[p.url,p.bytes]));const broken=asset.parts.at(-1).url;let fail=true;
 globalThis.fetch=async url=>{counts.set(url,(counts.get(url)||0)+1);return url===broken&&fail?new Response('unavailable',{status:503}):new Response(byURL.get(url));};
 await assert.rejects(fetchJSON('/data/scene-test.json',{attempts:1,retryDelayMs:0}),/scene-test.json/);fail=false;
 const progress=[];assert.deepEqual(await fetchJSON('/data/scene-test.json',{onProgress:p=>progress.push(p)}),JSON.parse(source));
 for(const part of asset.parts)assert.equal(counts.get(part.url),part.url===broken?2:1);
 assert.equal(progress.at(-1).completed,asset.parts.length);assert.equal(progress.at(-1).loaded,progress.at(-1).total);
});

test('a short 200 piece is retried before gzip decoding, and downloads stay bounded',async()=>{
 const source=JSON.stringify({values:Array.from({length:100},(_,i)=>Math.sin(i))}),asset=configureTestAsset('/data/short-piece.json',source,24);const byURL=new Map(asset.parts.map(p=>[p.url,p.bytes]));let active=0,peak=0,short=true;
 globalThis.fetch=async url=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,1));active--;const data=byURL.get(url);if(short&&url===asset.parts[0].url){short=false;return new Response(data.subarray(0,2));}return new Response(data);};
 assert.deepEqual(await fetchJSON('/data/short-piece.json',{retryDelayMs:0}),JSON.parse(source));assert.ok(peak<=4);assert.equal(short,false);
});

test('binary chunking preserves exact terrain and wasm bytes',async()=>{
 const source=Buffer.from(Array.from({length:1024},(_,i)=>i%251)),asset=splitAsset(source,48);configureAssetChunks({'/terrain-test.f32':{encoding:'gzip',byteLength:source.length,parts:asset.parts.map(p=>({url:p.url,bytes:p.bytes.length}))}});const byURL=new Map(asset.parts.map(p=>[p.url,p.bytes]));globalThis.fetch=async url=>new Response(byURL.get(url));
 assert.deepEqual(Buffer.from(await fetchBuffer('/terrain-test.f32')),source);
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
