import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import {mkdtempSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {nightFogStrength,coastalFogEnvelope} from '../src/atmosphere.ts';

const dir=mkdtempSync(join(tmpdir(),'qingdao-atmosphere-')),file=join(dir,'fog.mjs');
const bundle=buildSync({stdin:{contents:`export {createSeaFog} from './src/sea-fog.ts';export {NullEngine} from '@babylonjs/core/Engines/nullEngine';export {Scene,ArcRotateCamera,FreeCamera,Vector3,FxaaPostProcess,MeshBuilder} from './src/babylon.ts';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
writeFileSync(file,bundle.outputFiles[0].contents);
const {createSeaFog,NullEngine,Scene,ArcRotateCamera,FreeCamera,Vector3,FxaaPostProcess,MeshBuilder}=await import(pathToFileURL(file));
process.on('exit',()=>{unlinkSync(file);rmdirSync(dir);});

test('sea fog fades through twilight and is absent from daytime / sunset previews',()=>{
 assert.equal(nightFogStrength(1),0);assert.equal(nightFogStrength(.6),0);assert.equal(nightFogStrength(0),1);
 let previous=1;
 for(let d=0;d<=1;d+=.01){const value=nightFogStrength(d);assert.ok(value>=0&&value<=previous);previous=value;}
 assert.ok(nightFogStrength(.16)>.49&&nightFogStrength(.16)<.51);
});

test('fog follows the active camera, precedes FXAA, and stops depth rendering during day',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 const orbit=new ArcRotateCamera('orbit',-1.9,1.1,500,Vector3.Zero(),scene);
 const free=new FreeCamera('fly',new Vector3(0,10,0),scene);
 const fxaa=new FxaaPostProcess('fxaa',1,orbit);free.attachPostProcess(fxaa);
 const coast={regional:{url:'region',bounds:{minX:-4000,minZ:-4000,maxX:4000,maxZ:4000}},local:{url:'local',bounds:{minX:-1000,minZ:-1000,maxX:1000,maxZ:1000}},distanceRange:4096};
 const fog=createSeaFog(scene,coast,()=>({wrapU:0,wrapV:0}));scene.activeCamera=orbit;
 const passes=c=>c._postProcesses.filter(Boolean);
 fog.update(0,1,true);assert.equal(scene._depthRenderer,undefined);
 fog.update(1,0,true);
 const first=passes(orbit)[0];assert.equal(first.name,'night-sea-fog');assert.equal(passes(orbit)[1],fxaa);
 const depth=scene._depthRenderer.orbit;assert.ok(depth.enabled);assert.ok(depth.useOnlyInActiveCamera);
 const sky=MeshBuilder.CreateSphere('sky',{},scene);sky.infiniteDistance=true;
 const building=MeshBuilder.CreateBox('streamed-building',{},scene);
 assert.equal(depth.getDepthMap().renderListPredicate(sky),false);
 assert.equal(depth.getDepthMap().renderListPredicate(building),true);
 fog.update(2,0,false);assert.equal(passes(orbit).filter(p=>p===first).length,1);
 scene.activeCamera=free;fog.update(3,0,false);
 assert.ok(!depth.enabled);assert.deepEqual(passes(orbit),[fxaa]);assert.equal(passes(free)[0],first);
 assert.ok(scene._depthRenderer.fly.enabled);
 fog.update(4,1,true);assert.ok(!scene._depthRenderer.fly.enabled);assert.deepEqual(passes(free),[fxaa]);
 scene.activeCamera=orbit;fog.update(5,0,true);assert.equal(scene._depthRenderer.orbit,depth);assert.ok(depth.enabled);
 scene.dispose();engine.dispose();
});

test('fog stays in a coastal strip with a bounded advancing front, leaving deep inland and open sea clear',()=>{
 for(let front=90;front<=510;front+=30){
  assert.equal(coastalFogEnvelope(-2000,front),0,'open sea is clear');
  assert.equal(coastalFogEnvelope(650,front),0,'inland is clear for every front phase');
  assert.equal(coastalFogEnvelope(5000,front),0,'deep inland never has fog');
  assert.equal(coastalFogEnvelope(-500,front),1,'banks originate on the sea side');
  assert.ok(coastalFogEnvelope(0,front)>.85,'the bank crosses the actual coastline');
 }
 assert.ok(coastalFogEnvelope(300,510)>coastalFogEnvelope(300,90),'the leading edge advances into coastal blocks');
});
