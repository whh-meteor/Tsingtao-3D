import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildSync} from 'esbuild';
import {splitAsset,imageFiles} from './asset-chunks.mjs';
import path from 'node:path';
import {sourceCommit} from './source-commit.mjs';

function sourceRevision(){
 const hash=createHash('sha256');
 const walk=directory=>readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(item=>item.isDirectory()?walk(path.join(directory,item.name)):[path.join(directory,item.name)]);
 // Data-derived virtual modules and the compression runtime affect emitted JS.
 const region=JSON.parse(readFileSync('public/data/region.json','utf8'));
 const data=['scene.json','region.json','heritage.json','bay-bridge.json','beaches.json','civic-landmarks.json','city-overview.json','regional-roads.json','regional-land.json','metro.json','chunks/index.json'].map(name=>'public/data/'+name);
 data.push(...[region.terrain,region.detailTerrain,...region.landmarkTerrain||[]].map(grid=>'public'+grid.file));
 data.push(...imageFiles().map(url=>'public'+url));
 for(const file of [...walk('src'),...walk('worker'),...walk('scripts'),'vite.config.ts','package.json','package-lock.json',...data].sort()){hash.update(file.replaceAll('\\','/'));hash.update('\0');hash.update(readFileSync(file));}
 hash.update(sourceCommit());hash.update(process.platform+'/'+process.version+'/'+process.versions.zlib);return hash.digest('hex').slice(0,16);
}

export function createModuleDelivery(bundle){
 const manifest={},parts=new Map();
 for(const item of Object.values(bundle)){
  if(item.type!=='chunk'||Buffer.byteLength(item.code)<=24576)continue;
  const source=Buffer.from(item.code),asset=splitAsset(source);
  manifest['/'+item.fileName]={encoding:asset.encoding,byteLength:asset.byteLength,sha256:createHash('sha256').update(source).digest('hex'),parts:asset.parts.map(part=>({url:part.url,bytes:part.bytes.length}))};
  for(const part of asset.parts)parts.set(part.url,part.bytes);
 }
 return{manifest,parts};
}
export function moduleDeliveryPlugin(){
 const version=JSON.parse(readFileSync('package.json','utf8')).version;
 const revision=sourceRevision();
 return{name:'qingdao-program-delivery',
  resolveId(id){if(id==='virtual:module-worker-url')return'\0qingdao-module-worker-url';},
  load(id){if(id==='\0qingdao-module-worker-url')return`export default ${JSON.stringify('/module-worker.js?v='+version+'&rev='+revision)}`;},
  generateBundle:{order:'post',handler(_options,bundle){
   const {manifest,parts}=createModuleDelivery(bundle);
   for(const[url,source]of parts)this.emitFile({type:'asset',fileName:url.slice(1),source});
   const code=buildSync({entryPoints:['worker/module-worker.ts'],bundle:true,write:false,platform:'browser',format:'iife',target:'es2022',minify:true,define:{__MODULE_MANIFEST__:JSON.stringify(manifest)}}).outputFiles[0].contents;
   this.emitFile({type:'asset',fileName:'module-worker.js',source:code});
   this.emitFile({type:'asset',fileName:'module-delivery.json',source:JSON.stringify({version,revision,modules:manifest})});
   this.info(`${Object.keys(manifest).length}个大型程序模块使用32 KiB分块交付，共${parts.size}块`);
  }}
 };
}
