import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'qingdao-upgrade-')),file=join(dir,'upgrade.mjs');
globalThis.OffscreenCanvas=class{constructor(w,h){this.width=w;this.height=h;}getContext(){return new Proxy({canvas:this,measureText:()=>({width:100}),createLinearGradient:()=>({addColorStop(){}})},{get(t,k){return k in t?t[k]:()=>{};},set(t,k,v){t[k]=v;return true;}});}};
const result=buildSync({stdin:{contents:`export {createBeachSurface,buildBeaches} from './src/beaches.ts';export {createHeritageSurface} from './src/heritage-buildings.ts';export {buildCityOverview} from './src/city-overview.ts';export {buildCivicBuildings} from './src/civic-buildings.ts';export {buildCivicPlazas} from './src/civic-plazas.ts';export {stableShadowPosition} from './src/render-stability.ts';export {NullEngine} from '@babylonjs/core/Engines/nullEngine';export {Scene,Vector3} from './src/babylon.ts';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});writeFileSync(file,result.outputFiles[0].contents);
const {createBeachSurface,buildBeaches,createHeritageSurface,buildCityOverview,buildCivicBuildings,buildCivicPlazas,stableShadowPosition,NullEngine,Scene,Vector3}=await import(pathToFileURL(file));
const read=name=>JSON.parse(readFileSync(new URL('../public/data/'+name,import.meta.url),'utf8'));
test('wet sand joins the real coastline and the dry source surface without editing non-beach land',()=>{
 const feature={id:'beach',polygon:[[0,0],[60,0],[60,40],[0,40]],holes:[[[30,10],[40,10],[40,20],[30,20]]],shorelines:[[[0,0],[60,0]]],position:[10,10],mesh:{vertices:[],indices:[],spacing:5}};
 const surface=createBeachSurface({beaches:[feature]},()=>4);
 assert.equal(surface.sampleSurface(10,0),.12);assert.equal(surface.sampleSurface(10,30),4);assert.equal(surface.sampleSurface(35,15),null);assert.equal(surface.sampleSurface(-1,0),null);assert.ok(surface.sampleSurface(10,12)>.12&&surface.sampleSurface(10,12)<4);
});
test('beach distance LOD never uploads an infinite inverse bump strength and restores near detail',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),feature={id:'beach',polygon:[[0,0],[60,0],[0,40]],shorelines:[[[0,0],[60,0]]],position:[10,10],mesh:{vertices:[[0,0],[60,0],[0,40]],indices:[0,1,2],spacing:5}},model=buildBeaches(scene,{beaches:[feature]},()=>3),mesh=model.meshes.find(m=>m.metadata.kind==='geographic-beach'),near=mesh.material;
 for(const radius of [20,600,1200,2199,2200,2201,2400,12000,190000,2400,2200,200]){model.setDetail(radius);const material=mesh.material;if(material.bumpTexture){assert.ok(material.bumpTexture.level>0);assert.ok(Number.isFinite(1/material.bumpTexture.level));}else assert.ok(radius>2200);assert.equal(material.diffuseTexture,near.diffuseTexture,'LOD retains the same sand colour and mipmaps');assert.deepEqual(material.emissiveColor.asArray(),[0,0,0]);}
 assert.equal(mesh.material,near);assert.ok(near.bumpTexture.level>.1);model.dispose();scene.dispose();engine.dispose();
});
test('brewery floors are evaluated from raw DEM once and do not create recursive height feedback',()=>{
 let calls=0;const sampler=(x,z)=>{calls++;return 18+x*.005+z*.01;};const surface=createHeritageSurface(read('heritage.json'),sampler);assert.equal(surface.grades.length,4);
 for(const g of surface.grades){const p=g.polygon.reduce((a,q)=>[a[0]+q[0]/g.polygon.length,a[1]+q[1]/g.polygon.length],[0,0]),before=calls;assert.equal(surface.sampleSurface(...p),g.height);assert.equal(calls,before);}
 assert.equal(surface.sampleSurface(-50000,-50000),null);
});
test('far city batches remain visible until a complete medium group replaces them, without coexistence',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);const rows=[['one',100,100,20,12,15,0,1],['two',9000,100,30,14,45,0,1]];const model=buildCityOverview(scene,{buildings:rows},()=>3,new Set());
 model.update(()=>false);assert.ok(model.meshes.every(m=>m.isEnabled()));model.update(k=>k==='0_0');assert.ok(model.meshes.filter(m=>m.metadata.groupKey==='0_0').every(m=>!m.isEnabled()));assert.ok(model.meshes.filter(m=>m.metadata.groupKey==='1_0').every(m=>m.isEnabled()));
 for(const m of model.meshes){assert.ok(m.getVerticesData('position').every(Number.isFinite));assert.ok(m.getIndices().every(i=>i<m.getTotalVertices()));}model.dispose();scene.dispose();engine.dispose();
});
test('shadow texel quantization preserves light-space depth and ignores sub-texel translations',()=>{
 const dir=new Vector3(.3,.8,.5).normalize(),focus=Vector3.Zero(),right=Vector3.Cross(dir,Vector3.Up()).normalize(),a=stableShadowPosition(focus,dir),b=stableShadowPosition(right.scale(.1),dir);assert.ok(Vector3.Distance(a,b)<1e-5);assert.ok(Math.abs(Vector3.Dot(a,dir)-1100)<1e-5);
});
test('new data uses individual real metro ways and source buildings with explicit height provenance',()=>{
 const metro=read('metro.json'),city=read('city-overview.json'),civic=read('civic-landmarks.json');assert.equal(metro.lines.length,8);assert.equal(city.buildings.length,23758);assert.ok(metro.lines.every(l=>l.segments.every(s=>s.id&&s.points.length>=2&&s.points.flat().every(Number.isFinite))));assert.ok(civic.coastalBuildings.every(b=>b.id&&b.polygon.length>=3&&typeof b.estimatedHeight==='boolean'));assert.ok(civic.governmentBuildings.some(b=>b.id==='way/275858482'));
});
test('TV tower and May Wind replace all generic footprints and preserve known overall dimensions',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),data=read('civic-landmarks.json'),shadows={addShadowCaster(){},removeShadowCaster(){}},civic=buildCivicBuildings(scene,data,shadows,()=>35),plazas=buildCivicPlazas(scene,data,shadows,()=>3);
 assert.ok(civic.excludedBuildingIds.has('way/179057050'));assert.ok(civic.excludedBuildingIds.has('way/275858482'));assert.ok(plazas.excludedBuildingIds.has('relation/20812582'),'multipolygon generic sculpture must be excluded too');
 const tower=civic.meshes.filter(m=>m.metadata.landmarkId==='tv-tower'&&m.isVisible),top=Math.max(...tower.map(m=>m.getBoundingInfo().boundingBox.maximumWorld.y));assert.ok(Math.abs(top-35-232)<1);
 const sculpture=plazas.meshes.find(m=>m.metadata.sourceId==='way/539970693'),b=sculpture.getBoundingInfo().boundingBox;assert.ok(Math.abs(b.maximumWorld.y-3-30)<.01);assert.ok(Math.abs(Math.max(b.maximumWorld.x-b.minimumWorld.x,b.maximumWorld.z-b.minimumWorld.z)-27)<.01);
 const normals=sculpture.getVerticesData('normal');assert.ok(normals[280*36*3+4*6*3+1]>.5,'upper steel face must face the sun, not inward');assert.deepEqual(sculpture.material.emissiveColor.asArray(),[0,0,0],'daytime red comes from sunlight, not whole-object emission');
 for(const m of [...civic.meshes,...plazas.meshes])assert.ok(m.getVerticesData('position').every(Number.isFinite));civic.setNight(1,10);plazas.setNight(1,10);civic.setNight(0);plazas.setNight(0);assert.ok(scene.lights.filter(l=>l.name.includes('uplight')).every(l=>l.intensity===0));civic.dispose();plazas.dispose();scene.dispose();engine.dispose();
});
process.on('exit',()=>rmSync(dir,{recursive:true}));
