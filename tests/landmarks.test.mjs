import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { mkdtempSync, writeFileSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// NullEngine tests actual generated geometry. Canvas is a drawing sink here;
// appearance and typography are separately inspected in the browser.
globalThis.OffscreenCanvas=class {
  constructor(w,h){this.width=w;this.height=h;}
  getContext(){return new Proxy({canvas:this,measureText:()=>({width:100}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})}, {get(t,k){return k in t?t[k]:()=>{};},set(t,k,v){t[k]=v;return true;}});}
};
const dir=mkdtempSync(join(tmpdir(),'qingdao-landmarks-'));
const output=join(dir,'models.mjs');
const bundle=buildSync({stdin:{contents:`export { buildPavilion } from './src/pavilion.ts';export { buildStation } from './src/station.ts';export { NullEngine } from '@babylonjs/core/Engines/nullEngine';export { Scene, Vector3 } from './src/babylon.ts';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
writeFileSync(output,bundle.outputFiles[0].contents);
const {buildPavilion,buildStation,NullEngine,Scene,Vector3}=await import(pathToFileURL(output));
const data=JSON.parse(readFileSync(new URL('../public/data/scene.json',import.meta.url),'utf8'));
const shadows={addShadowCaster(){},removeShadowCaster(){}};
function bounds(meshes){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const mesh of meshes){mesh.computeWorldMatrix(true);const p=mesh.getVerticesData('position');assert.ok(p?.length>0);assert.ok(p.every(Number.isFinite),'all coordinates finite');const ix=mesh.getIndices();assert.ok(ix.every(i=>i>=0&&i<p.length/3),'indices within vertex buffer');assert.ok(mesh.getVerticesData('normal').every(Number.isFinite));const b=mesh.getBoundingInfo().boundingBox;for(let i=0;i<3;i++){min[i]=Math.min(min[i],b.minimumWorld.asArray()[i]);max[i]=Math.max(max[i],b.maximumWorld.asArray()[i]);}}return {min,max};}
test('Huilan geometry remains metre scale at its geographic anchor',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),p=new Vector3(-81.69,3.84,-223.4),model=buildPavilion(scene,p,shadows),b=bounds(model.meshes);
 assert.ok(model.meshes.length<=12,'material batches stay bounded');
 const roof=model.meshes.find(m=>m.name.includes('YELLOW'));const n=roof.getVerticesData('normal');const y=n.filter((_,i)=>i%3===1);assert.ok(y.reduce((s,v)=>s+v,0)/y.length>.70,'glazed roofs must face upward for sunlight');
 assert.ok(b.max[0]-b.min[0]>16&&b.max[0]-b.min[0]<22,'roof span matches photo-informed metre scale');
 assert.ok(b.max[1]-p.y>10&&b.max[1]-p.y<14,'double roof remains building scale');
 assert.ok(Math.abs((b.max[0]+b.min[0])/2-p.x)<1);
 assert.ok(Math.abs((b.max[2]+b.min[2])/2-p.z)<1);
 model.dispose();scene.dispose();engine.dispose();
});
test('Station replaces all source buildings and keeps geometry geographically aligned',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),model=buildStation(scene,data,shadows,()=>7),b=bounds(model.meshes);
 for(const id of ['way/1465995439','way/1465995441','way/1465995440'])assert.ok(model.excludedIds.has(id),'source building replaced: '+id);
 const source=data.buildings.filter(f=>model.excludedIds.has(String(f.id))).flatMap(f=>f.polygon);
 const x=source.map(p=>p[0]),z=source.map(p=>p[1]);
 assert.ok(b.min[0]>=Math.min(...x)-30&&b.max[0]<=Math.max(...x)+30,'model retains source easting extent');
 assert.ok(b.min[2]>=Math.min(...z)-30&&b.max[2]<=Math.max(...z)+30,'model retains source northing extent');
 assert.ok(b.max[1]-7>=32&&b.max[1]-7<=39,'clock tower keeps documented height control');
 assert.ok(model.meshes.length<=32,'station does not create a draw call per window');
 model.dispose();scene.dispose();engine.dispose();
});
process.on('exit',()=>{unlinkSync(output);rmdirSync(dir);});
