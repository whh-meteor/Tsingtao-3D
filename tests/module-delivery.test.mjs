import test from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createHash,webcrypto} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {buildSync} from 'esbuild';
import {createModuleDelivery} from '../scripts/module-delivery.mjs';
import {splitAsset} from '../scripts/asset-chunks.mjs';

test('large executable modules are split losslessly with a digest, while the boot stays small',()=>{
 const source='/* 青岛 */\n'+Array.from({length:2500},(_,n)=>`const item${n}=${n};`).join('\n');
 const {manifest,parts}=createModuleDelivery({engine:{type:'chunk',fileName:'assets/engine-test.js',code:source},boot:{type:'chunk',fileName:'assets/boot-test.js',code:'ready()'}});
 assert.deepEqual(Object.keys(manifest),['/assets/engine-test.js']);const item=manifest['/assets/engine-test.js'];
 assert.ok(item.parts.every(p=>p.bytes<=32768));assert.equal(gunzipSync(Buffer.concat(item.parts.map(p=>parts.get(p.url)))).toString('utf8'),source);
 assert.equal(item.sha256,createHash('sha256').update(source).digest('hex'));
});

function persistentCaches(){const stores=new Map();return{async open(name){if(!stores.has(name))stores.set(name,new Map());const map=stores.get(name);return{async match(key){return map.get(typeof key==='string'?key:key.url)?.clone();},async put(key,response){map.set(typeof key==='string'?key:key.url,response.clone());},async delete(key){return map.delete(typeof key==='string'?key:key.url);},async keys(){return[...map.keys()].map(url=>new Request(url));}};}};}
function bootWorker(manifest,fetch,caches=persistentCaches()){
 const handlers=new Map(),messages=[];
 const code=buildSync({entryPoints:['worker/module-worker.ts'],bundle:true,write:false,platform:'browser',format:'iife',target:'es2022',define:{__MODULE_MANIFEST__:JSON.stringify(manifest)}}).outputFiles[0].text;
 runInNewContext(code,{fetch,caches,crypto:webcrypto,Response,Request,Headers,URL,Blob,TextDecoder,DecompressionStream,AbortController,setTimeout,clearTimeout,console,location:{origin:'https://qingdao.test'},clients:{async get(){return{postMessage:data=>messages.push(data)};},async claim(){}},async skipWaiting(){},addEventListener:(type,handler)=>handlers.set(type,handler)});
 return{messages,request(path,method='GET'){let answer;handlers.get('fetch')({request:new Request('https://qingdao.test'+path,{method}),clientId:'qa',respondWith:promise=>{answer=promise;}});return answer;}};
}
function fixture(){const source='export const landmark="回澜阁";\n'+Array.from({length:70},(_,n)=>`// ${n} ${Math.sin(n)}`).join('\n'),asset=splitAsset(Buffer.from(source),48),key='/assets/babylon-recovery-test.js';return{source,key,asset,manifest:{[key]:{encoding:'gzip',byteLength:Buffer.byteLength(source),sha256:createHash('sha256').update(source).digest('hex'),parts:asset.parts.map(p=>({url:p.url,bytes:p.bytes.length}))}},byURL:new Map(asset.parts.map(p=>[p.url,p.bytes]))};}

test('a worker reconstructs a failed engine from parts and preserves module MIME and exact source',async()=>{
 const f=fixture(),calls=new Map();let first=true;
 const worker=bootWorker(f.manifest,async(url)=>{assert.ok(url.startsWith('/data/segments/'));calls.set(url,(calls.get(url)||0)+1);if(first&&url===f.asset.parts[0].url){first=false;return new Response(new Uint8Array([1]),{status:200});}return new Response(f.byURL.get(url));});
 const response=await worker.request(f.key);assert.equal(response.status,200);assert.match(response.headers.get('Content-Type'),/javascript/);assert.equal(await response.text(),f.source);assert.equal(calls.get(f.asset.parts[0].url),2);
 assert.ok(worker.messages.some(m=>m.type==='complete'));assert.equal(worker.request('/data/scene.json'),undefined);assert.equal(worker.request(f.key,'POST'),undefined);
});

test('successful parts survive a page reload and only a failed part is downloaded again',async()=>{
 const f=fixture(),store=persistentCaches(),calls=new Map(),bad=f.asset.parts.at(-1).url;let fail=true;
 const fetch=async url=>{calls.set(url,(calls.get(url)||0)+1);return fail&&url===bad?new Response('unavailable',{status:503}):new Response(f.byURL.get(url));};
 const first=bootWorker(f.manifest,fetch,store);assert.equal((await first.request(f.key)).status,503);fail=false;
 const second=bootWorker(f.manifest,fetch,store);assert.equal(await(await second.request(f.key)).text(),f.source);
 for(const part of f.asset.parts)assert.equal(calls.get(part.url),part.url===bad?3:1);
 const third=bootWorker(f.manifest,async()=>{throw new Error('cached module should not require a network');},store);assert.equal(await(await third.request(f.key)).text(),f.source);
});

test('a valid gzip payload with the wrong module digest is rejected and removed from part caches',async()=>{
 const f=fixture();f.manifest[f.key].sha256='0'.repeat(64);const worker=bootWorker(f.manifest,async url=>new Response(f.byURL.get(url)));
 const response=await worker.request(f.key);assert.equal(response.status,503);assert.match(await response.text(),/完整性校验失败/);
});
