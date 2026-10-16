import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {buildSync} from 'esbuild';
import {assetChunksPlugin,imageFiles} from '../scripts/asset-chunks.mjs';
const code=buildSync({entryPoints:['src/image-resources.ts'],bundle:true,platform:'node',format:'esm',write:false}).outputFiles[0].text;
const {ImageResources,verifyPNG,criticalImageURLs}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const png=readFileSync('public/data/detail-land-mask.png'),bytes=png.buffer.slice(png.byteOffset,png.byteOffset+png.byteLength),sha=createHash('sha256').update(png).digest('hex');

test('build manifest includes lossless chunked PNGs with original digests, covering every critical texture',()=>{
 const plugin=assetChunksPlugin(),emitted=[];plugin.configResolved({command:'build'});
 const source=plugin.load.call({emitFile:file=>emitted.push(file)},plugin.resolveId('virtual:asset-chunks'));
 const manifest=JSON.parse(source.replace(/^export default /,'').replace(/;$/,''));
 const blobs=new Map(emitted.map(p=>['/'+p.fileName,p.source]));
 for(const url of imageFiles()){
  const spec=manifest[url],original=readFileSync('public'+url);assert.ok(spec.parts.every(p=>p.bytes<=32768));
  assert.deepEqual(gunzipSync(Buffer.concat(spec.parts.map(p=>blobs.get(p.url)))),original);
  assert.equal(spec.sha256,createHash('sha256').update(original).digest('hex'));
 }
 const read=name=>JSON.parse(readFileSync('public/data/'+name+'.json','utf8'));
 for(const url of criticalImageURLs(read('scene'),read('region'),read('beaches')))assert.ok(manifest[url]?.sha256,url);
 assert.ok(blobs.has('/image-delivery.json'));
});
test('HTTP HTML substitutes, truncated PNGs and equal-length corrupted pixels fail before decoding',async()=>{
 await assert.rejects(verifyPNG(new TextEncoder().encode('<html>not an image</html>').buffer,sha),/PNG/);
 await assert.rejects(verifyPNG(bytes.slice(0,50),sha),/校验/);
 const bad=png.slice();bad[50]^=1;
 await assert.rejects(verifyPNG(bad.buffer.slice(bad.byteOffset,bad.byteOffset+bad.length),sha),/校验/);
 await verifyPNG(bytes,sha);
});
test('a failed image can be retried, while a successful decoded image is reused and released',async()=>{
 let calls=0,decoded=0,released=0;const image={naturalWidth:16,naturalHeight:16};
 const resources=new ImageResources(async()=>{if(++calls===1)throw new Error('body closed');return bytes;},async()=>{decoded++;return{image,release:()=>released++};});
 await assert.rejects(resources.load('/mask.png',sha),/body closed/);assert.throws(()=>resources.get('/mask.png'),/尚未准备/);
 await Promise.all([resources.load('/mask.png',sha),resources.load('/mask.png',sha)]);
 assert.equal(calls,2);assert.equal(decoded,1);assert.equal(resources.get('/mask.png'),image);resources.dispose();assert.equal(released,1);
});
test('a corrupt PNG cannot reach image decoding or texture upload',async()=>{
 let decoded=0;const resources=new ImageResources(async()=>bytes.slice(0,50),async()=>{decoded++;throw new Error('must not decode');});
 await assert.rejects(resources.load('/bad.png',sha),/校验/);assert.equal(decoded,0);
});
test('only a failed primary image switches to a commit-pinned same-file backup with digest verification',async()=>{
 const calls=[],notices=[],backup='https://raw.githubusercontent.com/whh-meteor/Tsingtao-3D/'+'a'.repeat(40)+'/public/data/mask.png';
 const images=new ImageResources(async url=>{calls.push(url);if(url==='/mask.png')throw new Error('primary closed');return bytes;},async()=>({image:{},release(){}}),url=>notices.push(url));
 const result=await images.load('/mask.png',sha,backup);assert.deepEqual(calls,['/mask.png',backup]);assert.equal(result.source,backup);assert.deepEqual(notices,['/mask.png']);
 const goodCalls=[],good=new ImageResources(async url=>{goodCalls.push(url);return bytes;},async()=>({image:{},release(){}}));
 await good.load('/mask.png',sha,backup);assert.deepEqual(goodCalls,['/mask.png']);
});
test('untrusted backup locations are ignored and corrupted backup data cannot reach the decoder',async()=>{
 let decoded=0;const calls=[],images=new ImageResources(async url=>{calls.push(url);if(url==='/mask.png')throw new Error('primary closed');return bytes.slice(0,50);},async()=>{decoded++;return{image:{},release(){}};});
 await assert.rejects(images.load('/mask.png',sha,'https://example.invalid/mask.png'),/primary closed/);assert.deepEqual(calls,['/mask.png']);
 const backup='https://raw.githubusercontent.com/whh-meteor/Tsingtao-3D/'+'a'.repeat(40)+'/public/data/mask.png';
 await assert.rejects(images.load('/mask.png',sha,backup),/均未完整/);assert.equal(decoded,0);
});
