import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import path from 'node:path';

// Opaque 32 KiB files avoid restarting a whole multi-megabyte transfer.
export function splitAsset(source,chunkSize=32768){
 const compressed=gzipSync(source,{level:9}),hash=createHash('sha256').update(compressed).digest('hex').slice(0,20);
 const parts=[];for(let offset=0;offset<compressed.length;offset+=chunkSize){const bytes=compressed.subarray(offset,offset+chunkSize);parts.push({url:`/data/segments/${hash}-${parts.length}.bin`,bytes});}
 return{encoding:'gzip',byteLength:source.length,parts};
}

export function imageFiles(){
 const paths=new Set();
 const walk=value=>{if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')for(const [key,item]of Object.entries(value)){if(key==='url'&&typeof item==='string'&&/^\/data\/[\w-]+\.png$/.test(item))paths.add(item);walk(item);}};
 for(const name of ['scene','region','beaches'])walk(JSON.parse(readFileSync('public/data/'+name+'.json','utf8')));
 return[...paths].sort();
}

export function assetChunksPlugin(){
 const virtual='virtual:asset-chunks',resolved='\0'+virtual;let development=false,built;
 function prepare(){
  if(built)return built;
  const region=JSON.parse(readFileSync('public/data/region.json','utf8'));
  const files=['scene.json','region.json','heritage.json','bay-bridge.json','beaches.json','civic-landmarks.json','city-overview.json','regional-roads.json','regional-land.json','metro.json','chunks/index.json'].map(name=>['/data/'+name,'public/data/'+name]);
  for(const grid of [region.terrain,region.detailTerrain,...region.landmarkTerrain||[]])files.push([grid.file,'public'+grid.file]);
  files.push(...imageFiles().map(url=>[url,'public'+url]));
  files.push(['havok','node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm']);
  const manifest={},blobs=new Map();
  for(const [key,file]of files){const bytes=readFileSync(path.resolve(file)),asset=splitAsset(bytes);manifest[key]={encoding:asset.encoding,byteLength:asset.byteLength,...(key.endsWith('.png')?{sha256:createHash('sha256').update(bytes).digest('hex')}:{ }),parts:asset.parts.map(p=>({url:p.url,bytes:p.bytes.length}))};for(const part of asset.parts)blobs.set(part.url,part.bytes);}
  return built={manifest,blobs};
 }
 return{name:'qingdao-small-asset-transfers',
  configResolved(config){development=config.command==='serve';},
  resolveId(id){if(id===virtual)return resolved;},
  load(id){if(id!==resolved)return;const {manifest,blobs}=prepare();if(!development){for(const[url,source]of blobs)this.emitFile({type:'asset',fileName:url.slice(1),source});this.emitFile({type:'asset',fileName:'image-delivery.json',source:JSON.stringify({version:JSON.parse(readFileSync('package.json','utf8')).version,images:Object.fromEntries(Object.entries(manifest).filter(([url])=>url.endsWith('.png')))})});}return`export default ${JSON.stringify(manifest)}`;},
  configureServer(server){server.middlewares.use((req,res,next)=>{const bytes=prepare().blobs.get((req.url||'').split('?')[0]);if(!bytes)return next();res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Length',bytes.length);res.setHeader('Cache-Control','public, max-age=31536000, immutable');res.end(bytes);});}
 };
}
