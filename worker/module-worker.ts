import {configureAssetChunks,fetchBuffer,forgetAssetChunks,type ChunkedAsset} from '../src/asset-loader';

declare const __MODULE_MANIFEST__:Record<string,ChunkedAsset&{sha256:string}>;
const sw=globalThis as unknown as ServiceWorkerGlobalScope;
const manifest=__MODULE_MANIFEST__;
const PARTS='qingdao-program-parts-v1',MODULES='qingdao-program-modules-v1';
// Only this application's own immutable program URLs are intercepted.
const pending=new Map<string,{promise:Promise<Response>;clients:Set<string>}>();
async function cacheRead(name:string,url:string){try{return await(await caches.open(name)).match(url);}catch{return undefined;}}
async function cacheWrite(name:string,url:string,response:Response){try{await(await caches.open(name)).put(url,response);}catch{/* Storage denial only disables persistence. */}}
async function cacheDelete(name:string,url:string){try{await(await caches.open(name)).delete(url);}catch{}}
async function trim(name:string,limit:number){try{const cache=await caches.open(name),keys=await cache.keys();for(const key of keys.slice(0,Math.max(0,keys.length-limit)))await cache.delete(key);}catch{}}
configureAssetChunks(manifest,{
 async get(url){return(await cacheRead(PARTS,new URL(url,sw.location.origin).href))?.arrayBuffer();},
 async put(url,bytes){await cacheWrite(PARTS,new URL(url,sw.location.origin).href,new Response(bytes));await trim(PARTS,512);},
 async delete(url){await cacheDelete(PARTS,new URL(url,sw.location.origin).href);}
});
async function notify(ids:Set<string>,message:Record<string,unknown>){await Promise.all([...ids].map(async id=>{try{(await sw.clients.get(id))?.postMessage({channel:'qingdao-program',...message});}catch{}}));}
async function reconstruct(path:string,ids:Set<string>){
 const spec=manifest[path],url=new URL(path,sw.location.origin).href;
 const cached=await cacheRead(MODULES,url);
 if(cached?.headers.get('X-Qingdao-SHA256')===spec.sha256)return cached;
 try{
  const bytes=await fetchBuffer(path,{onProgress:progress=>void notify(ids,{type:'progress',file:path,...progress})});
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==spec.sha256){await forgetAssetChunks(path);throw new Error('程序完整性校验失败：'+path);}
  const response=new Response(bytes,{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'public, max-age=31536000, immutable','X-Qingdao-SHA256':spec.sha256}});
  await cacheWrite(MODULES,url,response.clone());await Promise.all([trim(PARTS,512),trim(MODULES,16)]);
  await notify(ids,{type:'complete',file:path});return response;
 }catch(error){const message=error instanceof Error?error.message:String(error);await notify(ids,{type:'error',file:path,message});return new Response(message,{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});}
}
sw.addEventListener('install',event=>event.waitUntil(sw.skipWaiting()));
sw.addEventListener('activate',event=>event.waitUntil(sw.clients.claim()));
// Fetch and verify programs BEFORE importing them. A failed native ES module
// import stays failed in the browser module map until a full page navigation.
sw.addEventListener('message',event=>{
 const data=event.data,client=event.source as Client|null;
 if(data?.channel!=='qingdao-program'||data.type!=='prepare'||!client?.id)return;
 event.waitUntil((async()=>{
  try{for(const path of Object.keys(manifest)){const response=await reconstruct(path,new Set([client.id]));if(!response.ok)throw new Error(await response.text());}
   client.postMessage({channel:'qingdao-program',type:'prepared',request:data.request,ok:true});
  }catch(error){client.postMessage({channel:'qingdao-program',type:'prepared',request:data.request,ok:false,message:error instanceof Error?error.message:String(error)});}
 })());
});
sw.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==sw.location.origin||!Object.hasOwn(manifest,url.pathname))return;
 let entry=pending.get(url.pathname);
 if(!entry){const ids=new Set<string>();if(event.clientId)ids.add(event.clientId);entry={clients:ids,promise:reconstruct(url.pathname,ids)};pending.set(url.pathname,entry);entry.promise.finally(()=>pending.delete(url.pathname));}
 else if(event.clientId)entry.clients.add(event.clientId);
 event.respondWith(entry.promise.then(response=>response.clone()));
});
