// Execute the actual asset generator with Babylon vector/normal math and texture/mesh stubs.
// This verifies every generated vertex/index and upward deck normals without a browser canvas.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { VertexData as BabylonVertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js';
const source=fs.readFileSync(new URL('../src/bay-bridge.ts',import.meta.url),'utf8');
const code=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext})
  .replace(/^import .*?;\r?\n/,'').replace('export function buildBayBridge','function buildBayBridge');
class Mesh {constructor(name){this.name=name;this.enabled=true;}setEnabled(v){this.enabled=v;}dispose(){this.disposed=true;}}
class Material {dispose(){}}
class DynamicTexture {getContext(){return {fillRect(){},strokeRect(){},fillText(){}};}update(){}dispose(){}}
class VertexData {
  static ComputeNormals(...args){BabylonVertexData.ComputeNormals(...args);}
  applyToMesh(mesh){mesh.geometry=this;}
}
const build=new Function('Color3','DynamicTexture','Mesh','StandardMaterial','Texture','Vector3','VertexData',`${code}\nreturn buildBayBridge;`)
  (Color3,DynamicTexture,Mesh,Material,{TRILINEAR_SAMPLINGMODE:3},Vector3,VertexData);
const data=JSON.parse(fs.readFileSync(new URL('../public/data/bay-bridge.json',import.meta.url),'utf8'));
const shadowCasters=new Set();const shadows={addShadowCaster(mesh){shadowCasters.add(mesh);},removeShadowCaster(mesh){shadowCasters.delete(mesh);}};
const start=performance.now(),asset=build({},data,shadows,()=>0);
let vertices=0,triangles=0,minY=Infinity,maxY=-Infinity,minDeckNormalY=1,deckTriangles=0;
for(const mesh of asset.meshes){
  const g=mesh.geometry,count=g.positions.length/3;vertices+=count;triangles+=g.indices.length/3;
  assert.equal(g.normals.length,g.positions.length);
  assert(g.positions.every(Number.isFinite),`${mesh.name}: non-finite vertex`);
  assert(g.normals.every(Number.isFinite),`${mesh.name}: non-finite normal`);
  assert(g.indices.every(i=>Number.isInteger(i)&&i>=0&&i<count),`${mesh.name}: invalid index`);
  for(let i=1;i<g.positions.length;i+=3){minY=Math.min(minY,g.positions[i]);maxY=Math.max(maxY,g.positions[i]);}
  if(mesh.name.startsWith('Bay bridge deck')){
    deckTriangles+=g.indices.length/3;
    for(let i=1;i<g.normals.length;i+=3){minDeckNormalY=Math.min(minDeckNormalY,g.normals[i]);assert(g.normals[i]>.95,'Non-upward deck normal');}
  }
}
assert(vertices<650000,'Bridge geometry unexpectedly exceeds vertex budget');
assert(asset.meshes.length<180,'Bridge unexpectedly exceeds material/chunk batch budget');
assert.equal(asset.excludedRoadIds.size,35);
assert.equal(asset.views.length,4);
assert.equal(shadowCasters.size,3,'Only the three local channel pylon batches should cast shadows');
asset.setDetail(20000);assert(asset.meshes.some(m=>!m.enabled));
asset.setDetail(1000);assert(asset.meshes.every(m=>m.enabled));
asset.setDetail(1000,asset.views[0].position);
const nearCangkou=asset.meshes.filter(m=>m.enabled).length;
assert(nearCangkou>0&&nearCangkou<asset.meshes.length);
asset.setDetail(1000,new Vector3(1000000,0,1000000));assert(asset.meshes.every(m=>!m.enabled));
asset.setDetail(1000,new Vector3(0,0,0));const nearZhanqiao=asset.meshes.filter(m=>m.enabled).length;
console.log(JSON.stringify({meshes:asset.meshes.length,collisionMeshes:asset.collisionMeshes.length,shadowCasters:shadowCasters.size,nearCangkou,nearZhanqiao,vertices,triangles,deckTriangles,minDeckNormalY,minY,maxY,buildMs:Math.round(performance.now()-start)}));
asset.dispose();assert(asset.meshes.every(m=>m.disposed));assert.equal(shadowCasters.size,0);
